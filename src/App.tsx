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
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  childProfiles,
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

export function App() {
  const path = window.location.pathname;

  if (path.startsWith('/admin')) {
    return <AdminPage />;
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

      <a className="ar-link" href="/ar">
        <Sparkles size={20} />
        AR表示を試す
      </a>
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
  useInterval(goNext, 5200);

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
          <img src={image.downloadUrl} alt={image.caption || `${child.name}の写真`} />
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
            <input type="file" accept="image/*" onChange={(event) => handleManualUpload(event.target.files?.[0])} />
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
      {image.downloadUrl ? <img src={image.downloadUrl} alt={caption || '取り込み済み写真'} /> : <div className="thumb-placeholder" />}
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
  const [index, setIndex] = useState(0);

  const slideImage = images.kanata[index % Math.max(images.kanata.length, 1)] ?? images.hinata[index % Math.max(images.hinata.length, 1)];

  const goNext = useCallback(() => {
    setIndex((current) => (maxLength ? (current + 1) % maxLength : 0));
  }, [maxLength]);

  useInterval(goNext, 5200);

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

    fetch('/targets/meimeisho.mind', { method: 'GET' })
      .then((response) => {
        const contentType = response.headers.get('content-type') ?? '';
        const hasTarget = response.ok && !contentType.includes('text/html');
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

  if (targetReady && scriptsReady && slideImage?.downloadUrl) {
    return (
      <main className="ar-camera-page">
        <div className="ar-toolbar">
          <span>{arMessage}</span>
          <a href="/">通常アルバム</a>
        </div>
        <MindArScene imageUrl={slideImage.downloadUrl} />
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

function MindArScene({ imageUrl }: { imageUrl: string }) {
  const sceneHtml = `
    <a-scene
      mindar-image="imageTargetSrc: /targets/meimeisho.mind; autoStart: true; uiScanning: yes; uiLoading: yes; uiError: yes;"
      color-space="sRGB"
      renderer="colorManagement: true, physicallyCorrectLights"
      vr-mode-ui="enabled: false"
      device-orientation-permission-ui="enabled: false"
    >
      <a-assets>
        <img id="ar-slide" crossorigin="anonymous" src="${escapeAttribute(imageUrl)}" />
      </a-assets>
      <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
      <a-entity mindar-image-target="targetIndex: 0">
        <a-plane src="#ar-slide" position="0 0 0" width="1.08" height="0.72"></a-plane>
      </a-entity>
    </a-scene>
  `;

  return <div className="ar-stage" key={imageUrl} dangerouslySetInnerHTML={{ __html: sceneHtml }} />;
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

function escapeAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
