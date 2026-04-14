/**
 * images.ts — Imagen frame generation with character reference images
 *
 * Uses editImage (imagen-3.0-capability-001) with SubjectReferenceImage so
 * the model anchors each character's appearance to their approved headshots.
 * Falls back to generateImages (imagen-4.0-generate-001) if no references
 * are available for the shot's characters.
 *
 * Reference images are pulled from the character Drive folders catalogued in
 * constants/characters.ts → referenceImageDriveIds[0] (primary headshot).
 */

import { GoogleGenAI, SubjectReferenceImage, SubjectReferenceType } from '@google/genai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EpisodeData } from './types';
import { CHARACTERS, SHOW_CODES } from './constants/characters';
import { getDriveClient, downloadFileAsBase64, readTextFile, uploadBinaryFile, uploadTextFile } from './drive';

const GENERATE_MODEL = 'imagen-4.0-generate-001';
const EDIT_MODEL     = 'imagen-3.0-capability-001';

// ── Negative prompt applied to every frame ───────────────────────────────────

const NEGATIVE_PROMPT = [
  // No multi-panel layouts
  'collage, grid layout, multiple panels, split screen, image mosaic, comic strip,',
  'side-by-side images, tiled images, photo collage, composite image, panel borders,',
  'frames within frames, picture-in-picture,',
  // No text or UI
  'text overlay, caption, subtitle, watermark, title card, credits, dialogue box,',
  'speech bubble, UI element, interface graphic, on-screen text, label, annotation,',
  'logo, brand mark, signature, stamp, banner, ticker,',
  // No stylistic issues
  'blurry, out of focus, low quality, pixelated, distorted, warped anatomy,',
  'extra limbs, duplicate characters, mirror image, symmetrical clone,',
  'multiple versions of the same character, background characters repeated in foreground,',
].join(' ');

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildImageFilename(
  showCode: string, season: number, episode: number,
  sceneId: string, shotId: string
): string {
  return `${showCode}_S${season}E${episode}_${sceneId}_${shotId}_FRAME.jpg`;
}

function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in .env');
  return new GoogleGenAI({ apiKey });
}

// ── Image generation ──────────────────────────────────────────────────────────

export interface ImageResult {
  shotId: string;
  driveFileId: string;
  filename: string;
}

export async function generateAndUploadImages(
  episode: EpisodeData,
  sceneFolderMap: Record<string, string>,
  workingFolderId: string,
  model: string = GENERATE_MODEL
): Promise<{ results: ImageResult[]; errors: string[] }> {
  const driveClient = await getDriveClient();
  const showCode = SHOW_CODES[episode.show];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoomies-img-'));

  const results: ImageResult[] = [];
  const errors: string[] = [];

  let ai: GoogleGenAI;
  try { ai = getGenAI(); } catch (err) {
    errors.push((err as Error).message);
    return { results, errors };
  }

  // Pre-download primary reference images for all characters that appear in this episode
  // (avoids repeated Drive downloads for the same character across many shots)
  const refImageCache = new Map<string, string>(); // characterName → base64
  const episodeCharacters = [...new Set(episode.shots.flatMap((s) => s.characters))];
  console.log(`🖼  Pre-loading reference images for: ${episodeCharacters.join(', ')}`);
  for (const charName of episodeCharacters) {
    const char = CHARACTERS[charName];
    if (!char?.referenceImageDriveIds?.length) continue;
    try {
      // Use the first image (primary headshot) as the subject anchor
      const b64 = await downloadFileAsBase64(driveClient, char.referenceImageDriveIds[0]);
      refImageCache.set(charName, b64);
      process.stdout.write(`  ✅ ${charName} reference loaded\n`);
    } catch (err) {
      process.stderr.write(`  ⚠️  Could not load ref for ${charName}: ${(err as Error).message}\n`);
    }
  }

  console.log(`\n🎨 Generating ${episode.shots.length} frames...`);

  for (const shot of episode.shots) {
    const sceneFolderId = sceneFolderMap[shot.scene_id];
    if (!sceneFolderId) {
      errors.push(`Shot ${shot.id}: no Drive folder for scene ${shot.scene_id}`);
      continue;
    }

    // Read prompt from Drive
    let promptText: string;
    if (shot.prompt_drive_file_id) {
      try {
        promptText = await readTextFile(driveClient, shot.prompt_drive_file_id);
      } catch {
        promptText = `${shot.action}. ${shot.emotion}. ${shot.angle} shot. Aspect ratio: 9:16. Single frame.`;
      }
    } else {
      promptText = `${shot.action}. ${shot.emotion}. ${shot.angle} shot. Aspect ratio: 9:16. Single frame.`;
    }

    const filename = buildImageFilename(showCode, episode.season, episode.episode, shot.scene_id, shot.id);
    const tmpPath = path.join(tmpDir, filename);

    // Build subject references for the characters in this shot
    const shotRefs: SubjectReferenceImage[] = [];
    let refId = 1;
    for (const charName of shot.characters.slice(0, 3)) { // Imagen caps at ~3 subject refs
      const b64 = refImageCache.get(charName);
      if (!b64) continue;
      const char = CHARACTERS[charName];
      const ref = new SubjectReferenceImage();
      ref.referenceId = refId++;
      ref.referenceImage = { imageBytes: b64 };
      ref.config = {
        subjectType: SubjectReferenceType.SUBJECT_TYPE_ANIMAL,
        subjectDescription: char.visualDescription,
      };
      shotRefs.push(ref);
    }

    try {
      let imageBytes: string | undefined;

      if (shotRefs.length > 0) {
        // ── editImage with subject anchors ────────────────────────────────────
        const res = await ai.models.editImage({
          model: EDIT_MODEL,
          prompt: promptText,
          referenceImages: shotRefs,
          config: {
            numberOfImages: 1,
            aspectRatio: '9:16',
            outputMimeType: 'image/jpeg',
            negativePrompt: NEGATIVE_PROMPT,
          },
        });
        imageBytes = res.generatedImages?.[0]?.image?.imageBytes;
      } else {
        // ── generateImages fallback (no reference images available) ───────────
        const res = await ai.models.generateImages({
          model,
          prompt: promptText,
          config: {
            numberOfImages: 1,
            aspectRatio: '9:16',
            outputMimeType: 'image/jpeg',
            negativePrompt: NEGATIVE_PROMPT,
          },
        });
        imageBytes = res.generatedImages?.[0]?.image?.imageBytes;
      }

      if (!imageBytes) throw new Error('No image data returned');

      fs.writeFileSync(tmpPath, Buffer.from(imageBytes, 'base64'));

      const driveFileId = await uploadBinaryFile(
        driveClient, filename, tmpPath, 'image/jpeg', sceneFolderId
      );

      results.push({ shotId: shot.id, driveFileId, filename });
      console.log(`  ✅ ${filename}`);
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`  ❌ Shot ${shot.id}: ${msg}`);
      errors.push(`Shot ${shot.id}: ${msg}`);

      if (msg.includes('paid plans') || msg.includes('quota') || msg.includes('billing')) {
        errors.push('IMAGE GENERATION PAUSED — billing/quota error. Check Google AI Studio.');
        break;
      }
    } finally {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  }

  if (errors.length > 0) {
    try {
      await uploadTextFile(driveClient, 'IMAGE_ERRORS.txt', [
        'IMAGE GENERATION ERRORS',
        `Generated: ${new Date().toISOString()}`,
        `Episode: S${episode.season}E${episode.episode} — ${episode.title}`,
        '',
        ...errors.map((e, i) => `${i + 1}. ${e}`),
      ].join('\n'), workingFolderId);
    } catch { /* ignore */ }
  }

  try { fs.rmdirSync(tmpDir); } catch { /* ignore */ }

  console.log(`✅ Image generation: ${results.length}/${episode.shots.length} frames ready`);
  return { results, errors };
}
