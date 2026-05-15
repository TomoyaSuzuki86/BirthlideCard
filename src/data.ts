import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from './firebase';
import type { AlbumImage, ChildId, ImportResult, MediaType, SourceType } from './types';

export const childProfiles = [
  {
    id: 'kanata',
    name: '奏汰',
    romanName: 'Kanata',
    googlePhotosUrl: 'https://photos.app.goo.gl/t5dm2SNA5vAoSrdC7',
  },
  {
    id: 'hinata',
    name: '日向',
    romanName: 'Hinata',
    googlePhotosUrl: 'https://photos.app.goo.gl/m8C3Rw2X3EixuG418',
  },
] as const;

export const childIds: ChildId[] = ['kanata', 'hinata'];

export function getChildProfile(childId: ChildId) {
  return childProfiles.find((child) => child.id === childId) ?? childProfiles[0];
}

function imagesRef(childId: ChildId) {
  return collection(db, 'albums', childId, 'images');
}

function toAlbumImage(childId: ChildId, id: string, data: Record<string, unknown>): AlbumImage {
  const storagePath = String(data.storagePath ?? '');
  const mediaType =
    data.mediaType === 'video' || /\.(mp4|mov|m4v|webm)$/i.test(storagePath) ? 'video' : ('image' as MediaType);

  return {
    id,
    childId,
    storagePath,
    downloadUrl: typeof data.downloadUrl === 'string' ? data.downloadUrl : undefined,
    mediaType,
    caption: typeof data.caption === 'string' ? data.caption : undefined,
    takenAt: typeof data.takenAt === 'string' ? data.takenAt : undefined,
    sourceType: (data.sourceType as SourceType | undefined) ?? 'manual-upload',
    sourceId: typeof data.sourceId === 'string' ? data.sourceId : undefined,
    sourceUrl: typeof data.sourceUrl === 'string' ? data.sourceUrl : undefined,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : undefined,
    isPublished: Boolean(data.isPublished),
  };
}

function sortImages(images: AlbumImage[]) {
  return [...images].sort((a, b) => {
    const aTime = a.takenAt ? new Date(a.takenAt).getTime() : 0;
    const bTime = b.takenAt ? new Date(b.takenAt).getTime() : 0;
    return bTime - aTime;
  });
}

export function watchPublishedImages(
  childId: ChildId,
  onChange: (images: AlbumImage[]) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    query(imagesRef(childId), where('isPublished', '==', true)),
    (snapshot) => onChange(sortImages(snapshot.docs.map((imageDoc) => toAlbumImage(childId, imageDoc.id, imageDoc.data())))),
    (error) => onError(error.message),
  );
}

export function watchAllImages(
  childId: ChildId,
  onChange: (images: AlbumImage[]) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    imagesRef(childId),
    (snapshot) => onChange(sortImages(snapshot.docs.map((imageDoc) => toAlbumImage(childId, imageDoc.id, imageDoc.data())))),
    (error) => onError(error.message),
  );
}

async function sourceExists(childId: ChildId, sourceType: SourceType, sourceId?: string) {
  if (!sourceId) return false;
  const existing = await getDocs(
    query(imagesRef(childId), where('sourceType', '==', sourceType), where('sourceId', '==', sourceId), limit(1)),
  );
  return !existing.empty;
}

function monthFolder(takenAt?: string) {
  const date = takenAt ? new Date(takenAt) : new Date();
  const year = Number.isFinite(date.getTime()) ? date.getFullYear() : new Date().getFullYear();
  const month = String((Number.isFinite(date.getTime()) ? date.getMonth() : new Date().getMonth()) + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function extensionFor(mimeType: string) {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('quicktime')) return 'mov';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('png')) return 'png';
  return 'jpg';
}

function mediaTypeFor(mimeType: string): MediaType {
  return mimeType.startsWith('video/') ? 'video' : 'image';
}

export async function uploadImageBlob({
  childId,
  blob,
  caption = '',
  takenAt,
  sourceType,
  sourceId,
  sourceUrl,
  isPublished = true,
}: {
  childId: ChildId;
  blob: Blob;
  caption?: string;
  takenAt?: string;
  sourceType: SourceType;
  sourceId?: string;
  sourceUrl?: string;
  isPublished?: boolean;
}) {
  if (await sourceExists(childId, sourceType, sourceId)) {
    return { imported: false };
  }

  const imageId = crypto.randomUUID();
  const extension = extensionFor(blob.type);
  const mediaType = mediaTypeFor(blob.type);
  const storagePath = `albums/${childId}/${monthFolder(takenAt)}/${imageId}.${extension}`;
  const imageRef = ref(storage, storagePath);
  await uploadBytes(imageRef, blob, { contentType: blob.type || 'image/jpeg' });
  const downloadUrl = await getDownloadURL(imageRef);
  const now = serverTimestamp();

  await setDoc(doc(db, 'albums', childId, 'images', imageId), {
    id: imageId,
    childId,
    storagePath,
    downloadUrl,
    mediaType,
    caption,
    takenAt: takenAt ?? new Date().toISOString(),
    sourceType,
    sourceId: sourceId ?? null,
    sourceUrl: sourceUrl ?? null,
    createdAt: now,
    updatedAt: now,
    sortOrder: 0,
    isPublished,
  });

  return { imported: true, imageId };
}

export async function uploadManualFile(childId: ChildId, file: File, caption = '') {
  return uploadImageBlob({
    childId,
    blob: file,
    caption,
    takenAt: new Date(file.lastModified || Date.now()).toISOString(),
    sourceType: 'manual-upload',
    sourceId: `${file.name}-${file.size}-${file.lastModified}`,
  });
}

export async function importPickedPhotoBlobs(
  childId: ChildId,
  photos: Array<{ sourceId: string; sourceUrl?: string; takenAt?: string; blob: Blob }>,
): Promise<ImportResult> {
  let importedCount = 0;
  let skippedCount = 0;

  for (const photo of photos) {
    const result = await uploadImageBlob({
      childId,
      blob: photo.blob,
      takenAt: photo.takenAt,
      sourceType: 'google-photos-picker',
      sourceId: photo.sourceId,
      sourceUrl: photo.sourceUrl,
      isPublished: true,
    });

    if (result.imported) importedCount += 1;
    else skippedCount += 1;
  }

  return { importedCount, skippedCount };
}

export async function updateImage(image: AlbumImage, patch: Partial<AlbumImage>) {
  await updateDoc(doc(db, 'albums', image.childId, 'images', image.id), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteImage(image: AlbumImage) {
  if (image.storagePath) {
    await deleteObject(ref(storage, image.storagePath)).catch((error: unknown) => {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      if (code !== 'storage/object-not-found') {
        throw error;
      }
    });
  }

  await deleteDoc(doc(db, 'albums', image.childId, 'images', image.id));
}
