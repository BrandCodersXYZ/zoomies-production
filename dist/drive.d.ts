import { google } from 'googleapis';
export declare function getDriveClient(): Promise<import("googleapis").drive_v3.Drive>;
export declare function createFolder(driveClient: ReturnType<typeof google.drive>, name: string, parentId: string): Promise<string>;
export declare function uploadTextFile(driveClient: ReturnType<typeof google.drive>, name: string, content: string, parentId: string): Promise<string>;
export declare function uploadJsonFile(driveClient: ReturnType<typeof google.drive>, name: string, data: unknown, parentId: string): Promise<string>;
export declare function updateJsonFile(driveClient: ReturnType<typeof google.drive>, fileId: string, data: unknown): Promise<void>;
export declare function uploadBinaryFile(driveClient: ReturnType<typeof google.drive>, name: string, filePath: string, mimeType: string, parentId: string): Promise<string>;
export declare function readTextFile(driveClient: ReturnType<typeof google.drive>, fileId: string): Promise<string>;
export declare function readJsonFile<T>(driveClient: ReturnType<typeof google.drive>, fileId: string): Promise<T>;
export declare function copyFileToDrive(driveClient: ReturnType<typeof google.drive>, fileId: string, newName: string, destinationFolderId: string): Promise<string>;
export declare function listFilesInFolder(driveClient: ReturnType<typeof google.drive>, folderId: string): Promise<Array<{
    id: string;
    name: string;
    mimeType: string;
}>>;
/** Download a Drive file and return its bytes as a base64 string. */
export declare function downloadFileAsBase64(driveClient: ReturnType<typeof google.drive>, fileId: string): Promise<string>;
export declare function getFolderWebLink(driveClient: ReturnType<typeof google.drive>, fileId: string): Promise<string>;
//# sourceMappingURL=drive.d.ts.map