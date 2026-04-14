import { EpisodeData, Scene, Shot, CharacterName, ShowName } from './types';
import { STYLE_LOCKS } from './constants/styleLock';
import { CHARACTERS, SHOW_CODES } from './constants/characters';
import { getDriveClient, uploadTextFile } from './drive';

function buildImagePrompt(
  episode: EpisodeData,
  scene: Scene,
  shot: Shot
): string {
  const styleLock = STYLE_LOCKS[episode.show];

  const characterDescriptions = shot.characters
    .map((charName) => {
      const char = CHARACTERS[charName];
      return char ? `${charName.toUpperCase()}: ${char.visualDescription}` : charName;
    })
    .join('\n');

  const doRules = shot.characters
    .flatMap((charName) => {
      const char = CHARACTERS[charName];
      return char ? char.dos.map((rule) => `DO — ${charName}: ${rule}`) : [];
    })
    .join('\n');

  const dontRules = shot.characters
    .flatMap((charName) => {
      const char = CHARACTERS[charName];
      return char ? char.donts.map((rule) => `DO NOT — ${charName}: ${rule}`) : [];
    })
    .join('\n');

  const dialogueLine =
    shot.dialogue_line && shot.dialogue_line.trim()
      ? `Dialogue happening: "${shot.dialogue_line}"`
      : 'No dialogue — action/reaction shot.';

  const prompt = [
    '=== STYLE LOCK ===',
    styleLock,
    '',
    '=== CHARACTER ANCHORS ===',
    characterDescriptions,
    '',
    '=== SHOT SPECIFICATION ===',
    `Shot type: ${shot.angle}`,
    `Action: ${shot.action}`,
    `Expression / Emotion: ${shot.emotion}`,
    `Background / Location: ${scene.location} — ${scene.time}`,
    `Characters in frame: ${shot.characters.join(', ')}`,
    dialogueLine,
    '',
    '=== IDENTITY RULES ===',
    'Maintain exact character identity from reference.',
    doRules,
    dontRules,
    '',
    '=== OUTPUT REQUIREMENTS ===',
    'ONE single cinematic frame. NOT a collage. NOT a grid. NOT multiple panels. NOT split screen.',
    'NO text of any kind — no captions, subtitles, dialogue boxes, speech bubbles, watermarks,',
    'title cards, credits, UI elements, labels, annotations, logos, or on-screen writing.',
    'Clean composition. Characters rendered at full fidelity. Aspect ratio 9:16.',
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  return prompt;
}

function buildPromptFilename(
  showCode: string,
  season: number,
  episode: number,
  sceneId: string,
  shotId: string
): string {
  const s = String(season).padStart(1, '0');
  const e = String(episode).padStart(1, '0');
  return `${showCode}_S${s}E${e}_${sceneId}_${shotId}_PROMPT.txt`;
}

export async function buildAndUploadPrompts(
  episode: EpisodeData,
  sceneFolderMap: Record<string, string>
): Promise<Record<string, string>> {
  // Returns map of shot.id -> drive file id
  const driveClient = await getDriveClient();
  const showCode = SHOW_CODES[episode.show];
  const shotPromptFileIds: Record<string, string> = {};

  const sceneMap = new Map(episode.scenes.map((s) => [s.id, s]));

  let uploaded = 0;
  console.log(`📝 Building prompts for ${episode.shots.length} shots...`);

  for (const shot of episode.shots) {
    const scene = sceneMap.get(shot.scene_id);
    if (!scene) {
      console.warn(`  ⚠️  Scene ${shot.scene_id} not found for shot ${shot.id}, skipping`);
      continue;
    }

    const sceneFolderId = sceneFolderMap[shot.scene_id];
    if (!sceneFolderId) {
      console.warn(`  ⚠️  No Drive folder for scene ${shot.scene_id}, skipping`);
      continue;
    }

    const promptText = buildImagePrompt(episode, scene, shot);
    const filename = buildPromptFilename(
      showCode,
      episode.season,
      episode.episode,
      shot.scene_id,
      shot.id
    );

    try {
      const fileId = await uploadTextFile(driveClient, filename, promptText, sceneFolderId);
      shotPromptFileIds[shot.id] = fileId;
      uploaded++;
    } catch (err) {
      console.error(`  ❌ Failed to upload prompt for ${shot.id}: ${(err as Error).message}`);
    }
  }

  console.log(`✅ Uploaded ${uploaded}/${episode.shots.length} prompt files`);
  return shotPromptFileIds;
}
