type TokenResponse = {
  access_token?: string;
  error?: string;
};

type TokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

type PickedMediaItem = {
  id: string;
  mediaFile?: {
    baseUrl?: string;
    mimeType?: string;
    filename?: string;
    mediaFileMetadata?: {
      creationTime?: string;
    };
  };
};

type PickerSession = {
  id: string;
  pickerUri: string;
  mediaItemsSet?: boolean;
  pollingConfig?: {
    pollInterval?: string;
    timeoutIn?: string;
  };
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

const photosPickerScope = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const pickerEndpoint = 'https://photospicker.googleapis.com/v1';

function getGoogleClientId() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('VITE_GOOGLE_CLIENT_ID が未設定です。Google Photos Picker API用のOAuthクライアントIDを設定してください。');
  }
  return clientId;
}

function loadGoogleIdentityScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Identity Servicesの読み込みに失敗しました。')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Identity Servicesの読み込みに失敗しました。'));
    document.head.appendChild(script);
  });
}

async function requestAccessToken() {
  await loadGoogleIdentityScript();

  return new Promise<string>((resolve, reject) => {
    const tokenClient = window.google?.accounts?.oauth2?.initTokenClient({
      client_id: getGoogleClientId(),
      scope: photosPickerScope,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? 'Googleフォトの認可に失敗しました。'));
          return;
        }
        resolve(response.access_token);
      },
    });

    if (!tokenClient) {
      reject(new Error('Google Identity Servicesを初期化できませんでした。'));
      return;
    }

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

async function photosRequest<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${pickerEndpoint}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Google Photos Picker API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function secondsFromDuration(duration?: string, fallback = 3) {
  const match = duration?.match(/^(\d+)s$/);
  return match ? Number(match[1]) : fallback;
}

async function waitForPickedMedia(session: PickerSession, accessToken: string) {
  const startedAt = Date.now();
  let current = session;

  while (!current.mediaItemsSet) {
    const timeoutSeconds = secondsFromDuration(current.pollingConfig?.timeoutIn, 600);
    if (Date.now() - startedAt > timeoutSeconds * 1000) {
      throw new Error('Googleフォトでの写真選択が時間切れになりました。');
    }

    const waitSeconds = secondsFromDuration(current.pollingConfig?.pollInterval, 3);
    await new Promise((resolve) => window.setTimeout(resolve, waitSeconds * 1000));
    current = await photosRequest<PickerSession>(`/sessions/${session.id}`, accessToken);
  }
}

async function listPickedMedia(sessionId: string, accessToken: string) {
  const items: PickedMediaItem[] = [];
  let pageToken = '';

  do {
    const params = new URLSearchParams({ sessionId });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await photosRequest<{ mediaItems?: PickedMediaItem[]; nextPageToken?: string }>(
      `/mediaItems?${params.toString()}`,
      accessToken,
    );
    items.push(...(response.mediaItems ?? []));
    pageToken = response.nextPageToken ?? '';
  } while (pageToken);

  return items;
}

async function downloadPickedMedia(item: PickedMediaItem, accessToken: string) {
  const baseUrl = item.mediaFile?.baseUrl;
  if (!baseUrl) {
    throw new Error('Googleフォトの画像URLを取得できませんでした。');
  }

  const downloadSuffix = item.mediaFile?.mimeType?.startsWith('video/') ? '=dv' : '=d';
  const response = await fetch(`${baseUrl}${downloadSuffix}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Googleフォト画像の取得に失敗しました: ${response.status}`);
  }

  return {
    sourceId: item.id,
    sourceUrl: undefined,
    takenAt: item.mediaFile?.mediaFileMetadata?.creationTime,
    blob: await response.blob(),
  };
}

export async function startGooglePhotosImport() {
  const accessToken = await requestAccessToken();
  const session = await photosRequest<PickerSession>('/sessions', accessToken, { method: 'POST', body: '{}' });

  window.open(`${session.pickerUri}/autoclose`, 'google-photos-picker', 'popup,width=980,height=720');
  await waitForPickedMedia(session, accessToken);
  const mediaItems = await listPickedMedia(session.id, accessToken);

  try {
    await photosRequest(`/sessions/${session.id}`, accessToken, { method: 'DELETE' });
  } catch {
    // The session is short-lived; import can continue even if cleanup fails.
  }

  const supportedMedia = mediaItems.filter((item) => {
    const mimeType = item.mediaFile?.mimeType ?? '';
    return mimeType.startsWith('image/') || mimeType.startsWith('video/');
  });
  return Promise.all(supportedMedia.map((item) => downloadPickedMedia(item, accessToken)));
}
