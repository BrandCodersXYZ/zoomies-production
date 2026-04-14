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
exports.saveState = saveState;
exports.loadState = loadState;
exports.runIntake = runIntake;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const extractor_1 = require("./extractor");
const drive_1 = require("./drive");
const prompts_1 = require("./prompts");
const voices_1 = require("./voices");
const images_1 = require("./images");
const slack_1 = require("./slack");
const characters_1 = require("./constants/characters");
const ZOOMIES_DIR = path_1.default.join(os_1.default.homedir(), '.zoomies');
const STATE_FILE = path_1.default.join(ZOOMIES_DIR, 'state.json');
function ensureZoomiesDir() {
    if (!fs_1.default.existsSync(ZOOMIES_DIR)) {
        fs_1.default.mkdirSync(ZOOMIES_DIR, { recursive: true });
    }
}
function saveState(state) {
    ensureZoomiesDir();
    fs_1.default.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}
function loadState() {
    if (!fs_1.default.existsSync(STATE_FILE))
        return null;
    try {
        return JSON.parse(fs_1.default.readFileSync(STATE_FILE, 'utf-8'));
    }
    catch {
        return null;
    }
}
async function readScriptFile(filePath) {
    const ext = path_1.default.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
        // Dynamic import to avoid issues if pdf-parse has optional native deps
        const pdfParse = (await Promise.resolve().then(() => __importStar(require('pdf-parse')))).default;
        const buffer = fs_1.default.readFileSync(filePath);
        const data = await pdfParse(buffer);
        return data.text;
    }
    return fs_1.default.readFileSync(filePath, 'utf-8');
}
function buildHumanReadableShotList(episode) {
    const lines = [
        `SHOT LIST`,
        `Show: ${characters_1.SHOW_DISPLAY_NAMES[episode.show]}`,
        `Episode: S${episode.season}E${episode.episode} — ${episode.title}`,
        `Logline: ${episode.logline}`,
        `Characters: ${episode.characters.join(', ')}`,
        '',
        '─'.repeat(80),
        '',
    ];
    const sceneMap = new Map(episode.scenes.map((s) => [s.id, s]));
    let currentScene = '';
    for (const shot of episode.shots) {
        if (shot.scene_id !== currentScene) {
            const scene = sceneMap.get(shot.scene_id);
            currentScene = shot.scene_id;
            lines.push('');
            lines.push(`SCENE ${shot.scene_id}${scene ? ` — ${scene.location.toUpperCase()} (${scene.time})` : ''}`);
            if (scene) {
                lines.push(`Beat: ${scene.beat}`);
                lines.push(`Function: ${scene.function}`);
            }
            lines.push('─'.repeat(40));
        }
        lines.push(`  ${shot.id} | ${shot.angle.toUpperCase().padEnd(20)} | ${shot.emotion.padEnd(20)} | ${shot.duration_seconds}s`);
        lines.push(`  Action: ${shot.action}`);
        lines.push(`  Characters: ${shot.characters.join(', ')}`);
        if (shot.dialogue_line) {
            lines.push(`  Dialogue: "${shot.dialogue_line}"`);
        }
        lines.push('');
    }
    return lines.join('\n');
}
// ── Step 3: Create Drive folder structure ─────────────────────────────────────
async function createDriveFolderStructure(episode) {
    const driveClient = await (0, drive_1.getDriveClient)();
    const rootFolderId = process.env.ZOOMIES_DRIVE_ROOT_FOLDER_ID;
    if (!rootFolderId)
        throw new Error('ZOOMIES_DRIVE_ROOT_FOLDER_ID is not set in .env');
    const showName = characters_1.SHOW_DISPLAY_NAMES[episode.show];
    const seasonName = `Season ${episode.season}`;
    const episodeName = `Episode ${episode.episode} — ${episode.title}`;
    console.log(`📁 Creating Drive folder structure...`);
    // Show folder (create or find — for now always create; idempotency left to user)
    const showFolderId = await (0, drive_1.createFolder)(driveClient, showName, rootFolderId);
    const seasonFolderId = await (0, drive_1.createFolder)(driveClient, seasonName, showFolderId);
    const episodeFolderId = await (0, drive_1.createFolder)(driveClient, episodeName, seasonFolderId);
    // Sub-folders
    const workingFolderId = await (0, drive_1.createFolder)(driveClient, 'Working', episodeFolderId);
    const approvedFolderId = await (0, drive_1.createFolder)(driveClient, '_APPROVED', episodeFolderId);
    const finalDeliveryFolderId = await (0, drive_1.createFolder)(driveClient, '_Final_Delivery', episodeFolderId);
    // Scene sub-folders inside Working
    const sceneFolderMap = {};
    for (const scene of episode.scenes) {
        const sanitizedLocation = scene.location.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_');
        const folderName = `${scene.id}_${sanitizedLocation}`;
        const folderId = await (0, drive_1.createFolder)(driveClient, folderName, workingFolderId);
        sceneFolderMap[scene.id] = folderId;
        console.log(`  📂 ${folderName}`);
    }
    console.log(`✅ Drive folders created`);
    return {
        showFolderId,
        seasonFolderId,
        episodeFolderId,
        workingFolderId,
        approvedFolderId,
        finalDeliveryFolderId,
        sceneFolderMap,
    };
}
// ── Main intake flow ───────────────────────────────────────────────────────────
async function runIntake(scriptInput, isFilePath) {
    // Step 1 — Read script
    let scriptText;
    if (isFilePath) {
        console.log(`📄 Reading script: ${scriptInput}`);
        scriptText = await readScriptFile(scriptInput);
    }
    else {
        scriptText = scriptInput;
        console.log(`📄 Using pasted script (${scriptText.length} chars)`);
    }
    // Step 2 — Extract episode data via Claude
    const episode = await (0, extractor_1.extractEpisodeData)(scriptText);
    // Step 3 — Create Drive folders
    const { episodeFolderId, workingFolderId, approvedFolderId, finalDeliveryFolderId, sceneFolderMap, } = await createDriveFolderStructure(episode);
    const driveClient = await (0, drive_1.getDriveClient)();
    const showCode = characters_1.SHOW_CODES[episode.show];
    const s = String(episode.season).padStart(1, '0');
    const e = String(episode.episode).padStart(1, '0');
    // Upload shot list JSON
    const shotListJsonName = `Episode${episode.episode}_Shot_List.json`;
    const shotListJsonFileId = await (0, drive_1.uploadJsonFile)(driveClient, shotListJsonName, episode, episodeFolderId);
    console.log(`📋 Shot list JSON uploaded: ${shotListJsonName}`);
    // Upload human-readable shot list
    const shotListTxtName = `Episode${episode.episode}_Shot_List.txt`;
    const shotListTxtFileId = await (0, drive_1.uploadTextFile)(driveClient, shotListTxtName, buildHumanReadableShotList(episode), episodeFolderId);
    console.log(`📋 Shot list TXT uploaded: ${shotListTxtName}`);
    // Build initial state
    const state = {
        episode,
        episodeFolderDriveId: episodeFolderId,
        workingFolderDriveId: workingFolderId,
        approvedFolderDriveId: approvedFolderId,
        finalDeliveryFolderDriveId: finalDeliveryFolderId,
        sceneFolderMap,
        shotListJsonFileId,
        shotListTxtFileId,
        showCode: showCode,
        lastUpdated: new Date().toISOString(),
    };
    saveState(state);
    // Step 7 (post-folder) — Slack notification
    try {
        const episodeFolderLink = await (0, drive_1.getFolderWebLink)(driveClient, episodeFolderId);
        await (0, slack_1.notifyPipelineStarted)(episode, episodeFolderLink, episodeFolderId);
        console.log(`💬 Slack notification sent`);
    }
    catch (err) {
        console.warn(`⚠️  Slack notification failed: ${err.message}`);
    }
    // Step 4 — Build and upload image prompts
    const shotPromptFileIds = await (0, prompts_1.buildAndUploadPrompts)(episode, sceneFolderMap);
    // Update shot data with prompt file IDs
    state.episode.shots = state.episode.shots.map((shot) => ({
        ...shot,
        prompt_drive_file_id: shotPromptFileIds[shot.id] || undefined,
    }));
    // Step 4.5 — Generate images via Imagen
    if (process.env.GEMINI_API_KEY) {
        const { results: imageResults } = await (0, images_1.generateAndUploadImages)(state.episode, sceneFolderMap, workingFolderId);
        state.episode.shots = state.episode.shots.map((shot) => {
            const img = imageResults.find((r) => r.shotId === shot.id);
            if (!img)
                return shot;
            return { ...shot, image_drive_file_id: img.driveFileId, image_filename: img.filename };
        });
        // Save state immediately after images so IDs are never lost if voices crash
        state.lastUpdated = new Date().toISOString();
        saveState(state);
    }
    else {
        console.log('⚠️  GEMINI_API_KEY not set — skipping image generation');
    }
    // Step 5 — Generate voices
    const { results: voiceResults } = await (0, voices_1.generateAndUploadVoices)(state.episode, sceneFolderMap, workingFolderId);
    // Attach VO file IDs to shots
    state.episode.shots = state.episode.shots.map((shot) => {
        const shotVOs = voiceResults.filter((r) => r.shotId === shot.id);
        if (shotVOs.length === 0)
            return shot;
        return {
            ...shot,
            vo_files: shotVOs.map((r) => ({
                character: r.character,
                drive_file_id: r.driveFileId,
                filename: r.filename,
            })),
        };
    });
    // Update the JSON in Drive with full shot data
    const { updateJsonFile } = await Promise.resolve().then(() => __importStar(require('./drive')));
    await updateJsonFile(driveClient, shotListJsonFileId, state.episode);
    state.lastUpdated = new Date().toISOString();
    saveState(state);
    console.log(`\n🎬 Intake complete!`);
    console.log(`   Show: ${characters_1.SHOW_DISPLAY_NAMES[episode.show]}`);
    console.log(`   Episode: S${episode.season}E${episode.episode} — ${episode.title}`);
    console.log(`   Scenes: ${episode.scenes.length} | Shots: ${episode.shots.length}`);
    console.log(`   Drive folder: ${episodeFolderId}`);
    return state;
}
//# sourceMappingURL=intake.js.map