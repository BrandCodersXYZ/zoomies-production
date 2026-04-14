import { EpisodeData } from './types';
export declare function notifyPipelineStarted(episode: EpisodeData, episodeFolderLink: string, episodeFolderId?: string): Promise<void>;
export declare function notifyApprovalComplete(episode: EpisodeData, approvedCount: number, rejectedCount: number, approvedFolderLink: string, hasRejections: boolean, episodeFolderId?: string): Promise<void>;
export declare function notifyDeliveryReady(episode: EpisodeData, shotCount: number, voiceCount: number, deliveryFolderLink: string): Promise<void>;
//# sourceMappingURL=slack.d.ts.map