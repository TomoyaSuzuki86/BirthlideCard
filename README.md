# BirthlideCard

命名書のQRコードから開く、奏汰・日向のWebアルバムです。表示の正はFirebase StorageとFirestoreで、Googleフォト共有アルバムURLは外部リンクとして残します。

公開URLはFirebase Hostingの標準URL `https://birthlidecard.web.app/` を想定しています。Canvaに入れたQRコードもこのURLに向けています。

## セットアップ

1. Firebaseプロジェクト `birthlidecard` でAuthentication、Firestore、Storage、Hostingを有効にします。
2. AuthenticationのGoogleログインを有効にします。
3. `.env.example`を参考に`.env.local`を作成します。
4. 管理者のFirebase Auth UIDを`VITE_ADMIN_UIDS`に入れます。
5. `firestore.rules`と`storage.rules`の`REPLACE_WITH_ADMIN_UID`を同じUIDへ置き換えます。
6. Google Photos Picker API用のOAuthクライアントIDを`VITE_GOOGLE_CLIENT_ID`に入れます。

```bash
npm install
npm run dev
npm run build
```

## Firestore

- `albums/{childId}/images/{imageId}`
  - `childId`: `kanata` または `hinata`
  - `storagePath`
  - `downloadUrl`
  - `caption`
  - `takenAt`
  - `sourceType`: `manual-upload` / `google-photos-picker` / `google-drive-sync`
  - `sourceId`
  - `sourceUrl`
  - `createdAt`
  - `updatedAt`
  - `sortOrder`
  - `isPublished`

- `syncLogs/{logId}`
  - Drive同期バッチの開始、成功、失敗、取り込み件数、スキップ件数を保存します。

## Storage

- `albums/{childId}/{yyyy-MM}/{imageId}.jpg`
- `albums/{childId}/{yyyy-MM}/{imageId}.webp`
- `albums/{childId}/{yyyy-MM}/{imageId}_thumb.webp`

## Googleフォト取り込み

共有アルバムURLのスクレイピングは使いません。管理画面の「Googleフォトから取り込む」からGoogle Photos Picker APIを開き、ユーザーが明示的に選んだ写真だけを取得します。`baseUrl`は保存せず、取得後すぐFirebase Storageへコピーします。重複は`sourceType + sourceId`でスキップします。

## かんたん写真追加

`/add` からログインなしで写真を追加・削除できます。親戚がスマホで開き、奏汰/日向を選んで写真を選ぶだけでFirebase Storageへ保存され、Firestoreの公開メタデータにも反映されます。

この運用ではFirestore/Storage rulesも公開書き込みを許可しています。URLを知っている人なら誰でも追加・削除できるため、必要に応じて後から「合言葉」や「削除だけ保護」に戻してください。

## Google Drive同期

`functions/src/syncDriveAlbums.ts`にCloud Functions v2の定期バッチを用意しています。

環境変数:

- `KANATA_DRIVE_FOLDER_ID`
- `HINATA_DRIVE_FOLDER_ID`

```bash
cd functions
npm install
npm run build
```

Drive APIでフォルダ内の画像を読み取り、新規ファイルだけStorageへ保存し、Firestoreに`sourceType: "google-drive-sync"`でメタデータを保存します。

## Phase 2

`/ar`にMindAR.js + A-FrameのAR表示を実装しています。`public/targets/meimeisho.mind` が存在する場合だけARカメラを起動し、未対応端末やターゲット未作成時は通常アルバムへ戻します。

ARターゲット作成:

1. CanvaからQR入り命名書を画像として書き出します。
2. MindARのImage Target Compilerで命名書画像を `.mind` に変換します。
3. 生成したファイルを `public/targets/meimeisho.mind` に置きます。
4. `npm run build` 後、スマホのHTTPS環境で `/ar` を開いて命名書を写します。

AR表示はFirebase Firestoreの `isPublished=true` の画像を使います。画像がない場合、または `.mind` がない場合は通常アルバムへのリンクを表示します。
