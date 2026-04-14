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
import { EpisodeData } from './types';
export interface ImageResult {
    shotId: string;
    driveFileId: string;
    filename: string;
}
export declare function generateAndUploadImages(episode: EpisodeData, sceneFolderMap: Record<string, string>, workingFolderId: string, model?: string): Promise<{
    results: ImageResult[];
    errors: string[];
}>;
//# sourceMappingURL=images.d.ts.map