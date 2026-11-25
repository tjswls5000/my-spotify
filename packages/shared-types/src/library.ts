export interface LibraryFolderDto {
  id: string;
  name: string;
  path: string;
  trackCount: number;
  isWatching: boolean;
  lastScannedAt: string | null;
  createdAt: string;
}

export interface AddLibraryFolderRequestDto {
  path: string;
  name?: string;
}

export interface ScanLibraryRequestDto {
  libraryFolderId?: string;
}

export interface ScanResultDto {
  scannedFolders: number;
  filesFound: number;
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  durationMs: number;
  scannedAt: string;
}

export interface DirectoryEntryDto {
  name: string;
  path: string;
}

export interface DirectoryBrowseResponseDto {
  currentPath: string;
  parentPath: string | null;
  directories: DirectoryEntryDto[];
  audioFileCount: number;
}
