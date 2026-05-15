export type ChildId = 'kanata' | 'hinata';

export type SourceType = 'manual-upload' | 'google-photos-picker' | 'google-drive-sync';

export type AlbumImage = {
  id: string;
  childId: ChildId;
  storagePath: string;
  downloadUrl?: string;
  caption?: string;
  takenAt?: string;
  sourceType: SourceType;
  sourceId?: string;
  sourceUrl?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  sortOrder?: number;
  isPublished: boolean;
};

export type ChildProfile = {
  id: ChildId;
  name: string;
  romanName: string;
  googlePhotosUrl: string;
};

export type ImportResult = {
  importedCount: number;
  skippedCount: number;
};
