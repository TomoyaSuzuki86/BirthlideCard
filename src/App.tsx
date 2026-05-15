import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Compass,
  ExternalLink,
  Heart,
  ImagePlus,
  Lock,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  childProfiles,
  deleteImage,
  getChildProfile,
  importPickedPhotoBlobs,
  updateImage,
  uploadManualFile,
  watchAllImages,
  watchPublishedImages,
} from './data';
import { firebaseReady } from './firebase';
import { startGooglePhotosImport } from './googlePhotosPicker';
import { useAuth, useInterval } from './hooks';
import type { AlbumImage, ChildId } from './types';

type ImageMap = Record<ChildId, AlbumImage[]>;

const emptyImages: ImageMap = { kanata: [], hinata: [] };
const mindTargetUrl = '/targets/meimeisho.mind?v=20260515-ar';

export function App() {
  const path = window.location.pathname;

  if (path.startsWith('/admin')) {
    return <AdminPage />;
  }

  if (path.startsWith('/add')) {
    return <PublicUploadPage />;
  }

  if (path.startsWith('/ar')) {
    return <ArPage />;
  }

  return <PublicAlbumPage />;
}

function PublicAlbumPage() {
  const [images, setImages] = useState<ImageMap>(emptyImages);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(firebaseReady);

  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false);
      return;
    }

    const loadingFallback = window.setTimeout(() => setLoading(false), 3000);
    const unsubscribers = childProfiles.map((child) =>
      watchPublishedImages(
        child.id,
        (nextImages) => {
          setImages((current) => ({ ...current, [child.id]: nextImages }));
          setLoading(false);
        },
        setError,
      ),
    );

    return () => {
      window.clearTimeout(loadingFallback);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Kanata & Hinata</p>
          <h1>今月の奏汰と日向</h1>
          <p className="hero-copy">
            命名書から来てくれてありがとうございます。奏汰と日向、それぞれの最新写真を並べて見られます。
          </p>
        </div>
        <div className="name-card" aria-label="奏汰と日向の命名書風カード">
          <span>奏汰</span>
          <span>日向</span>
        </div>
      </section>

      {error && <Notice tone="error">{error}</Notice>}
      {loading && <Notice>写真を読み込んでいます。</Notice>}

      <TwinSlideshow images={images} />

      <a className="manage-link" href="/add">
        <ImagePlus size={22} />
        写真を追加・整理する
      </a>

      <a className="ar-link" href="/ar">
        <Sparkles size={20} />
        AR表示を試す
      </a>
    </main>
  );
}

function PublicUploadPage() {
  const [selectedChildId, setSelectedChildId] = useState<ChildId>('kanata');
  const [images, setImages] = useState<AlbumImage[]>([]);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const child = getChildProfile(selectedChildId);

  useEffect(() => {
    if (!firebaseReady) return undefined;
    return watchAllImages(selectedChildId, setImages, setError);
  }, [selectedChildId]);

  const handleFiles = async (files?: FileList | File[]) => {
    const mediaFiles = Array.from(files ?? []).filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'));
    if (!mediaFiles.length) return;
    setBusy(`${mediaFiles.length}件の写真・動画を追加しています。`);
    setError('');
    try {
      for (const file of mediaFiles) {
        await uploadManualFile(selectedChildId, file, caption);
      }
      setCaption('');
      setBusy(`${mediaFiles.length}件追加しました。公開アルバムに反映されます。`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '写真の追加に失敗しました。');
      setBusy('');
    }
  };

  const handleGooglePhotosImport = async () => {
    setBusy('Googleフォトで選んだ写真を取り込んでいます。');
    setError('');
    try {
      const pickedPhotos = await startGooglePhotosImport();
      const result = await importPickedPhotoBlobs(selectedChildId, pickedPhotos);
      setBusy(`${result.importedCount}枚追加、${result.skippedCount}枚スキップしました。`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Googleフォト取り込みに失敗しました。');
      setBusy('');
    }
  };

  const handleDelete = async (image: AlbumImage) => {
    const ok = window.confirm('この写真を削除しますか？');
    if (!ok) return;
    setBusy('写真を削除しています。');
    setError('');
    try {
      await deleteImage(image);
      setBusy('削除しました。');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '写真の削除に失敗しました。');
      setBusy('');
    }
  };

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Family Upload</p>
          <h1>写真を追加・整理</h1>
        </div>
        <a className="secondary-button" href="/">
          アルバムへ戻る
        </a>
      </header>

      <Notice>ログインなしで写真を追加・削除できます。</Notice>
      {error && <Notice tone="error">{error}</Notice>}
      {busy && <Notice>{busy}</Notice>}

      <section className="admin-panel">
        <h2>だれの写真ですか？</h2>
        <div className="segmented">
          {childProfiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className={profile.id === selectedChildId ? 'active' : ''}
              onClick={() => setSelectedChildId(profile.id)}
            >
              {profile.name}
            </button>
          ))}
        </div>
      </section>

      <section
        className={dragActive ? 'admin-panel public-uploader drop-active' : 'admin-panel public-uploader'}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        <h2>{child.name}の写真を追加</h2>
        <label>
          キャプション
          <input value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="例: お昼寝中の一枚" />
        </label>
        <div className="drop-zone">
          <ImagePlus size={40} />
          <strong>ここに写真をドラッグ&ドロップ</strong>
          <span>スマホでは下のボタンから選べます</span>
        </div>
        <div className="action-grid">
          <label className="upload-button inline">
            <Camera size={24} />
            写真を選ぶ
            <input type="file" accept="image/*,video/*" multiple onChange={(event) => handleFiles(event.target.files ?? undefined)} />
          </label>
          <button className="primary-button" type="button" onClick={handleGooglePhotosImport}>
            <Cloud size={22} />
            Googleフォトから選ぶ
          </button>
        </div>
      </section>

      <section className="admin-panel">
        <div className="section-heading compact">
          <div>
            <p>{child.romanName}</p>
            <h2>追加済み写真</h2>
          </div>
          <span>{images.length}枚</span>
        </div>
        <div className="public-photo-grid">
          {images.map((image) => (
            <article className="public-photo-card" key={image.id}>
              {image.downloadUrl ? <MediaPreview media={image} alt={image.caption || `${child.name}の写真・動画`} /> : null}
              <p>{image.caption || 'キャプションなし'}</p>
              <button className="danger-button" type="button" onClick={() => handleDelete(image)}>
                <Trash2 size={18} />
                削除
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function TwinSlideshow({ images }: { images: ImageMap }) {
  const maxLength = Math.max(images.kanata.length, images.hinata.length);
  const [index, setIndex] = useState(0);

  const goNext = useCallback(() => {
    setIndex((current) => (maxLength ? (current + 1) % maxLength : 0));
  }, [maxLength]);

  const goPrev = () => {
    setIndex((current) => (maxLength ? (current - 1 + maxLength) % maxLength : 0));
  };

  useEffect(() => setIndex(0), [maxLength]);
  useInterval(goNext, 5000);

  return (
    <section className="twin-section">
      <div className="section-heading">
        <div>
          <p>Firebase Album</p>
          <h2>ふたりの最新スライドショー</h2>
        </div>
        <span>{maxLength}枚</span>
      </div>

      <div className="twin-grid">
        {childProfiles.map((child) => (
          <ChildSlide key={child.id} childId={child.id} image={images[child.id][index % Math.max(images[child.id].length, 1)]} />
        ))}
      </div>

      <div className="caption-row">
        <button type="button" className="round-button" onClick={goPrev} aria-label="前の写真">
          <ChevronLeft />
        </button>
        <p>左右の写真は同じタイミングで切り替わります</p>
        <button type="button" className="round-button" onClick={goNext} aria-label="次の写真">
          <ChevronRight />
        </button>
      </div>
    </section>
  );
}

function ChildSlide({ childId, image }: { childId: ChildId; image?: AlbumImage }) {
  const child = getChildProfile(childId);

  return (
    <article className="child-slide">
      <div className="child-title">
        <p>{child.romanName}</p>
        <h3>{child.name}</h3>
      </div>
      <div className="photo-frame">
        {image?.downloadUrl ? (
          <MediaPreview media={image} alt={image.caption || `${child.name}の写真・動画`} />
        ) : (
          <div className="empty-photo">
            <ImagePlus size={42} />
            <span>写真は準備中です</span>
            <a href={child.googlePhotosUrl} target="_blank" rel="noreferrer">
              Googleフォトを開く
              <ExternalLink size={16} />
            </a>
          </div>
        )}
      </div>
      <p className="photo-caption">{image?.caption || '今日の一枚'}</p>
    </article>
  );
}

function MediaPreview({ media, alt }: { media: AlbumImage; alt: string }) {
  if (!media.downloadUrl) {
    return null;
  }

  if (media.mediaType === 'video') {
    return <video src={media.downloadUrl} controls muted playsInline preload="metadata" aria-label={alt} />;
  }

  return <img src={media.downloadUrl} alt={alt} />;
}

function AdminPage() {
  const { user, loading, isAdmin, login, logout } = useAuth();
  const [selectedChildId, setSelectedChildId] = useState<ChildId>('kanata');
  const [images, setImages] = useState<AlbumImage[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const child = getChildProfile(selectedChildId);

  useEffect(() => {
    if (!firebaseReady || !isAdmin) return undefined;
    return watchAllImages(selectedChildId, setImages, setError);
  }, [selectedChildId, isAdmin]);

  const handleManualUpload = async (file?: File) => {
    if (!file) return;
    setBusy('Firebase Storageへ写真を保存しています。');
    try {
      await uploadManualFile(selectedChildId, file);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '写真の保存に失敗しました。');
    } finally {
      setBusy('');
    }
  };

  const handleGooglePhotosImport = async () => {
    setBusy('Googleフォトで選んだ写真を取り込んでいます。');
    setError('');
    try {
      const pickedPhotos = await startGooglePhotosImport();
      const result = await importPickedPhotoBlobs(selectedChildId, pickedPhotos);
      setBusy(`取り込み完了: ${result.importedCount}枚追加、${result.skippedCount}枚スキップしました。`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Googleフォト取り込みに失敗しました。');
      setBusy('');
    }
  };

  if (loading) {
    return <CenteredCard icon={<Lock />}>確認しています。</CenteredCard>;
  }

  if (!user) {
    return (
      <CenteredCard icon={<Lock />}>
        <h1>管理画面</h1>
        <p>写真の追加や取り込みにはGoogleログインが必要です。</p>
        <button className="primary-button" type="button" onClick={login}>
          Googleでログイン
        </button>
      </CenteredCard>
    );
  }

  if (!isAdmin) {
    return (
      <CenteredCard icon={<Lock />}>
        <h1>アクセスできません</h1>
        <p>{user.email} は管理者として登録されていません。</p>
        <button className="secondary-button" type="button" onClick={logout}>
          ログアウト
        </button>
      </CenteredCard>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>写真取り込み管理</h1>
        </div>
        <button className="secondary-button" type="button" onClick={logout}>
          ログアウト
        </button>
      </header>

      {error && <Notice tone="error">{error}</Notice>}
      {busy && <Notice>{busy}</Notice>}

      <section className="admin-panel">
        <h2>対象を選ぶ</h2>
        <div className="segmented">
          {childProfiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className={profile.id === selectedChildId ? 'active' : ''}
              onClick={() => setSelectedChildId(profile.id)}
            >
              {profile.name}
            </button>
          ))}
        </div>
      </section>

      <section className="admin-panel">
        <h2>{child.name}の写真を追加</h2>
        <div className="action-grid">
          <button className="primary-button" type="button" onClick={handleGooglePhotosImport}>
            <Cloud size={22} />
            Googleフォトから取り込む
          </button>
          <label className="upload-button inline">
            <Camera size={22} />
            手元の写真を追加
            <input type="file" accept="image/*,video/*" onChange={(event) => handleManualUpload(event.target.files?.[0])} />
          </label>
        </div>
        <a className="external-album-link" href={child.googlePhotosUrl} target="_blank" rel="noreferrer">
          既存Googleフォト共有アルバムを開く
          <ExternalLink size={16} />
        </a>
      </section>

      <section className="admin-panel">
        <div className="section-heading compact">
          <div>
            <p>{child.romanName}</p>
            <h2>取り込み済み画像</h2>
          </div>
          <span>{images.length}枚</span>
        </div>
        <div className="photo-editor-list">
          {images.map((image) => (
            <ImageEditor key={image.id} image={image} />
          ))}
        </div>
      </section>
    </main>
  );
}

function ImageEditor({ image }: { image: AlbumImage }) {
  const [caption, setCaption] = useState(image.caption ?? '');
  const sourceLabel = {
    'manual-upload': '手動追加',
    'google-photos-picker': 'Googleフォト',
    'google-drive-sync': 'Drive同期',
  }[image.sourceType];

  useEffect(() => setCaption(image.caption ?? ''), [image.caption]);

  return (
    <article className="photo-editor">
      {image.downloadUrl ? <MediaPreview media={image} alt={caption || '取り込み済み写真・動画'} /> : <div className="thumb-placeholder" />}
      <div>
        <div className="editor-meta">
          <span className="status-pill active">{image.isPublished ? '公開中' : '非公開'}</span>
          <span className="status-pill">{sourceLabel}</span>
        </div>
        <label>
          キャプション
          <textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            onBlur={() => updateImage(image, { caption })}
          />
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={image.isPublished}
            onChange={(event) => updateImage(image, { isPublished: event.target.checked })}
          />
          公開アルバムに表示する
        </label>
      </div>
    </article>
  );
}

function ArPage() {
  const [images, setImages] = useState<ImageMap>(emptyImages);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(firebaseReady);
  const [targetReady, setTargetReady] = useState(false);
  const [scriptsReady, setScriptsReady] = useState(false);
  const [arMessage, setArMessage] = useState('ARを準備しています。');
  const maxLength = Math.max(images.kanata.length, images.hinata.length);
  const hasArMedia = maxLength > 0;

  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false);
      return undefined;
    }

    const loadingFallback = window.setTimeout(() => setLoading(false), 3000);
    const unsubscribers = childProfiles.map((child) =>
      watchPublishedImages(
        child.id,
        (nextImages) => {
          setImages((current) => ({ ...current, [child.id]: nextImages }));
          setLoading(false);
        },
        setError,
      ),
    );

    return () => {
      window.clearTimeout(loadingFallback);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  useEffect(() => {
    const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (!isSecure || !navigator.mediaDevices?.getUserMedia) {
      setArMessage('この端末ではARカメラを起動できません。通常アルバムでご覧ください。');
      return;
    }

    fetch(mindTargetUrl, { method: 'GET', cache: 'no-store' })
      .then(async (response) => {
        const targetBytes = await response.arrayBuffer();
        const hasTarget = response.ok && targetBytes.byteLength > 1024;
        setTargetReady(hasTarget);
        if (!hasTarget) {
          setArMessage('AR用ターゲットファイルがまだありません。命名書画像から .mind ファイルを作成すると起動できます。');
        }
      })
      .catch(() => {
        setArMessage('AR用ターゲットファイルを確認できませんでした。通常アルバムでご覧ください。');
      });
  }, []);

  useEffect(() => {
    if (!targetReady) return;

    loadScript('https://aframe.io/releases/1.5.0/aframe.min.js')
      .then(() => loadScript('https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js'))
      .then(() => {
        setScriptsReady(true);
        setArMessage('命名書をカメラに写してください。');
      })
      .catch(() => {
        setArMessage('ARライブラリの読み込みに失敗しました。通常アルバムでご覧ください。');
      });
  }, [targetReady]);

  if (targetReady && scriptsReady && hasArMedia) {
    return (
      <main className="ar-camera-page">
        <div className="ar-toolbar">
          <span>{arMessage}</span>
          <a href="/">通常アルバム</a>
        </div>
        <MindArScene images={images} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="ar-panel">
        <Compass size={44} />
        <h1>AR表示</h1>
        {error && <Notice tone="error">{error}</Notice>}
        {loading && <Notice>写真を読み込んでいます。</Notice>}
        <p>{arMessage}</p>
        <p>ARが使えない端末や、ターゲット未作成の間は通常アルバムへ戻れます。</p>
        <a className="primary-button" href="/">
          通常アルバムを見る
        </a>
      </section>
    </main>
  );
}

function MindArScene({ images }: { images: ImageMap }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const arData = {
    kanata: images.kanata.map(toArMedia),
    hinata: images.hinata.map(toArMedia),
  };

  useEffect(() => {
    const root = stageRef.current;
    if (!root) return undefined;

    let index = 0;
    const fit = (aspect: number) => {
      const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
      const maxWidth = 0.68;
      const maxHeight = 0.92;
      if (safeAspect >= maxWidth / maxHeight) return { width: maxWidth, height: maxWidth / safeAspect };
      return { width: maxHeight * safeAspect, height: maxHeight };
    };
    const setSize = (plane: Element, aspect: number) => {
      const size = fit(aspect);
      plane.setAttribute('width', String(size.width));
      plane.setAttribute('height', String(size.height));
    };
    const apply = (side: ChildId, item?: ReturnType<typeof toArMedia>) => {
      const imageAsset = root.querySelector<HTMLImageElement>(`#${side}-image-asset`);
      const videoAsset = root.querySelector<HTMLVideoElement>(`#${side}-video-asset`);
      const imagePlane = root.querySelector(`#${side}-image-plane`);
      const videoPlane = root.querySelector(`#${side}-video-plane`);
      if (!imageAsset || !videoAsset || !imagePlane || !videoPlane) return;

      imagePlane.setAttribute('visible', 'false');
      videoPlane.setAttribute('visible', 'false');
      if (!item?.url) return;

      if (item.mediaType === 'video') {
        videoAsset.src = item.url;
        videoAsset.load();
        videoAsset.onloadedmetadata = () => setSize(videoPlane, videoAsset.videoWidth / videoAsset.videoHeight);
        videoAsset.play().catch(() => {});
        videoPlane.setAttribute('visible', 'true');
        return;
      }

      imageAsset.src = item.url;
      imageAsset.onload = () => setSize(imagePlane, imageAsset.naturalWidth / imageAsset.naturalHeight);
      imagePlane.setAttribute('visible', 'true');
    };
    const show = () => {
      apply('kanata', arData.kanata[index % Math.max(arData.kanata.length, 1)]);
      apply('hinata', arData.hinata[index % Math.max(arData.hinata.length, 1)]);
      index += 1;
    };

    const startTimer = window.setTimeout(show, 500);
    const interval = window.setInterval(show, 5000);
    return () => {
      window.clearTimeout(startTimer);
      window.clearInterval(interval);
    };
  }, [arData.kanata, arData.hinata]);

  const sceneHtml = `
    <a-scene
      mindar-image="imageTargetSrc: ${mindTargetUrl}; autoStart: true; uiScanning: yes; uiLoading: yes; uiError: yes;"
      color-space="sRGB"
      renderer="colorManagement: true, physicallyCorrectLights"
      vr-mode-ui="enabled: false"
      device-orientation-permission-ui="enabled: false"
    >
      <a-assets>
        <img id="kanata-image-asset" crossorigin="anonymous" />
        <img id="hinata-image-asset" crossorigin="anonymous" />
        <video id="kanata-video-asset" crossorigin="anonymous" autoplay loop muted playsinline webkit-playsinline preload="auto"></video>
        <video id="hinata-video-asset" crossorigin="anonymous" autoplay loop muted playsinline webkit-playsinline preload="auto"></video>
      </a-assets>
      <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
      <a-entity mindar-image-target="targetIndex: 0">
        <a-image id="kanata-image-plane" src="#kanata-image-asset" position="-0.48 0.03 0" visible="false"></a-image>
        <a-video id="kanata-video-plane" src="#kanata-video-asset" position="-0.48 0.03 0" visible="false"></a-video>
        <a-image id="hinata-image-plane" src="#hinata-image-asset" position="0.48 0.03 0" visible="false"></a-image>
        <a-video id="hinata-video-plane" src="#hinata-video-asset" position="0.48 0.03 0" visible="false"></a-video>
      </a-entity>
    </a-scene>
  `;

  return <div className="ar-stage" ref={stageRef} key="ar-scene" dangerouslySetInnerHTML={{ __html: sceneHtml }} />;
}

function toArMedia(media: AlbumImage) {
  return {
    id: media.id,
    url: media.downloadUrl,
    mediaType: media.mediaType ?? 'image',
  };
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') resolve();
      else existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.loaded = 'false';
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Script load failed: ${src}`));
    document.head.appendChild(script);
  });
}

function CenteredCard({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <main className="centered-page">
      <section className="center-card">
        <div className="center-icon">{icon}</div>
        {children}
      </section>
    </main>
  );
}

function Notice({ children, tone }: { children: ReactNode; tone?: 'error' }) {
  return (
    <div className={tone === 'error' ? 'notice error' : 'notice'}>
      <Heart size={18} />
      <span>{children}</span>
    </div>
  );
}
