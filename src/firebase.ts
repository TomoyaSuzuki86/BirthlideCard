import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseReady = Boolean(
  envConfig.apiKey && envConfig.projectId && envConfig.storageBucket && envConfig.appId,
);

const firebaseConfig = firebaseReady
  ? envConfig
  : {
      apiKey: 'demo-api-key',
      authDomain: 'birthlidecard.firebaseapp.com',
      projectId: 'birthlidecard',
      storageBucket: 'birthlidecard.appspot.com',
      messagingSenderId: '000000000000',
      appId: '1:000000000000:web:demo',
    };

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);

export const adminUids = String(import.meta.env.VITE_ADMIN_UIDS ?? '')
  .split(',')
  .map((uid) => uid.trim())
  .filter(Boolean);
