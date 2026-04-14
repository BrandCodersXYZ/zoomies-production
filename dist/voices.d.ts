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
import { EpisodeData, CharacterName } from './types';
export interface VoiceResult {
    shotId: string;
    character: CharacterName;
    driveFileId: string;
    filename: string;
}
export declare function generateAndUploadVoices(episode: EpisodeData, sceneFolderMap: Record<string, string>, workingFolderId: string): Promise<{
    results: VoiceResult[];
    errors: string[];
}>;
//# sourceMappingURL=voices.d.ts.map