/**
 * voices.ts — Google Gemini TTS integration
 *
 * Uses gemini-2.5-flash-preview-tts with per-character voice assignments.
 * Character voice descriptions are passed as system instructions so Gemini
 * can style the delivery to match each character's personality.
 *
 * Output: WAV files (raw PCM 24kHz 16-bit mono wrapped in a WAV container)
 * uploaded to the scene's Drive folder.
 *
 * Requires: GEMINI_API_KEY in .env (same key used for Imagen 4)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { GoogleGenAI } from '@google/genai';
import { EpisodeData, CharacterName } from './types';
import { CHARACTERS, SHOW_CODES } from './constants/characters';
import { getDriveClient, uploadBinaryFile, uploadTextFile } from './drive';

// ── Gemini voice assignments per character ────────────────────────────────────
// Voice palette: https://ai.google.dev/gemini-api/docs/speech-generation#voices

const CHARACTER_VOICES: Record<CharacterName, string> = {
  // ── Catwives ──
  kitty:      'Gacrux',      // Mature           — sophisticated, measured
  countess:   'Kore',        // Firm             — regal, deliberate
  bambi:      'Leda',        // Youthful         — warm, innocent energy
  dominique:  'Alnilam',     // Firm             — commanding, no hedging
  purrlita:   'Puck',        // Upbeat           — chaotic, breathless
  // ── Bloodhound ──
  chase:      'Algenib',     // Gravelly         — noir detective, weary
  vicki:      'Sadachbia',   // Lively           — young, fast, enthusiastic
  kibble:     'Rasalhague',  // Informative      — scientific, slightly nasal
  vanderpump: 'Sulafat',     // Warm             — refined, amused, knowing
};

// ── Delivery style prefix per character ──────────────────────────────────────
// Gemini TTS reads the full string, so we prepend acting directions in parens
// to shape pace, energy and rhythm. Characters naturally delivered too slowly
// get a fast/energetic prefix; deliberate characters keep minimal direction.

const CHARACTER_DELIVERY: Record<CharacterName, string> = {
  kitty:      '(measured, composed, slight edge of steel) ',
  countess:   '(slow, deliberate, world-weary aristocrat) ',
  bambi:      '(bright, warm, breathy, slightly fast) ',
  dominique:  '(fast, direct, confident, no hesitation) ',
  purrlita:   '(rapid, breathless, chaotic energy, unpredictable rhythm) ',
  chase:      '(slow, gravelly, noir monotone, long pauses) ',
  vicki:      '(fast, excited, out of breath, enthusiastic) ',
  kibble:     '(rapid excited bursts, slightly nasal, nerdy) ',
  vanderpump: '(slow, amused, smooth, every pause deliberate) ',
};

// ── WAV container writer (PCM 16-bit 24kHz mono) ─────────────────────────────

function wrapPcmInWav(pcmData: Buffer, sampleRate = 24000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length;
  const header = Buffer.alloc(44);
  let o = 0;

  header.write('RIFF', o);          o += 4;
  header.writeUInt32LE(36 + dataSize, o); o += 4;
  header.write('WAVE', o);          o += 4;
  header.write('fmt ', o);          o += 4;
  header.writeUInt32LE(16, o);      o += 4;  // fmt chunk size
  header.writeUInt16LE(1, o);       o += 2;  // PCM
  header.writeUInt16LE(numChannels, o); o += 2;
  header.writeUInt32LE(sampleRate, o);  o += 4;
  header.writeUInt32LE(byteRate, o);    o += 4;
  header.writeUInt16LE(blockAlign, o);  o += 2;
  header.writeUInt16LE(bitsPerSample, o); o += 2;
  header.write('data', o);          o += 4;
  header.writeUInt32LE(dataSize, o);

  return Buffer.concat([header, pcmData]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildVoFilename(
  showCode: string,
  season: number,
  episode: number,
  sceneId: string,
  shotId: string,
  character: CharacterName
): string {
  return `${showCode}_S${season}E${episode}_${sceneId}_${shotId}_${character.toUpperCase()}_VO.wav`;
}

function extractSpeaker(dialogue: string, shotCharacters: CharacterName[]): CharacterName | null {
  if (!dialogue?.trim()) return null;
  // Handle "CHARACTER: line" format
  const match = dialogue.match(/^([A-Z][A-Z]+):\s/);
  if (match) {
    const name = match[1].toLowerCase() as CharacterName;
    if (shotCharacters.includes(name)) return name;
  }
  return shotCharacters[0] ?? null;
}

function cleanDialogueLine(dialogue: string): string {
  return dialogue.replace(/^[A-Z]+:\s/, '').trim();
}

function buildDeliveryText(character: CharacterName, dialogue: string): string {
  const clean = cleanDialogueLine(dialogue);
  const prefix = CHARACTER_DELIVERY[character] ?? '';
  return `${prefix}"${clean}"`;
}

// ── Rate-limit helpers ────────────────────────────────────────────────────────

// Gemini TTS quota: 10 req/min. Space requests at ~6s to stay comfortably under.
const TTS_INTER_REQUEST_MS = 6200;
let _lastTtsCallAt = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = TTS_INTER_REQUEST_MS - (now - _lastTtsCallAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  _lastTtsCallAt = Date.now();
}

/** Parse retryDelay seconds out of a Gemini 429 error message, default 32s. */
function parseRetryDelay(errMessage: string): number {
  const match = errMessage.match(/"retryDelay"\s*:\s*"(\d+)s"/);
  return match ? (parseInt(match[1], 10) + 2) * 1000 : 32_000;
}

// ── Single clip generator ─────────────────────────────────────────────────────

async function generateClip(
  ai: GoogleGenAI,
  character: CharacterName,
  dialogueLine: string,
  outputPath: string,
  attempt = 1
): Promise<void> {
  const voiceName = CHARACTER_VOICES[character] ?? 'Kore';
  const deliveryText = buildDeliveryText(character, dialogueLine);

  await throttle();

  let response;
  try {
    response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text: deliveryText }] }],
      config: {
        // Note: gemini-2.5-flash-preview-tts does not support systemInstruction.
        // Voice character is shaped by voiceName (Kore=Firm, Algenib=Gravelly, etc.)
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      } as Record<string, unknown>,
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (msg.includes('429') && attempt <= 3) {
      const delay = parseRetryDelay(msg);
      console.log(`  ⏳ Rate limit — waiting ${Math.round(delay / 1000)}s then retrying (${character})...`);
      await new Promise((r) => setTimeout(r, delay));
      _lastTtsCallAt = 0; // reset throttle after long wait
      return generateClip(ai, character, dialogueLine, outputPath, attempt + 1);
    }
    throw err;
  }

  const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData?.data) {
    throw new Error(`No audio data returned for ${character} — "${deliveryText.slice(0, 50)}"`);
  }

  const pcm = Buffer.from(inlineData.data, 'base64');
  const wav = wrapPcmInWav(pcm);
  fs.writeFileSync(outputPath, wav);
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface VoiceResult {
  shotId: string;
  character: CharacterName;
  driveFileId: string;
  filename: string;
}

export async function generateAndUploadVoices(
  episode: EpisodeData,
  sceneFolderMap: Record<string, string>,
  workingFolderId: string
): Promise<{ results: VoiceResult[]; errors: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('⚠️  GEMINI_API_KEY not set — skipping voice generation');
    return { results: [], errors: [] };
  }

  const ai = new GoogleGenAI({ apiKey });
  const driveClient = await getDriveClient();
  const showCode = SHOW_CODES[episode.show];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoomies-vo-'));

  const results: VoiceResult[] = [];
  const errors: string[] = [];

  // Collect dialogue shots
  const tasks: Array<{
    shotId: string;
    sceneId: string;
    character: CharacterName;
    dialogue: string;
    filename: string;
  }> = [];

  for (const shot of episode.shots) {
    if (!shot.dialogue_line?.trim()) continue;
    const speaker = extractSpeaker(shot.dialogue_line, shot.characters);
    if (!speaker) continue;
    if (!CHARACTERS[speaker]) { errors.push(`Unknown character: ${speaker}`); continue; }

    tasks.push({
      shotId: shot.id,
      sceneId: shot.scene_id,
      character: speaker,
      dialogue: shot.dialogue_line,
      filename: buildVoFilename(showCode, episode.season, episode.episode, shot.scene_id, shot.id, speaker),
    });
  }

  if (tasks.length === 0) {
    console.log('🎙️  No dialogue shots — skipping voice generation');
    return { results, errors };
  }

  console.log(`🎙️  Generating ${tasks.length} voice clips via Gemini TTS...`);

  for (const task of tasks) {
    const outputPath = path.join(tmpDir, task.filename);
    try {
      await generateClip(ai, task.character, task.dialogue, outputPath);

      const sceneFolderId = sceneFolderMap[task.sceneId];
      if (!sceneFolderId) throw new Error(`No Drive folder for scene ${task.sceneId}`);

      const driveFileId = await uploadBinaryFile(
        driveClient, task.filename, outputPath, 'audio/wav', sceneFolderId
      );

      results.push({ shotId: task.shotId, character: task.character, driveFileId, filename: task.filename });
      console.log(`  ✅ ${task.filename}`);
    } catch (err) {
      const msg = `${task.shotId} — ${task.character}: ${(err as Error).message}`;
      console.error(`  ❌ ${msg}`);
      errors.push(msg);
    } finally {
      try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
    }
  }

  // Write error log if needed
  if (errors.length > 0) {
    try {
      const content = [
        'VOICE GENERATION ERRORS — Gemini TTS',
        `Generated: ${new Date().toISOString()}`,
        `Episode: S${episode.season}E${episode.episode} — ${episode.title}`,
        '',
        ...errors.map((e, i) => `${i + 1}. ${e}`),
      ].join('\n');
      await uploadTextFile(driveClient, 'VOICE_ERRORS.txt', content, workingFolderId);
    } catch { /* ignore */ }
  }

  // Cleanup
  try { fs.rmdirSync(tmpDir); } catch { /* ignore */ }

  console.log(`✅ Voice generation: ${results.length}/${tasks.length} clips uploaded`);
  return { results, errors };
}
