"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAndUploadImages = generateAndUploadImages;
const genai_1 = require("@google/genai");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const characters_1 = require("./constants/characters");
const drive_1 = require("./drive");
const GENERATE_MODEL = 'imagen-4.0-generate-001';
const EDIT_MODEL = 'imagen-3.0-capability-001';
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
function buildImageFilename(showCode, season, episode, sceneId, shotId) {
    return `${showCode}_S${season}E${episode}_${sceneId}_${shotId}_FRAME.jpg`;
}
function getGenAI() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
        throw new Error('GEMINI_API_KEY is not set in .env');
    return new genai_1.GoogleGenAI({ apiKey });
}
async function generateAndUploadImages(episode, sceneFolderMap, workingFolderId, model = GENERATE_MODEL) {
    const driveClient = await (0, drive_1.getDriveClient)();
    const showCode = characters_1.SHOW_CODES[episode.show];
    const tmpDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), 'zoomies-img-'));
    const results = [];
    const errors = [];
    let ai;
    try {
        ai = getGenAI();
    }
    catch (err) {
        errors.push(err.message);
        return { results, errors };
    }
    // Pre-download primary reference images for all characters that appear in this episode
    // (avoids repeated Drive downloads for the same character across many shots)
    const refImageCache = new Map(); // characterName → base64
    const episodeCharacters = [...new Set(episode.shots.flatMap((s) => s.characters))];
    console.log(`🖼  Pre-loading reference images for: ${episodeCharacters.join(', ')}`);
    for (const charName of episodeCharacters) {
        const char = characters_1.CHARACTERS[charName];
        if (!char?.referenceImageDriveIds?.length)
            continue;
        try {
            // Use the first image (primary headshot) as the subject anchor
            const b64 = await (0, drive_1.downloadFileAsBase64)(driveClient, char.referenceImageDriveIds[0]);
            refImageCache.set(charName, b64);
            process.stdout.write(`  ✅ ${charName} reference loaded\n`);
        }
        catch (err) {
            process.stderr.write(`  ⚠️  Could not load ref for ${charName}: ${err.message}\n`);
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
        let promptText;
        if (shot.prompt_drive_file_id) {
            try {
                promptText = await (0, drive_1.readTextFile)(driveClient, shot.prompt_drive_file_id);
            }
            catch {
                promptText = `${shot.action}. ${shot.emotion}. ${shot.angle} shot. Aspect ratio: 9:16. Single frame.`;
            }
        }
        else {
            promptText = `${shot.action}. ${shot.emotion}. ${shot.angle} shot. Aspect ratio: 9:16. Single frame.`;
        }
        const filename = buildImageFilename(showCode, episode.season, episode.episode, shot.scene_id, shot.id);
        const tmpPath = path_1.default.join(tmpDir, filename);
        // Build subject references for the characters in this shot
        const shotRefs = [];
        let refId = 1;
        for (const charName of shot.characters.slice(0, 3)) { // Imagen caps at ~3 subject refs
            const b64 = refImageCache.get(charName);
            if (!b64)
                continue;
            const char = characters_1.CHARACTERS[charName];
            const ref = new genai_1.SubjectReferenceImage();
            ref.referenceId = refId++;
            ref.referenceImage = { imageBytes: b64 };
            ref.config = {
                subjectType: genai_1.SubjectReferenceType.SUBJECT_TYPE_ANIMAL,
                subjectDescription: char.visualDescription,
            };
            shotRefs.push(ref);
        }
        try {
            let imageBytes;
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
            }
            else {
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
            if (!imageBytes)
                throw new Error('No image data returned');
            fs_1.default.writeFileSync(tmpPath, Buffer.from(imageBytes, 'base64'));
            const driveFileId = await (0, drive_1.uploadBinaryFile)(driveClient, filename, tmpPath, 'image/jpeg', sceneFolderId);
            results.push({ shotId: shot.id, driveFileId, filename });
            console.log(`  ✅ ${filename}`);
        }
        catch (err) {
            const msg = err.message;
            console.error(`  ❌ Shot ${shot.id}: ${msg}`);
            errors.push(`Shot ${shot.id}: ${msg}`);
            if (msg.includes('paid plans') || msg.includes('quota') || msg.includes('billing')) {
                errors.push('IMAGE GENERATION PAUSED — billing/quota error. Check Google AI Studio.');
                break;
            }
        }
        finally {
            try {
                fs_1.default.unlinkSync(tmpPath);
            }
            catch { /* ignore */ }
        }
    }
    if (errors.length > 0) {
        try {
            await (0, drive_1.uploadTextFile)(driveClient, 'IMAGE_ERRORS.txt', [
                'IMAGE GENERATION ERRORS',
                `Generated: ${new Date().toISOString()}`,
                `Episode: S${episode.season}E${episode.episode} — ${episode.title}`,
                '',
                ...errors.map((e, i) => `${i + 1}. ${e}`),
            ].join('\n'), workingFolderId);
        }
        catch { /* ignore */ }
    }
    try {
        fs_1.default.rmdirSync(tmpDir);
    }
    catch { /* ignore */ }
    console.log(`✅ Image generation: ${results.length}/${episode.shots.length} frames ready`);
    return { results, errors };
}
//# sourceMappingURL=images.js.map