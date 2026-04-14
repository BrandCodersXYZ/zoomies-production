#!/usr/bin/env node
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
const commander_1 = require("commander");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
// Load .env from cwd
dotenv_1.default.config({ path: path_1.default.join(process.cwd(), '.env'), override: true });
const program = new commander_1.Command();
program
    .name('zoomies')
    .description('Zoomies AI Animation Studio — Production Pipeline CLI')
    .version('1.0.0');
// ── zoomies intake <script> ────────────────────────────────────────────────────
program
    .command('intake <script>')
    .description('Run full intake pipeline: extract → Drive folders → prompts → voices → approval UI')
    .option('--no-server', 'Skip opening the approval server after intake')
    .action(async (scriptArg, options) => {
    try {
        const { runIntake } = await Promise.resolve().then(() => __importStar(require('./intake')));
        const { startApprovalServer } = await Promise.resolve().then(() => __importStar(require('./server')));
        const isFilePath = !scriptArg.includes('\n') && (fs_1.default.existsSync(scriptArg) || scriptArg.endsWith('.txt') || scriptArg.endsWith('.pdf') || scriptArg.endsWith('.md') || scriptArg.endsWith('.fountain'));
        const state = await runIntake(scriptArg, isFilePath);
        if (options.server !== false) {
            await startApprovalServer();
        }
    }
    catch (err) {
        console.error(`\n❌ Intake failed: ${err.message}`);
        if (process.env.DEBUG)
            console.error(err.stack);
        process.exit(1);
    }
});
// ── zoomies approve ────────────────────────────────────────────────────────────
program
    .command('approve')
    .description('Open the approval UI for the last intake run')
    .action(async () => {
    try {
        const { startApprovalServer } = await Promise.resolve().then(() => __importStar(require('./server')));
        await startApprovalServer();
    }
    catch (err) {
        console.error(`\n❌ Could not start approval server: ${err.message}`);
        process.exit(1);
    }
});
// ── zoomies voices ─────────────────────────────────────────────────────────────
program
    .command('voices')
    .description('Generate / re-generate voice VO for all dialogue shots in the current episode')
    .action(async () => {
    try {
        const { loadState, saveState } = await Promise.resolve().then(() => __importStar(require('./intake')));
        const state = loadState();
        if (!state) {
            console.error('\n❌ No pipeline state found. Run `zoomies intake <script>` first.');
            process.exit(1);
        }
        const { generateAndUploadVoices } = await Promise.resolve().then(() => __importStar(require('./voices')));
        const { getDriveClient } = await Promise.resolve().then(() => __importStar(require('./drive')));
        const { updateJsonFile } = await Promise.resolve().then(() => __importStar(require('./drive')));
        const { results: voiceResults } = await generateAndUploadVoices(state.episode, state.sceneFolderMap, state.workingFolderDriveId);
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
        // Update Drive JSON and local state
        const driveClient = await getDriveClient();
        await updateJsonFile(driveClient, state.shotListJsonFileId, state.episode);
        state.lastUpdated = new Date().toISOString();
        saveState(state);
        const voiceCount = state.episode.shots.filter((s) => s.vo_files && s.vo_files.length > 0).length;
        console.log(`\n✅ Voice generation complete — ${voiceCount} shots with VO files\n`);
    }
    catch (err) {
        console.error(`\n❌ Voice generation failed: ${err.message}`);
        process.exit(1);
    }
});
// ── zoomies deliver [drive_folder_id] ─────────────────────────────────────────
program
    .command('deliver [drive_folder_id]')
    .description('Assemble final delivery folder from approved shots')
    .action(async (driveFolderId) => {
    try {
        const { runDelivery } = await Promise.resolve().then(() => __importStar(require('./delivery')));
        await runDelivery(driveFolderId);
    }
    catch (err) {
        console.error(`\n❌ Delivery failed: ${err.message}`);
        process.exit(1);
    }
});
// ── zoomies serve ─────────────────────────────────────────────────────────────
program
    .command('serve')
    .description('Start the hosted approval server (for Railway / custom domain deployment)')
    .action(async () => {
    try {
        const { startHostedServer } = await Promise.resolve().then(() => __importStar(require('./server')));
        await startHostedServer();
    }
    catch (err) {
        console.error(`\n❌ Server failed: ${err.message}`);
        process.exit(1);
    }
});
// ── zoomies status ─────────────────────────────────────────────────────────────
program
    .command('status')
    .description('Show the current pipeline state')
    .action(() => {
    const stateFile = path_1.default.join(os_1.default.homedir(), '.zoomies', 'state.json');
    if (!fs_1.default.existsSync(stateFile)) {
        console.log('\n📭 No pipeline state found. Run `zoomies intake <script>` to start.\n');
        return;
    }
    try {
        const state = JSON.parse(fs_1.default.readFileSync(stateFile, 'utf-8'));
        const ep = state.episode;
        const approved = ep.shots.filter((s) => s.approval_status === 'APPROVED').length;
        const rejected = ep.shots.filter((s) => s.approval_status === 'REJECTED').length;
        const pending = ep.shots.filter((s) => s.approval_status === 'PENDING').length;
        const voicesDone = ep.shots.filter((s) => s.vo_files && s.vo_files.length > 0).length;
        console.log(`\n🎬 Zoomies Pipeline Status`);
        console.log(`${'─'.repeat(50)}`);
        console.log(`Show:     ${ep.show === 'catwives' ? 'The Real Catwives of Beverly Hills' : 'CSI: Bloodhound Bureau'}`);
        console.log(`Episode:  S${ep.season}E${ep.episode} — ${ep.title}`);
        console.log(`Scenes:   ${ep.scenes.length}`);
        console.log(`Shots:    ${ep.shots.length} total`);
        console.log(`          ✅ ${approved} approved`);
        console.log(`          ❌ ${rejected} rejected`);
        console.log(`          ⏳ ${pending} pending`);
        console.log(`Voices:   ${voicesDone} shots with VO`);
        console.log(`Updated:  ${state.lastUpdated}`);
        console.log(`Drive:    https://drive.google.com/drive/folders/${state.episodeFolderDriveId}`);
        console.log(`${'─'.repeat(50)}\n`);
    }
    catch {
        console.error('Could not read state file. It may be corrupted.');
    }
});
program.parse(process.argv);
//# sourceMappingURL=index.js.map