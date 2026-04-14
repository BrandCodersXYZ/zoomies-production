export type ShowCode = 'CWBH' | 'BHB';
export type ShowName = 'catwives' | 'bloodhound';
export type SceneTime = 'morning' | 'afternoon' | 'evening' | 'night';
export type SceneFunction =
  | 'setup'
  | 'confrontation'
  | 'revelation'
  | 'cliffhanger'
  | 'resolution'
  | 'comedy';
export type ShotAngle =
  | 'wide'
  | 'medium-two'
  | 'medium-single'
  | 'close-up'
  | 'extreme-close-up'
  | 'over-shoulder'
  | 'reaction'
  | 'insert';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type CharacterName =
  | 'kitty'
  | 'countess'
  | 'bambi'
  | 'dominique'
  | 'purrlita'
  | 'chase'
  | 'vicki'
  | 'kibble'
  | 'vanderpump';

export interface Scene {
  id: string;
  location: string;
  time: SceneTime;
  beat: string;
  function: SceneFunction;
  dialogue: string;
}

export interface Shot {
  id: string;
  scene_id: string;
  action: string;
  angle: ShotAngle;
  characters: CharacterName[];
  emotion: string;
  dialogue_line: string;
  duration_seconds: number;
  approval_status?: ApprovalStatus;
  rejection_notes?: string;
  prompt_drive_file_id?: string;
  image_drive_file_id?: string;
  image_filename?: string;
  vo_files?: Array<{ character: CharacterName; drive_file_id: string; filename: string }>;
}

export interface EpisodeData {
  show: ShowName;
  season: number;
  episode: number;
  title: string;
  logline: string;
  characters: CharacterName[];
  notes: string;
  scenes: Scene[];
  shots: Shot[];
}

export interface PipelineState {
  episode: EpisodeData;
  episodeFolderDriveId: string;
  workingFolderDriveId: string;
  approvedFolderDriveId: string;
  finalDeliveryFolderDriveId: string;
  sceneFolderMap: Record<string, string>;
  shotListJsonFileId: string;
  shotListTxtFileId: string;
  showCode: ShowCode;
  lastUpdated: string;
}

export interface CharacterConfig {
  name: CharacterName;
  show: ShowName;
  visualDescription: string;
  voiceDescription: string;
  referenceAudioEnvKey: string;
  referenceImageDriveIds: string[];  // Drive file IDs for character reference images (headshots, full body)
  dos: string[];
  donts: string[];
}
