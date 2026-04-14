import fs from 'fs';
import path from 'path';
import os from 'os';
import { EpisodeData, PipelineState } from './types';
import { extractEpisodeData } from './extractor';
import { getDriveClient, createFolder, uploadJsonFile, uploadTextFile, getFolderWebLink } from './drive';
import { buildAndUploadPrompts } from './prompts';
import { generateAndUploadVoices } from './voices';
import { generateAndUploadImages } from './images';
import { notifyPipelineStarted } from './slack';
import { SHOW_DISPLAY_NAMES, SHOW_CODES } from './constants/characters';

const ZOOMIES_DIR = path.join(os.homedir(), '.zoomies');
const STATE_FILE = path.join(ZOOMIES_DIR, 'state.json');

function ensureZoomiesDir(): void {
  if (!fs.existsSync(ZOOMIES_DIR)) {
    fs.mkdirSync(ZOOMIES_DIR, { recursive: true });
  }
}

export function saveState(state: PipelineState): void {
  ensureZoomiesDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function loadState(): PipelineState | null {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as PipelineState;
  } catch {
    return null;
  }
}

async function readScriptFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    // Dynamic import to avoid issues if pdf-parse has optional native deps
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  return fs.readFileSync(filePath, 'utf-8');
}

function buildHumanReadableShotList(episode: EpisodeData): string {
  const lines: string[] = [
    `SHOT LIST`,
    `Show: ${SHOW_DISPLAY_NAMES[episode.show]}`,
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

async function createDriveFolderStructure(
  episode: EpisodeData
): Promise<{
  showFolderId: string;
  seasonFolderId: string;
  episodeFolderId: string;
  workingFolderId: string;
  approvedFolderId: string;
  finalDeliveryFolderId: string;
  sceneFolderMap: Record<string, string>;
}> {
  const driveClient = await getDriveClient();
  const rootFolderId = process.env.ZOOMIES_DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) throw new Error('ZOOMIES_DRIVE_ROOT_FOLDER_ID is not set in .env');

  const showName = SHOW_DISPLAY_NAMES[episode.show];
  const seasonName = `Season ${episode.season}`;
  const episodeName = `Episode ${episode.episode} — ${episode.title}`;

  console.log(`📁 Creating Drive folder structure...`);

  // Show folder (create or find — for now always create; idempotency left to user)
  const showFolderId = await createFolder(driveClient, showName, rootFolderId);
  const seasonFolderId = await createFolder(driveClient, seasonName, showFolderId);
  const episodeFolderId = await createFolder(driveClient, episodeName, seasonFolderId);

  // Sub-folders
  const workingFolderId = await createFolder(driveClient, 'Working', episodeFolderId);
  const approvedFolderId = await createFolder(driveClient, '_APPROVED', episodeFolderId);
  const finalDeliveryFolderId = await createFolder(driveClient, '_Final_Delivery', episodeFolderId);

  // Scene sub-folders inside Working
  const sceneFolderMap: Record<string, string> = {};
  for (const scene of episode.scenes) {
    const sanitizedLocation = scene.location.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_');
    const folderName = `${scene.id}_${sanitizedLocation}`;
    const folderId = await createFolder(driveClient, folderName, workingFolderId);
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

export async function runIntake(scriptInput: string, isFilePath: boolean): Promise<PipelineState> {
  // Step 1 — Read script
  let scriptText: string;
  if (isFilePath) {
    console.log(`📄 Reading script: ${scriptInput}`);
    scriptText = await readScriptFile(scriptInput);
  } else {
    scriptText = scriptInput;
    console.log(`📄 Using pasted script (${scriptText.length} chars)`);
  }

  // Step 2 — Extract episode data via Claude
  const episode = await extractEpisodeData(scriptText);

  // Step 3 — Create Drive folders
  const {
    episodeFolderId,
    workingFolderId,
    approvedFolderId,
    finalDeliveryFolderId,
    sceneFolderMap,
  } = await createDriveFolderStructure(episode);

  const driveClient = await getDriveClient();
  const showCode = SHOW_CODES[episode.show];
  const s = String(episode.season).padStart(1, '0');
  const e = String(episode.episode).padStart(1, '0');

  // Upload shot list JSON
  const shotListJsonName = `Episode${episode.episode}_Shot_List.json`;
  const shotListJsonFileId = await uploadJsonFile(
    driveClient,
    shotListJsonName,
    episode,
    episodeFolderId
  );
  console.log(`📋 Shot list JSON uploaded: ${shotListJsonName}`);

  // Upload human-readable shot list
  const shotListTxtName = `Episode${episode.episode}_Shot_List.txt`;
  const shotListTxtFileId = await uploadTextFile(
    driveClient,
    shotListTxtName,
    buildHumanReadableShotList(episode),
    episodeFolderId
  );
  console.log(`📋 Shot list TXT uploaded: ${shotListTxtName}`);

  // Build initial state
  const state: PipelineState = {
    episode,
    episodeFolderDriveId: episodeFolderId,
    workingFolderDriveId: workingFolderId,
    approvedFolderDriveId: approvedFolderId,
    finalDeliveryFolderDriveId: finalDeliveryFolderId,
    sceneFolderMap,
    shotListJsonFileId,
    shotListTxtFileId,
    showCode: showCode as 'CWBH' | 'BHB',
    lastUpdated: new Date().toISOString(),
  };

  saveState(state);

  // Step 7 (post-folder) — Slack notification
  try {
    const episodeFolderLink = await getFolderWebLink(driveClient, episodeFolderId);
    await notifyPipelineStarted(episode, episodeFolderLink, episodeFolderId);
    console.log(`💬 Slack notification sent`);
  } catch (err) {
    console.warn(`⚠️  Slack notification failed: ${(err as Error).message}`);
  }

  // Step 4 — Build and upload image prompts
  const shotPromptFileIds = await buildAndUploadPrompts(episode, sceneFolderMap);

  // Update shot data with prompt file IDs
  state.episode.shots = state.episode.shots.map((shot) => ({
    ...shot,
    prompt_drive_file_id: shotPromptFileIds[shot.id] || undefined,
  }));

  // Step 4.5 — Generate images via Imagen
  if (process.env.GEMINI_API_KEY) {
    const { results: imageResults } = await generateAndUploadImages(
      state.episode,
      sceneFolderMap,
      workingFolderId
    );

    state.episode.shots = state.episode.shots.map((shot) => {
      const img = imageResults.find((r) => r.shotId === shot.id);
      if (!img) return shot;
      return { ...shot, image_drive_file_id: img.driveFileId, image_filename: img.filename };
    });

    // Save state immediately after images so IDs are never lost if voices crash
    state.lastUpdated = new Date().toISOString();
    saveState(state);
  } else {
    console.log('⚠️  GEMINI_API_KEY not set — skipping image generation');
  }

  // Step 5 — Generate voices
  const { results: voiceResults } = await generateAndUploadVoices(
    state.episode,
    sceneFolderMap,
    workingFolderId
  );

  // Attach VO file IDs to shots
  state.episode.shots = state.episode.shots.map((shot) => {
    const shotVOs = voiceResults.filter((r) => r.shotId === shot.id);
    if (shotVOs.length === 0) return shot;
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
  const { updateJsonFile } = await import('./drive');
  await updateJsonFile(driveClient, shotListJsonFileId, state.episode);

  state.lastUpdated = new Date().toISOString();
  saveState(state);

  console.log(`\n🎬 Intake complete!`);
  console.log(`   Show: ${SHOW_DISPLAY_NAMES[episode.show]}`);
  console.log(`   Episode: S${episode.season}E${episode.episode} — ${episode.title}`);
  console.log(`   Scenes: ${episode.scenes.length} | Shots: ${episode.shots.length}`);
  console.log(`   Drive folder: ${episodeFolderId}`);

  return state;
}
