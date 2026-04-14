/**
 * Zoomies Drive Test Script
 * Tests: OAuth flow, folder creation, doc creation, rename
 */
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { URL } from 'url';
import { exec } from 'child_process';

const ZOOMIES_DIR = path.join(os.homedir(), '.zoomies');
const TOKENS_FILE = path.join(ZOOMIES_DIR, 'tokens.json');
const OAUTH_PORT = 3001; // use 3001 to avoid conflict with approval UI
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/oauth2callback`;

const CLIENT_ID = '193524302614-klpa8vdg1ebess4p0lkc1rk61402rqhi.apps.googleusercontent.com';
const CLIENT_SECRET = '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';

const SCOPES = ['https://www.googleapis.com/auth/drive'];

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getAuth() {
  if (!fs.existsSync(ZOOMIES_DIR)) fs.mkdirSync(ZOOMIES_DIR, { recursive: true });

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

  if (fs.existsSync(TOKENS_FILE)) {
    const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8'));
    oauth2Client.setCredentials(tokens);
    oauth2Client.on('tokens', (newTokens) => {
      const stored = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8'));
      fs.writeFileSync(TOKENS_FILE, JSON.stringify({ ...stored, ...newTokens }, null, 2));
      console.log('🔄 Tokens auto-refreshed');
    });
    console.log('✅ Loaded stored tokens from ~/.zoomies/tokens.json');
    return oauth2Client;
  }

  // First run — OAuth consent
  return new Promise((resolve, reject) => {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    console.log('\n🔑 Google Drive authorization required.');
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  Opening browser for Google OAuth consent...                │');
    console.log('│  If it doesn\'t open automatically, visit this URL:          │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log('\n' + authUrl + '\n');

    // Try to open browser
    exec(`open "${authUrl}"`, (err) => {
      if (err) console.log('Could not auto-open browser — please visit the URL above.');
    });

    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith('/oauth2callback')) return;
      const urlObj = new URL(req.url, `http://localhost:${OAUTH_PORT}`);
      const code = urlObj.searchParams.get('code');
      if (!code) { res.end('No code'); server.close(); reject(new Error('No code')); return; }

      try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
        console.log(`✅ Tokens saved → ${TOKENS_FILE}`);
        res.end(`<html><body style="font-family:monospace;padding:40px;background:#0f0e0c;color:#f5f2eb">
          <h2>✅ Zoomies authorized!</h2><p>Close this tab and return to the terminal.</p>
        </body></html>`);
        server.close();
        resolve(oauth2Client);
      } catch (err) {
        res.end('Authorization failed');
        server.close();
        reject(err);
      }
    });

    server.listen(OAUTH_PORT, () => {
      console.log(`Waiting for OAuth callback on port ${OAUTH_PORT}...`);
    });
  });
}

// ── Drive helpers ─────────────────────────────────────────────────────────────

function log(icon, msg) { console.log(`  ${icon}  ${msg}`); }

async function createFolder(drive, name, parentId) {
  const res = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : [] },
    fields: 'id, name, webViewLink',
  });
  return res.data;
}

async function createDoc(drive, title, parentId) {
  const res = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: 'application/vnd.google-apps.document',
      parents: parentId ? [parentId] : [],
    },
    fields: 'id, name, webViewLink',
  });
  return res.data;
}

async function renameFile(drive, fileId, newName) {
  const res = await drive.files.update({
    fileId,
    requestBody: { name: newName },
    fields: 'id, name',
  });
  return res.data;
}

async function listFolder(drive, folderId) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
    orderBy: 'createdTime',
  });
  return res.data.files || [];
}

// ── Test suite ────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   ZOOMIES — Google Drive Integration Test      ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const auth = await getAuth();
  const drive = google.drive({ version: 'v3', auth });

  // ── TEST 1: Create root test folder ─────────────────────────────────────────
  console.log('\n── TEST 1: Create Folders ──────────────────────────────────────\n');

  const rootFolder = await createFolder(drive, '🎬 Zoomies Test — DELETE ME', null);
  log('📁', `Created root folder: "${rootFolder.name}"`);
  log('🔗', rootFolder.webViewLink);

  const cwbhFolder = await createFolder(drive, 'The Real Catwives of Beverly Hills', rootFolder.id);
  log('📁', `Created show folder: "${cwbhFolder.name}"`);

  const bhbFolder = await createFolder(drive, 'CSI: Bloodhound Bureau', rootFolder.id);
  log('📁', `Created show folder: "${bhbFolder.name}"`);

  const season1 = await createFolder(drive, 'Season 1', cwbhFolder.id);
  log('📁', `Created season folder: "${season1.name}"`);

  const episodeFolder = await createFolder(drive, 'Episode 1 — Claws Out at Brunch', season1.id);
  log('📁', `Created episode folder: "${episodeFolder.name}"`);

  const workingFolder = await createFolder(drive, 'Working', episodeFolder.id);
  log('📁', `Created: Working/`);

  const sc01Folder = await createFolder(drive, 'SC01_Beverly_Hills_Mansion', workingFolder.id);
  log('📁', `Created scene folder: SC01_Beverly_Hills_Mansion`);

  const approvedFolder = await createFolder(drive, '_APPROVED', episodeFolder.id);
  log('📁', `Created: _APPROVED/`);

  const deliveryFolder = await createFolder(drive, '_Final_Delivery', episodeFolder.id);
  log('📁', `Created: _Final_Delivery/`);

  console.log('\n  ✅ All folders created successfully\n');

  // ── TEST 2: Create Documents ─────────────────────────────────────────────────
  console.log('── TEST 2: Create Documents ────────────────────────────────────\n');

  const shotListDoc = await createDoc(
    drive,
    'Episode1_Shot_List',
    episodeFolder.id
  );
  log('📄', `Created: "${shotListDoc.name}"`);
  log('🔗', shotListDoc.webViewLink);

  const promptDoc = await createDoc(
    drive,
    'CWBH_S1E1_SC01_SC01-SH01_PROMPT',
    sc01Folder.id
  );
  log('📄', `Created prompt file: "${promptDoc.name}"`);

  console.log('\n  ✅ Documents created successfully\n');

  // ── TEST 3: Rename Documents ─────────────────────────────────────────────────
  console.log('── TEST 3: Rename Documents ────────────────────────────────────\n');

  const renamed1 = await renameFile(drive, shotListDoc.id, 'Episode1_Shot_List_FINAL');
  log('✏️ ', `Renamed: "Episode1_Shot_List" → "${renamed1.name}"`);

  const renamed2 = await renameFile(drive, episodeFolder.id, 'Episode 1 — Claws Out at Brunch ✓');
  log('✏️ ', `Renamed episode folder → "${renamed2.name}"`);

  console.log('\n  ✅ Rename operations successful\n');

  // ── TEST 4: List folder contents ─────────────────────────────────────────────
  console.log('── TEST 4: List Folder Contents ────────────────────────────────\n');

  const contents = await listFolder(drive, episodeFolder.id);
  log('📋', `Contents of episode folder (${contents.length} items):`);
  for (const f of contents) {
    const icon = f.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄';
    console.log(`        ${icon} ${f.name}`);
  }

  console.log('\n  ✅ List operation successful\n');

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   ALL TESTS PASSED ✅                          ║');
  console.log('╠════════════════════════════════════════════════╣');
  console.log(`║  Root test folder: ${rootFolder.id.slice(0, 26)}  ║`);
  console.log('╠════════════════════════════════════════════════╣');
  console.log('║  Next step: set ZOOMIES_DRIVE_ROOT_FOLDER_ID  ║');
  console.log('║  in .env to a real production folder ID.      ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`\n🔗 View test folder: ${rootFolder.webViewLink}\n`);
  console.log(`⚠️  Remember to delete the test folder when done.\n`);
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
