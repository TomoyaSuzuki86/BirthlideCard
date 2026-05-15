import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import { adminUids, auth, firebaseReady, googleProvider } from './firebase';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false);
      return undefined;
    }

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const isAdmin = useMemo(() => {
    return Boolean(user?.uid && adminUids.includes(user.uid));
  }, [user]);

  return {
    user,
    loading,
    isAdmin,
    login: () => signInWithPopup(auth, googleProvider),
    logout: () => signOut(auth),
  };
}

export function useInterval(callback: () => void, delay: number) {
  useEffect(() => {
    const timer = window.setInterval(callback, delay);
    return () => window.clearInterval(timer);
  }, [callback, delay]);
}
