/**
 * Quick check — verify access to the Zoomies production root folder
 */
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TOKENS_FILE = path.join(os.homedir(), '.zoomies', 'tokens.json');
const ROOT_FOLDER_ID = '1bOd2LBY1UOM1TLQbxy6l9sF46tw7yvfb';

const CLIENT_ID = '193524302614-klpa8vdg1ebess4p0lkc1rk61402rqhi.apps.googleusercontent.com';
const CLIENT_SECRET = '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';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8'));
oauth2Client.setCredentials(tokens);

const drive = google.drive({ version: 'v3', auth: oauth2Client });

// 1. Get folder metadata
const meta = await drive.files.get({
  fileId: ROOT_FOLDER_ID,
  fields: 'id, name, mimeType, webViewLink, capabilities',
});

const f = meta.data;
const caps = f.capabilities;

console.log('\n🎬 Zoomies Production Root Folder\n');
console.log(`  Name:       ${f.name}`);
console.log(`  ID:         ${f.id}`);
console.log(`  Link:       ${f.webViewLink}`);
console.log(`  Can edit:   ${caps?.canEdit ?? 'unknown'}`);
console.log(`  Can add:    ${caps?.canAddChildren ?? 'unknown'}`);
console.log(`  Can rename: ${caps?.canRename ?? 'unknown'}`);

// 2. List existing contents
const list = await drive.files.list({
  q: `'${ROOT_FOLDER_ID}' in parents and trashed = false`,
  fields: 'files(id, name, mimeType)',
  orderBy: 'createdTime',
});

const contents = list.data.files || [];
console.log(`\n  Contents (${contents.length} items):`);
if (contents.length === 0) {
  console.log('    (empty — ready for first intake)');
} else {
  for (const item of contents) {
    const icon = item.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄';
    console.log(`    ${icon} ${item.name}`);
  }
}

// 3. Write test: create a placeholder and immediately delete it
const test = await drive.files.create({
  requestBody: {
    name: '.zoomies-write-test',
    mimeType: 'application/vnd.google-apps.folder',
    parents: [ROOT_FOLDER_ID],
  },
  fields: 'id',
});

await drive.files.delete({ fileId: test.data.id });
console.log('\n  Write access: ✅ confirmed (created + deleted test folder)\n');
console.log('╔══════════════════════════════════════════════════╗');
console.log('║  Root folder connected. Pipeline is ready. 🎬   ║');
console.log('╚══════════════════════════════════════════════════╝\n');
