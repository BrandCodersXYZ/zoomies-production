"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startApprovalServer = startApprovalServer;
exports.startHostedServer = startHostedServer;
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const path_1 = __importDefault(require("path"));
const intake_1 = require("./intake");
const drive_1 = require("./drive");
const slack_1 = require("./slack");
const PORT = parseInt(process.env.PORT || '3333', 10);
// ── Auth middleware ───────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
    const token = process.env.TEAM_TOKEN;
    if (!token)
        return next(); // No token set → open access (local dev)
    const cookie = req.cookies?.zoomies_session;
    if (cookie === token)
        return next();
    if (req.path === '/login')
        return next();
    if (req.path.startsWith('/api/')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    res.redirect('/login');
}
let episodeCache = null;
let episodeCacheAt = 0;
const CACHE_TTL_MS = 60000;
async function discoverEpisodes() {
    if (episodeCache && Date.now() - episodeCacheAt < CACHE_TTL_MS)
        return episodeCache;
    const rootId = process.env.ZOOMIES_DRIVE_ROOT_FOLDER_ID;
    if (!rootId)
        throw new Error('ZOOMIES_DRIVE_ROOT_FOLDER_ID not set');
    const drive = await (0, drive_1.getDriveClient)();
    // Find all Shot_List.json files under the root (one API call, walks entire tree)
    const res = await drive.files.list({
        q: `name contains 'Shot_List.json' and '${rootId}' in ancestors and trashed=false`,
        fields: 'files(id, name, parents)',
        pageSize: 100,
    });
    const cards = [];
    for (const file of res.data.files || []) {
        try {
            const ep = await (0, drive_1.readJsonFile)(drive, file.id);
            const approved = ep.shots.filter((s) => s.approval_status === 'APPROVED').length;
            const rejected = ep.shots.filter((s) => s.approval_status === 'REJECTED').length;
            cards.push({
                folderId: file.parents?.[0] ?? '',
                shotListFileId: file.id,
                show: ep.show,
                season: ep.season,
                episode: ep.episode,
                title: ep.title,
                shotCount: ep.shots.length,
                approvedCount: approved,
                rejectedCount: rejected,
                pendingCount: ep.shots.length - approved - rejected,
            });
        }
        catch { /* skip unreadable files */ }
    }
    cards.sort((a, b) => a.show.localeCompare(b.show) || a.season - b.season || a.episode - b.episode);
    episodeCache = cards;
    episodeCacheAt = Date.now();
    return cards;
}
function invalidateCache() { episodeCache = null; }
// ── Scene folder map from Working folder ─────────────────────────────────────
async function getSceneFolderMap(workingFolderId, scenes) {
    const drive = await (0, drive_1.getDriveClient)();
    const res = await drive.files.list({
        q: `'${workingFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        pageSize: 100,
    });
    const map = {};
    for (const f of res.data.files || []) {
        for (const scene of scenes) {
            if (f.name?.startsWith(scene.id + '_') || f.name === scene.id) {
                map[scene.id] = f.id;
                break;
            }
        }
    }
    return map;
}
// ── Folder map discovery (no local state required) ────────────────────────────
async function getEpisodeFolders(episodeFolderId) {
    const drive = await (0, drive_1.getDriveClient)();
    const res = await drive.files.list({
        q: `'${episodeFolderId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType)',
        pageSize: 20,
    });
    const map = {};
    for (const f of res.data.files || [])
        map[f.name] = f.id;
    return {
        workingFolderId: map['Working'] ?? '',
        approvedFolderId: map['_APPROVED'] ?? '',
        finalDeliveryFolderId: map['_Final_Delivery'] ?? '',
    };
}
// ── Server setup ──────────────────────────────────────────────────────────────
function buildServer() {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use((0, cookie_parser_1.default)());
    app.use(authMiddleware);
    // ── Login page ──────────────────────────────────────────────────────────────
    app.get('/login', (_req, res) => {
        res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Zoomies — Login</title>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'DM Mono',monospace;background:#f5f2eb;color:#0f0e0c;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .box{background:#fff;border:1px solid #c8c2b6;border-radius:4px;padding:40px;width:360px;text-align:center}
    h1{font-family:'Syne',sans-serif;font-weight:800;font-size:1.4rem;margin-bottom:8px;letter-spacing:.04em}
    p{font-size:.78rem;color:#7a7570;margin-bottom:28px}
    input{width:100%;font-family:'DM Mono',monospace;font-size:.88rem;padding:10px 12px;border:1px solid #c8c2b6;border-radius:3px;margin-bottom:16px;outline:none;background:#fafaf8}
    input:focus{border-color:#0f0e0c}
    button{width:100%;font-family:'Syne',sans-serif;font-weight:700;font-size:.88rem;letter-spacing:.06em;text-transform:uppercase;padding:12px;background:#0f0e0c;color:#f5f2eb;border:none;border-radius:3px;cursor:pointer}
    .err{color:#8b1a1a;font-size:.75rem;margin-top:12px}
  </style>
</head>
<body>
  <div class="box">
    <h1>ZOOMIES</h1>
    <p>Enter your team access token to continue.</p>
    <form method="POST" action="/login">
      <input type="password" name="token" placeholder="Access token" autofocus/>
      <button type="submit">Enter</button>
    </form>
    ${'' /* error handled by query param below */}
  </div>
</body>
</html>`);
    });
    app.post('/login', express_1.default.urlencoded({ extended: false }), (req, res) => {
        const { token } = req.body;
        if (token === process.env.TEAM_TOKEN) {
            res.cookie('zoomies_session', token, { httpOnly: true, sameSite: 'lax' });
            res.redirect('/');
        }
        else {
            res.redirect('/login?error=1');
        }
    });
    // ── Directory (home) ────────────────────────────────────────────────────────
    app.get('/', (_req, res) => {
        const htmlPath = path_1.default.join(__dirname, '..', 'ui', 'directory.html');
        res.sendFile(path_1.default.resolve(htmlPath));
    });
    // ── Approval UI (per episode) ───────────────────────────────────────────────
    app.get('/episode/:folderId', (_req, res) => {
        const htmlPath = path_1.default.join(__dirname, '..', 'ui', 'approval.html');
        res.sendFile(path_1.default.resolve(htmlPath));
    });
    // ── API: episode list ───────────────────────────────────────────────────────
    app.get('/api/episodes', async (_req, res) => {
        try {
            const episodes = await discoverEpisodes();
            res.json({ episodes });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // ── API: single episode data (by Drive folder ID) ───────────────────────────
    app.get('/api/episode/:folderId', async (req, res) => {
        try {
            const { folderId } = req.params;
            const drive = await (0, drive_1.getDriveClient)();
            // Find shot list JSON in this folder
            const listing = await drive.files.list({
                q: `'${folderId}' in parents and name contains 'Shot_List.json' and trashed=false`,
                fields: 'files(id,name)',
                pageSize: 5,
            });
            const file = listing.data.files?.[0];
            if (!file) {
                res.status(404).json({ error: 'Shot list not found in this folder' });
                return;
            }
            const episode = await (0, drive_1.readJsonFile)(drive, file.id);
            const folders = await getEpisodeFolders(folderId);
            res.json({
                episode,
                shotListFileId: file.id,
                episodeFolderDriveId: folderId,
                ...folders,
            });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // ── API: submit approvals (by Drive folder ID) ──────────────────────────────
    app.post('/api/submit/:folderId', async (req, res) => {
        try {
            const { folderId } = req.params;
            const { shots, shotListFileId } = req.body;
            const drive = await (0, drive_1.getDriveClient)();
            const episode = await (0, drive_1.readJsonFile)(drive, shotListFileId);
            const folders = await getEpisodeFolders(folderId);
            const approvalMap = new Map(shots.map((s) => [s.id, s]));
            let approvedCount = 0, rejectedCount = 0;
            const rejectionLines = [];
            episode.shots = episode.shots.map((shot) => {
                const d = approvalMap.get(shot.id);
                if (!d)
                    return shot;
                if (d.status === 'APPROVED')
                    approvedCount++;
                if (d.status === 'REJECTED') {
                    rejectedCount++;
                    if (d.rejection_notes)
                        rejectionLines.push(`${shot.id}: ${d.rejection_notes}`);
                }
                return { ...shot, approval_status: d.status, rejection_notes: d.rejection_notes };
            });
            await (0, drive_1.updateJsonFile)(drive, shotListFileId, episode);
            invalidateCache();
            // Move approved prompts to _APPROVED folder
            let moved = 0;
            const showCode = episode.show === 'catwives' ? 'CWBH' : 'BHB';
            if (folders.approvedFolderId) {
                for (const shot of episode.shots) {
                    if (shot.approval_status === 'APPROVED' && shot.prompt_drive_file_id) {
                        try {
                            await (0, drive_1.copyFileToDrive)(drive, shot.prompt_drive_file_id, `${showCode}_S${episode.season}E${episode.episode}_${shot.scene_id}_${shot.id}_PROMPT.txt`, folders.approvedFolderId);
                            moved++;
                        }
                        catch { /* non-fatal */ }
                    }
                }
            }
            // Rejection notes file
            if (rejectionLines.length > 0 && folders.workingFolderId) {
                await (0, drive_1.uploadTextFile)(drive, 'REJECTED_NOTES.txt', [
                    `REJECTED SHOTS — S${episode.season}E${episode.episode} ${episode.title}`,
                    `Generated: ${new Date().toISOString()}`, '',
                    ...rejectionLines,
                ].join('\n'), folders.workingFolderId);
            }
            // Update local state if it exists and matches this episode
            const localState = (0, intake_1.loadState)();
            if (localState?.episodeFolderDriveId === folderId) {
                localState.episode = episode;
                localState.lastUpdated = new Date().toISOString();
                (0, intake_1.saveState)(localState);
            }
            // Slack
            try {
                const approvedLink = folders.approvedFolderId
                    ? await (0, drive_1.getFolderWebLink)(drive, folders.approvedFolderId) : '';
                await (0, slack_1.notifyApprovalComplete)(episode, approvedCount, rejectedCount, approvedLink, rejectionLines.length > 0, folderId);
            }
            catch { /* non-fatal */ }
            res.json({
                success: true, approvedCount, rejectedCount, movedToApproved: moved,
                approvedFolderLink: folders.approvedFolderId
                    ? `https://drive.google.com/drive/folders/${folders.approvedFolderId}` : '',
                hasRejectionNotes: rejectionLines.length > 0,
            });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // ── Legacy: local-state routes (backward compat for `zoomies approve`) ──────
    app.get('/api/episode', async (_req, res) => {
        try {
            const state = (0, intake_1.loadState)();
            if (!state) {
                res.status(404).json({ error: 'No local state' });
                return;
            }
            const drive = await (0, drive_1.getDriveClient)();
            const episode = await (0, drive_1.readJsonFile)(drive, state.shotListJsonFileId);
            res.json({
                episode,
                shotListFileId: state.shotListJsonFileId,
                episodeFolderDriveId: state.episodeFolderDriveId,
                workingFolderId: state.workingFolderDriveId,
                approvedFolderId: state.approvedFolderDriveId,
            });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // Legacy submit (local state)
    app.post('/api/submit', async (req, res) => {
        const state = (0, intake_1.loadState)();
        if (!state) {
            res.status(404).json({ error: 'No local state' });
            return;
        }
        // Inject folderId and shotListFileId then delegate to the folder route handler
        req.params = { folderId: state.episodeFolderDriveId };
        req.body = { ...req.body, shotListFileId: state.shotListJsonFileId };
        // Re-use the folder submit logic inline
        const { shots, shotListFileId } = req.body;
        try {
            const drive = await (0, drive_1.getDriveClient)();
            const episode = await (0, drive_1.readJsonFile)(drive, shotListFileId);
            const approvalMap = new Map(shots.map((s) => [s.id, s]));
            let approvedCount = 0, rejectedCount = 0;
            const rejectionLines = [];
            episode.shots = episode.shots.map((shot) => {
                const d = approvalMap.get(shot.id);
                if (!d)
                    return shot;
                if (d.status === 'APPROVED')
                    approvedCount++;
                if (d.status === 'REJECTED') {
                    rejectedCount++;
                    if (d.rejection_notes)
                        rejectionLines.push(`${shot.id}: ${d.rejection_notes}`);
                }
                return { ...shot, approval_status: d.status, rejection_notes: d.rejection_notes };
            });
            await (0, drive_1.updateJsonFile)(drive, shotListFileId, episode);
            invalidateCache();
            let moved = 0;
            const showCode = episode.show === 'catwives' ? 'CWBH' : 'BHB';
            for (const shot of episode.shots) {
                if (shot.approval_status === 'APPROVED' && shot.prompt_drive_file_id && state.approvedFolderDriveId) {
                    try {
                        await (0, drive_1.copyFileToDrive)(drive, shot.prompt_drive_file_id, `${showCode}_S${episode.season}E${episode.episode}_${shot.scene_id}_${shot.id}_PROMPT.txt`, state.approvedFolderDriveId);
                        moved++;
                    }
                    catch { /* */ }
                }
            }
            if (rejectionLines.length > 0)
                await (0, drive_1.uploadTextFile)(drive, 'REJECTED_NOTES.txt', [`REJECTED SHOTS — S${episode.season}E${episode.episode} ${episode.title}`, `Generated: ${new Date().toISOString()}`, '', ...rejectionLines].join('\n'), state.workingFolderDriveId);
            state.episode = episode;
            state.lastUpdated = new Date().toISOString();
            (0, intake_1.saveState)(state);
            const approvedLink = await (0, drive_1.getFolderWebLink)(drive, state.approvedFolderDriveId);
            try {
                await (0, slack_1.notifyApprovalComplete)(episode, approvedCount, rejectedCount, approvedLink, rejectionLines.length > 0, state.episodeFolderDriveId);
            }
            catch { /* */ }
            res.json({ success: true, approvedCount, rejectedCount, movedToApproved: moved, approvedFolderLink: approvedLink, hasRejectionNotes: rejectionLines.length > 0 });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // ── Audio proxy ─────────────────────────────────────────────────────────────
    app.get('/api/audio/:fileId', async (req, res) => {
        try {
            const drive = await (0, drive_1.getDriveClient)();
            const { fileId } = req.params;
            const audioRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
            res.setHeader('Content-Type', 'audio/wav');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            audioRes.data.pipe(res);
        }
        catch {
            res.status(404).end();
        }
    });
    // ── Rerun rejected shots ────────────────────────────────────────────────────
    app.post('/api/rerun/:folderId', async (req, res) => {
        try {
            const { folderId } = req.params;
            const { shotUpdates, shotListFileId } = req.body;
            const drive = await (0, drive_1.getDriveClient)();
            const episode = await (0, drive_1.readJsonFile)(drive, shotListFileId);
            const folders = await getEpisodeFolders(folderId);
            if (!folders.workingFolderId)
                throw new Error('Working folder not found');
            const sceneFolderMap = await getSceneFolderMap(folders.workingFolderId, episode.scenes);
            const updateMap = new Map(shotUpdates.map((u) => [u.id, u]));
            // Apply angle overrides and build mini-episode for just these shots
            const shotsToRerun = episode.shots
                .filter((s) => updateMap.has(s.id))
                .map((s) => {
                const upd = updateMap.get(s.id);
                return { ...s, angle: (upd.new_angle || s.angle) };
            });
            if (shotsToRerun.length === 0) {
                res.json({ success: true, updated: [] });
                return;
            }
            const miniEpisode = { ...episode, shots: shotsToRerun };
            // Regenerate prompts
            const { buildAndUploadPrompts } = await Promise.resolve().then(() => __importStar(require('./prompts')));
            const newPromptIds = await buildAndUploadPrompts(miniEpisode, sceneFolderMap);
            miniEpisode.shots = miniEpisode.shots.map((s) => ({
                ...s,
                prompt_drive_file_id: newPromptIds[s.id] ?? s.prompt_drive_file_id,
            }));
            // Regenerate images
            const { generateAndUploadImages } = await Promise.resolve().then(() => __importStar(require('./images')));
            const { results: imageResults } = await generateAndUploadImages(miniEpisode, sceneFolderMap, folders.workingFolderId);
            const newImages = new Map(imageResults.map((r) => [r.shotId, r]));
            // Merge back into full episode
            episode.shots = episode.shots.map((s) => {
                const upd = updateMap.get(s.id);
                if (!upd)
                    return s;
                const img = newImages.get(s.id);
                return {
                    ...s,
                    angle: (upd.new_angle || s.angle),
                    prompt_drive_file_id: newPromptIds[s.id] ?? s.prompt_drive_file_id,
                    image_drive_file_id: img?.driveFileId ?? s.image_drive_file_id,
                    image_filename: img?.filename ?? s.image_filename,
                    approval_status: 'PENDING',
                    rejection_notes: undefined,
                };
            });
            await (0, drive_1.updateJsonFile)(drive, shotListFileId, episode);
            invalidateCache();
            const localState = (0, intake_1.loadState)();
            if (localState?.episodeFolderDriveId === folderId) {
                localState.episode = episode;
                localState.lastUpdated = new Date().toISOString();
                (0, intake_1.saveState)(localState);
            }
            res.json({
                success: true,
                updated: imageResults.map((r) => ({ shotId: r.shotId, driveFileId: r.driveFileId })),
            });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // ── Image proxy ─────────────────────────────────────────────────────────────
    app.get('/api/image/:fileId', async (req, res) => {
        try {
            const drive = await (0, drive_1.getDriveClient)();
            const { fileId } = req.params;
            const meta = await drive.files.get({ fileId, fields: 'mimeType' });
            const imgRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
            res.setHeader('Content-Type', meta.data.mimeType || 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            imgRes.data.pipe(res);
        }
        catch {
            res.status(404).end();
        }
    });
    return app;
}
// ── Exports ───────────────────────────────────────────────────────────────────
async function startApprovalServer() {
    const app = buildServer();
    app.listen(PORT, () => {
        console.log(`\n🎬 Approval UI: http://localhost:${PORT}`);
        console.log('   Open in your browser to review shots.\n');
    });
}
async function startHostedServer() {
    const app = buildServer();
    app.listen(PORT, () => {
        console.log(`\n🚀 Zoomies server running on port ${PORT}`);
    });
}
//# sourceMappingURL=server.js.map