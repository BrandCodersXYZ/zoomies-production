import { WebClient } from '@slack/web-api';
import { EpisodeData, ShowName } from './types';
import { SHOW_DISPLAY_NAMES, SHOW_CODES } from './constants/characters';

let _client: WebClient | null = null;

function getClient(): WebClient {
  if (!_client) {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) throw new Error('SLACK_BOT_TOKEN is not set in .env');
    _client = new WebClient(token);
  }
  return _client;
}

function getChannel(): string {
  const channel = process.env.ZOOMIES_SLACK_CHANNEL;
  if (!channel) throw new Error('ZOOMIES_SLACK_CHANNEL is not set in .env');
  return channel;
}

export async function notifyPipelineStarted(
  episode: EpisodeData,
  episodeFolderLink: string,
  episodeFolderId?: string
): Promise<void> {
  const client = getClient();
  const showName = SHOW_DISPLAY_NAMES[episode.show];
  const appUrl = process.env.APP_URL;
  const approvalLink = appUrl && episodeFolderId
    ? `${appUrl.replace(/\/$/, '')}/episode/${episodeFolderId}`
    : null;

  const text =
    `🎬 *New episode in pipeline*\n` +
    `*Show:* ${showName}\n` +
    `*Episode:* S${episode.season}E${episode.episode} — ${episode.title}\n` +
    `*Logline:* ${episode.logline}\n` +
    `*Scenes:* ${episode.scenes.length} | *Shots:* ${episode.shots.length}\n` +
    `*Drive:* ${episodeFolderLink}\n` +
    (approvalLink ? `*Review shots:* ${approvalLink}\n` : '') +
    `*Status:* Generating frames + voices — approval link above will be live shortly`;

  await client.chat.postMessage({
    channel: getChannel(),
    text,
    mrkdwn: true,
  });
}

export async function notifyApprovalComplete(
  episode: EpisodeData,
  approvedCount: number,
  rejectedCount: number,
  approvedFolderLink: string,
  hasRejections: boolean,
  episodeFolderId?: string
): Promise<void> {
  const client = getClient();
  const appUrl = process.env.APP_URL;
  const approvalLink = appUrl && episodeFolderId
    ? `${appUrl.replace(/\/$/, '')}/episode/${episodeFolderId}`
    : null;

  let text =
    `✅ *${approvedCount} shots approved* / ❌ *${rejectedCount} rejected*\n` +
    `*Episode:* S${episode.season}E${episode.episode} — ${episode.title}\n` +
    `*Approved folder:* ${approvedFolderLink}`;

  if (hasRejections) {
    text += `\n_${rejectedCount} shots rejected — feedback saved_`;
    if (approvalLink) text += `\n*Re-review:* ${approvalLink}`;
  }

  await client.chat.postMessage({
    channel: getChannel(),
    text,
    mrkdwn: true,
  });
}

export async function notifyDeliveryReady(
  episode: EpisodeData,
  shotCount: number,
  voiceCount: number,
  deliveryFolderLink: string
): Promise<void> {
  const client = getClient();

  const text =
    `📦 *Delivery folder ready*\n` +
    `*Episode:* S${episode.season}E${episode.episode} — ${episode.title}\n` +
    `*${shotCount} shots, ${voiceCount} VO files*\n` +
    `*Delivery folder:* ${deliveryFolderLink}`;

  await client.chat.postMessage({
    channel: getChannel(),
    text,
    mrkdwn: true,
  });
}
