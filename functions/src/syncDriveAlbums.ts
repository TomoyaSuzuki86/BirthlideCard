import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { google } from 'googleapis';
import sharp from 'sharp';

type ChildId = 'kanata' | 'hinata';

type SyncCounter = {
  importedCount: number;
  skippedCount: number;
};

initializeApp();

const db = getFirestore();
const bucket = getStorage().bucket();

const childFolders: Array<{ childId: ChildId; envName: string }> = [
  { childId: 'kanata', envName: 'KANATA_DRIVE_FOLDER_ID' },
  { childId: 'hinata', envName: 'HINATA_DRIVE_FOLDER_ID' },
];

export const syncDriveAlbums = onSchedule(
  {
    schedule: 'every day 03:00',
    timeZone: 'Asia/Tokyo',
    memory: '1GiB',
    timeoutSeconds: 540,
  },
  async () => {
    const logRef = db.collection('syncLogs').doc();
    await logRef.set({
      sourceType: 'google-drive-sync',
      startedAt: FieldValue.serverTimestamp(),
      status: 'running',
      importedCount: 0,
      skippedCount: 0,
    });

    const totals: SyncCounter = { importedCount: 0, skippedCount: 0 };

    try {
      for (const folder of childFolders) {
        const folderId = process.env[folder.envName];
        if (!folderId) continue;

        const result = await syncChildFolder(folder.childId, folderId);
        totals.importedCount += result.importedCount;
        totals.skippedCount += result.skippedCount;
      }

      await logRef.update({
        finishedAt: FieldValue.serverTimestamp(),
        status: 'success',
        importedCount: totals.importedCount,
        skippedCount: totals.skippedCount,
      });
    } catch (error) {
      await logRef.update({
        finishedAt: FieldValue.serverTimestamp(),
        status: 'failed',
        importedCount: totals.importedCount,
        skippedCount: totals.skippedCount,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
);

async function syncChildFolder(childId: ChildId, folderId: string): Promise<SyncCounter> {
  const auth = await google.auth.getClient({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  const drive = google.drive({ version: 'v3', auth });
  const counter: SyncCounter = { importedCount: 0, skippedCount: 0 };
  let pageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`,
      fields: 'nextPageToken, files(id, name, mimeType, createdTime, imageMediaMetadata)',
      pageSize: 100,
      pageToken,
    });

    for (const file of response.data.files ?? []) {
      if (!file.id || !file.mimeType) continue;

      const exists = await db
        .collection('albums')
        .doc(childId)
        .collection('images')
        .where('sourceType', '==', 'google-drive-sync')
        .where('sourceId', '==', file.id)
        .limit(1)
        .get();

      if (!exists.empty) {
        counter.skippedCount += 1;
        continue;
      }

      await importDriveFile(childId, file.id, file.mimeType, file.createdTime ?? undefined);
      counter.importedCount += 1;
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return counter;
}

async function importDriveFile(childId: ChildId, fileId: string, mimeType: string, createdTime?: string) {
  const auth = await google.auth.getClient({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  const drive = google.drive({ version: 'v3', auth });
  const imageId = db.collection('albums').doc().id;
  const takenAt = createdTime ?? new Date().toISOString();
  const month = monthFolder(takenAt);
  const tempDir = await mkdtemp(join(tmpdir(), 'birthlidecard-'));
  const originalPath = join(tempDir, 'original');
  const webpPath = join(tempDir, 'image.webp');
  const thumbPath = join(tempDir, 'thumb.webp');

  try {
    const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    await pipeline(response.data as Readable, createWriteStream(originalPath));

    await sharp(originalPath).rotate().resize({ width: 1800, withoutEnlargement: true }).webp({ quality: 86 }).toFile(webpPath);
    await sharp(originalPath).rotate().resize(480, 480, { fit: 'cover' }).webp({ quality: 78 }).toFile(thumbPath);

    const originalExtension = extensionFor(mimeType);
    const originalStoragePath = `albums/${childId}/${month}/${imageId}.${originalExtension}`;
    const webpStoragePath = `albums/${childId}/${month}/${imageId}.webp`;
    const thumbStoragePath = `albums/${childId}/${month}/${imageId}_thumb.webp`;

    await bucket.upload(originalPath, { destination: originalStoragePath, metadata: { contentType: mimeType } });
    await bucket.upload(webpPath, { destination: webpStoragePath, metadata: { contentType: 'image/webp' } });
    await bucket.upload(thumbPath, { destination: thumbStoragePath, metadata: { contentType: 'image/webp' } });

    const [downloadUrl] = await bucket.file(webpStoragePath).getSignedUrl({
      action: 'read',
      expires: '03-01-2500',
    });

    await db.collection('albums').doc(childId).collection('images').doc(imageId).set({
      id: imageId,
      childId,
      storagePath: webpStoragePath,
      originalStoragePath,
      thumbStoragePath,
      downloadUrl,
      caption: '',
      takenAt,
      sourceType: 'google-drive-sync',
      sourceId: fileId,
      sourceUrl: `https://drive.google.com/file/d/${fileId}/view`,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      sortOrder: 0,
      isPublished: true,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function monthFolder(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return new Date().toISOString().slice(0, 7);
  return date.toISOString().slice(0, 7);
}

function extensionFor(mimeType: string) {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  return 'jpg';
}
