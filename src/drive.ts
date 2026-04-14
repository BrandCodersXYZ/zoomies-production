import fs from 'fs';
import path from 'path';
import os from 'os';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import http from 'http';
import { URL } from 'url';
import open from 'open';
import { Readable } from 'stream';

const ZOOMIES_DIR = path.join(os.homedir(), '.zoomies');
const TOKENS_FILE = path.join(ZOOMIES_DIR, 'tokens.json');
const OAUTH_PORT = 3000;
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/oauth2callback`;

const SCOPES = ['https://www.googleapis.com/auth/drive'];

function ensureZoomiesDir(): void {
  if (!fs.existsSync(ZOOMIES_DIR)) {
    fs.mkdirSync(ZOOMIES_DIR, { recursive: true });
  }
}

async function getOAuth2Client(): Promise<OAuth2Client> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env\n' +
        'See README for Google Cloud project setup instructions.'
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  ensureZoomiesDir();

  if (fs.existsSync(TOKENS_FILE)) {
    const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8'));
    oauth2Client.setCredentials(tokens);

    // Auto-refresh if expired
    oauth2Client.on('tokens', (newTokens) => {
      const stored = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8'));
      const merged = { ...stored, ...newTokens };
      fs.writeFileSync(TOKENS_FILE, JSON.stringify(merged, null, 2));
    });

    return oauth2Client;
  }

  // First run — OAuth consent flow
  return new Promise((resolve, reject) => {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    console.log('\n🔑 Google Drive authorization required.');
    console.log('Opening browser for OAuth consent...\n');

    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url?.startsWith('/oauth2callback')) return;

        const urlObj = new URL(req.url, `http://localhost:${OAUTH_PORT}`);
        const code = urlObj.searchParams.get('code');

        if (!code) {
          res.end('No authorization code received. Please try again.');
          server.close();
          reject(new Error('No authorization code received'));
          return;
        }

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
        console.log(`✅ Tokens saved to ${TOKENS_FILE}`);

        res.end(`
          <html><body style="font-family:monospace;padding:40px">
            <h2>✅ Zoomies authorized!</h2>
            <p>You can close this tab and return to the terminal.</p>
          </body></html>
        `);

        server.close();
        resolve(oauth2Client);
      } catch (err) {
        res.end('Authorization failed. Check the terminal for details.');
        server.close();
        reject(err);
      }
    });

    server.listen(OAUTH_PORT, () => {
      open(authUrl).catch(() => {
        console.log('Could not open browser automatically. Visit this URL:');
        console.log(authUrl);
      });
    });
  });
}

// ── Drive API helpers ─────────────────────────────────────────────────────────

export async function getDriveClient() {
  // Server/hosted mode: use service account JSON (no browser required)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    return google.drive({ version: 'v3', auth: auth as unknown as OAuth2Client });
  }
  // Local dev: OAuth browser flow
  const auth = await getOAuth2Client();
  return google.drive({ version: 'v3', auth });
}

export async function createFolder(
  driveClient: ReturnType<typeof google.drive>,
  name: string,
  parentId: string
): Promise<string> {
  const res = await driveClient.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });

  const id = res.data.id;
  if (!id) throw new Error(`Failed to create folder: ${name}`);
  return id;
}

export async function uploadTextFile(
  driveClient: ReturnType<typeof google.drive>,
  name: string,
  content: string,
  parentId: string
): Promise<string> {
  const stream = Readable.from([content]);

  const res = await driveClient.files.create({
    requestBody: {
      name,
      parents: [parentId],
      mimeType: 'text/plain',
    },
    media: {
      mimeType: 'text/plain',
      body: stream,
    },
    fields: 'id, webViewLink',
  });

  const id = res.data.id;
  if (!id) throw new Error(`Failed to upload file: ${name}`);
  return id;
}

export async function uploadJsonFile(
  driveClient: ReturnType<typeof google.drive>,
  name: string,
  data: unknown,
  parentId: string
): Promise<string> {
  const content = JSON.stringify(data, null, 2);
  const stream = Readable.from([content]);

  const res = await driveClient.files.create({
    requestBody: {
      name,
      parents: [parentId],
      mimeType: 'application/json',
    },
    media: {
      mimeType: 'application/json',
      body: stream,
    },
    fields: 'id',
  });

  const id = res.data.id;
  if (!id) throw new Error(`Failed to upload JSON: ${name}`);
  return id;
}

export async function updateJsonFile(
  driveClient: ReturnType<typeof google.drive>,
  fileId: string,
  data: unknown
): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  const stream = Readable.from([content]);

  await driveClient.files.update({
    fileId,
    media: {
      mimeType: 'application/json',
      body: stream,
    },
  });
}

export async function uploadBinaryFile(
  driveClient: ReturnType<typeof google.drive>,
  name: string,
  filePath: string,
  mimeType: string,
  parentId: string
): Promise<string> {
  const fileStream = fs.createReadStream(filePath);

  const res = await driveClient.files.create({
    requestBody: {
      name,
      parents: [parentId],
      mimeType,
    },
    media: {
      mimeType,
      body: fileStream,
    },
    fields: 'id',
  });

  const id = res.data.id;
  if (!id) throw new Error(`Failed to upload binary file: ${name}`);
  return id;
}

export async function readTextFile(
  driveClient: ReturnType<typeof google.drive>,
  fileId: string
): Promise<string> {
  const res = await driveClient.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    (res.data as NodeJS.ReadableStream)
      .on('data', (chunk: Buffer) => chunks.push(chunk))
      .on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      .on('error', reject);
  });
}

export async function readJsonFile<T>(
  driveClient: ReturnType<typeof google.drive>,
  fileId: string
): Promise<T> {
  const res = await driveClient.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    (res.data as NodeJS.ReadableStream)
      .on('data', (chunk: Buffer) => chunks.push(chunk))
      .on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T);
        } catch (err) {
          reject(err);
        }
      })
      .on('error', reject);
  });
}

export async function copyFileToDrive(
  driveClient: ReturnType<typeof google.drive>,
  fileId: string,
  newName: string,
  destinationFolderId: string
): Promise<string> {
  const res = await driveClient.files.copy({
    fileId,
    requestBody: {
      name: newName,
      parents: [destinationFolderId],
    },
    fields: 'id',
  });

  const id = res.data.id;
  if (!id) throw new Error(`Failed to copy file: ${newName}`);
  return id;
}

export async function listFilesInFolder(
  driveClient: ReturnType<typeof google.drive>,
  folderId: string
): Promise<Array<{ id: string; name: string; mimeType: string }>> {
  const res = await driveClient.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
  });

  return (res.data.files || []) as Array<{ id: string; name: string; mimeType: string }>;
}

/** Download a Drive file and return its bytes as a base64 string. */
export async function downloadFileAsBase64(
  driveClient: ReturnType<typeof google.drive>,
  fileId: string
): Promise<string> {
  const res = await driveClient.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data as ArrayBuffer).toString('base64');
}

export async function getFolderWebLink(
  driveClient: ReturnType<typeof google.drive>,
  fileId: string
): Promise<string> {
  const res = await driveClient.files.get({
    fileId,
    fields: 'webViewLink',
  });
  return res.data.webViewLink || `https://drive.google.com/drive/folders/${fileId}`;
}
