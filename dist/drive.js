"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDriveClient = getDriveClient;
exports.createFolder = createFolder;
exports.uploadTextFile = uploadTextFile;
exports.uploadJsonFile = uploadJsonFile;
exports.updateJsonFile = updateJsonFile;
exports.uploadBinaryFile = uploadBinaryFile;
exports.readTextFile = readTextFile;
exports.readJsonFile = readJsonFile;
exports.copyFileToDrive = copyFileToDrive;
exports.listFilesInFolder = listFilesInFolder;
exports.downloadFileAsBase64 = downloadFileAsBase64;
exports.getFolderWebLink = getFolderWebLink;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const googleapis_1 = require("googleapis");
const http_1 = __importDefault(require("http"));
const url_1 = require("url");
const open_1 = __importDefault(require("open"));
const stream_1 = require("stream");
const ZOOMIES_DIR = path_1.default.join(os_1.default.homedir(), '.zoomies');
const TOKENS_FILE = path_1.default.join(ZOOMIES_DIR, 'tokens.json');
const OAUTH_PORT = 3000;
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/oauth2callback`;
const SCOPES = ['https://www.googleapis.com/auth/drive'];
function ensureZoomiesDir() {
    if (!fs_1.default.existsSync(ZOOMIES_DIR)) {
        fs_1.default.mkdirSync(ZOOMIES_DIR, { recursive: true });
    }
}
async function getOAuth2Client() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env\n' +
            'See README for Google Cloud project setup instructions.');
    }
    const oauth2Client = new googleapis_1.google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
    ensureZoomiesDir();
    if (fs_1.default.existsSync(TOKENS_FILE)) {
        const tokens = JSON.parse(fs_1.default.readFileSync(TOKENS_FILE, 'utf-8'));
        oauth2Client.setCredentials(tokens);
        // Auto-refresh if expired
        oauth2Client.on('tokens', (newTokens) => {
            const stored = JSON.parse(fs_1.default.readFileSync(TOKENS_FILE, 'utf-8'));
            const merged = { ...stored, ...newTokens };
            fs_1.default.writeFileSync(TOKENS_FILE, JSON.stringify(merged, null, 2));
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
        const server = http_1.default.createServer(async (req, res) => {
            try {
                if (!req.url?.startsWith('/oauth2callback'))
                    return;
                const urlObj = new url_1.URL(req.url, `http://localhost:${OAUTH_PORT}`);
                const code = urlObj.searchParams.get('code');
                if (!code) {
                    res.end('No authorization code received. Please try again.');
                    server.close();
                    reject(new Error('No authorization code received'));
                    return;
                }
                const { tokens } = await oauth2Client.getToken(code);
                oauth2Client.setCredentials(tokens);
                fs_1.default.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
                console.log(`✅ Tokens saved to ${TOKENS_FILE}`);
                res.end(`
          <html><body style="font-family:monospace;padding:40px">
            <h2>✅ Zoomies authorized!</h2>
            <p>You can close this tab and return to the terminal.</p>
          </body></html>
        `);
                server.close();
                resolve(oauth2Client);
            }
            catch (err) {
                res.end('Authorization failed. Check the terminal for details.');
                server.close();
                reject(err);
            }
        });
        server.listen(OAUTH_PORT, () => {
            (0, open_1.default)(authUrl).catch(() => {
                console.log('Could not open browser automatically. Visit this URL:');
                console.log(authUrl);
            });
        });
    });
}
// ── Drive API helpers ─────────────────────────────────────────────────────────
async function getDriveClient() {
    // Server/hosted mode: use service account JSON (no browser required)
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        const auth = new googleapis_1.google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive'],
        });
        return googleapis_1.google.drive({ version: 'v3', auth: auth });
    }
    // Local dev: OAuth browser flow
    const auth = await getOAuth2Client();
    return googleapis_1.google.drive({ version: 'v3', auth });
}
async function createFolder(driveClient, name, parentId) {
    const res = await driveClient.files.create({
        requestBody: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
        },
        fields: 'id',
    });
    const id = res.data.id;
    if (!id)
        throw new Error(`Failed to create folder: ${name}`);
    return id;
}
async function uploadTextFile(driveClient, name, content, parentId) {
    const stream = stream_1.Readable.from([content]);
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
    if (!id)
        throw new Error(`Failed to upload file: ${name}`);
    return id;
}
async function uploadJsonFile(driveClient, name, data, parentId) {
    const content = JSON.stringify(data, null, 2);
    const stream = stream_1.Readable.from([content]);
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
    if (!id)
        throw new Error(`Failed to upload JSON: ${name}`);
    return id;
}
async function updateJsonFile(driveClient, fileId, data) {
    const content = JSON.stringify(data, null, 2);
    const stream = stream_1.Readable.from([content]);
    await driveClient.files.update({
        fileId,
        media: {
            mimeType: 'application/json',
            body: stream,
        },
    });
}
async function uploadBinaryFile(driveClient, name, filePath, mimeType, parentId) {
    const fileStream = fs_1.default.createReadStream(filePath);
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
    if (!id)
        throw new Error(`Failed to upload binary file: ${name}`);
    return id;
}
async function readTextFile(driveClient, fileId) {
    const res = await driveClient.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    return new Promise((resolve, reject) => {
        const chunks = [];
        res.data
            .on('data', (chunk) => chunks.push(chunk))
            .on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
            .on('error', reject);
    });
}
async function readJsonFile(driveClient, fileId) {
    const res = await driveClient.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    return new Promise((resolve, reject) => {
        const chunks = [];
        res.data
            .on('data', (chunk) => chunks.push(chunk))
            .on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
            }
            catch (err) {
                reject(err);
            }
        })
            .on('error', reject);
    });
}
async function copyFileToDrive(driveClient, fileId, newName, destinationFolderId) {
    const res = await driveClient.files.copy({
        fileId,
        requestBody: {
            name: newName,
            parents: [destinationFolderId],
        },
        fields: 'id',
    });
    const id = res.data.id;
    if (!id)
        throw new Error(`Failed to copy file: ${newName}`);
    return id;
}
async function listFilesInFolder(driveClient, folderId) {
    const res = await driveClient.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)',
    });
    return (res.data.files || []);
}
/** Download a Drive file and return its bytes as a base64 string. */
async function downloadFileAsBase64(driveClient, fileId) {
    const res = await driveClient.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return Buffer.from(res.data).toString('base64');
}
async function getFolderWebLink(driveClient, fileId) {
    const res = await driveClient.files.get({
        fileId,
        fields: 'webViewLink',
    });
    return res.data.webViewLink || `https://drive.google.com/drive/folders/${fileId}`;
}
//# sourceMappingURL=drive.js.map