import {
  getDriveClient,
  listFilesInFolder,
  copyFileToDrive,
  uploadJsonFile,
  getFolderWebLink,
} from './drive';
import { notifyDeliveryReady } from './slack';
import { EpisodeData, Shot } from './types';
import { loadState } from './intake';
import { SHOW_CODES } from './constants/characters';

interface DeliveryManifestEntry {
  shotId: string;
  sceneId: string;
  approvalStatus: string;
  promptFile: string | null;
  voFiles: string[];
}

interface DeliveryManifest {
  show: string;
  season: number;
  episode: number;
  title: string;
  generatedAt: string;
  deliveryFolderId: string;
  totalShots: number;
  approvedShots: number;
  rejectedShots: number;
  pendingShots: number;
  totalVoFiles: number;
  shots: DeliveryManifestEntry[];
}

export async function runDelivery(episodeFolderDriveId?: string): Promise<void> {
  const state = loadState();

  if (!state && !episodeFolderDriveId) {
    throw new Error(
      'No pipeline state found. Run `zoomies intake` first, or provide a Drive folder ID.'
    );
  }

  const episode: EpisodeData = state!.episode;
  const finalDeliveryFolderId = state!.finalDeliveryFolderDriveId;
  const approvedFolderId = state!.approvedFolderDriveId;
  const sceneFolderMap = state!.sceneFolderMap;
  const showCode = SHOW_CODES[episode.show];

  const driveClient = await getDriveClient();

  console.log(`📦 Starting delivery assembly for S${episode.season}E${episode.episode} — ${episode.title}`);

  const s = String(episode.season).padStart(1, '0');
  const e = String(episode.episode).padStart(1, '0');

  const manifestEntries: DeliveryManifestEntry[] = [];
  let promptsCopied = 0;
  let voCopied = 0;

  // Process each shot
  for (const shot of episode.shots) {
    const entry: DeliveryManifestEntry = {
      shotId: shot.id,
      sceneId: shot.scene_id,
      approvalStatus: shot.approval_status || 'PENDING',
      promptFile: null,
      voFiles: [],
    };

    const deliveryPromptName = `${showCode}_S${s}E${e}_${shot.scene_id}_${shot.id}_PROMPT.txt`;
    const deliveryVoBase = `${showCode}_S${s}E${e}_${shot.scene_id}_${shot.id}`;

    // Copy approved prompt file to _Final_Delivery
    if (shot.prompt_drive_file_id && shot.approval_status === 'APPROVED') {
      try {
        await copyFileToDrive(
          driveClient,
          shot.prompt_drive_file_id,
          deliveryPromptName,
          finalDeliveryFolderId
        );
        entry.promptFile = deliveryPromptName;
        promptsCopied++;
      } catch (err) {
        console.warn(`  ⚠️  Could not copy prompt for ${shot.id}: ${(err as Error).message}`);
      }
    }

    // Copy VO files to _Final_Delivery (all VO regardless of approval — production may still use)
    if (shot.vo_files && shot.vo_files.length > 0) {
      for (const voFile of shot.vo_files) {
        const deliveryVoName = `${deliveryVoBase}_${voFile.character.toUpperCase()}_VO.mp3`;
        try {
          await copyFileToDrive(
            driveClient,
            voFile.drive_file_id,
            deliveryVoName,
            finalDeliveryFolderId
          );
          entry.voFiles.push(deliveryVoName);
          voCopied++;
        } catch (err) {
          console.warn(`  ⚠️  Could not copy VO for ${shot.id}/${voFile.character}: ${(err as Error).message}`);
        }
      }
    }

    manifestEntries.push(entry);
  }

  // Build manifest
  const approvedCount = episode.shots.filter((s) => s.approval_status === 'APPROVED').length;
  const rejectedCount = episode.shots.filter((s) => s.approval_status === 'REJECTED').length;
  const pendingCount = episode.shots.filter((s) => s.approval_status === 'PENDING').length;

  const manifest: DeliveryManifest = {
    show: episode.show,
    season: episode.season,
    episode: episode.episode,
    title: episode.title,
    generatedAt: new Date().toISOString(),
    deliveryFolderId: finalDeliveryFolderId,
    totalShots: episode.shots.length,
    approvedShots: approvedCount,
    rejectedShots: rejectedCount,
    pendingShots: pendingCount,
    totalVoFiles: voCopied,
    shots: manifestEntries,
  };

  await uploadJsonFile(
    driveClient,
    'DELIVERY_MANIFEST.json',
    manifest,
    finalDeliveryFolderId
  );

  const deliveryFolderLink = await getFolderWebLink(driveClient, finalDeliveryFolderId);

  console.log(`\n✅ Delivery assembly complete!`);
  console.log(`   Prompts copied: ${promptsCopied}`);
  console.log(`   VO files copied: ${voCopied}`);
  console.log(`   Manifest: DELIVERY_MANIFEST.json`);
  console.log(`   Delivery folder: ${deliveryFolderLink}`);

  // Slack notification
  try {
    await notifyDeliveryReady(episode, promptsCopied, voCopied, deliveryFolderLink);
    console.log(`💬 Slack notification sent`);
  } catch (err) {
    console.warn(`⚠️  Slack notification failed: ${(err as Error).message}`);
  }
}
