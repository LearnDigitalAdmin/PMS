import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/database/FirebaseSync';

/**
 * Live SMS credit balance for a user. Reads straight from Firestore
 * (users/{uid}.tokens) via a real-time listener — SMS credits never touch
 * the local SQLite database, so this is the only source of truth for them.
 */
export function useSmsTokens(userId: number | string | undefined) {
  const [tokens, setTokens] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    
    if (!userId) {
      setTokens(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, 'users', String(userId)),
      (snap) => {
        setTokens(snap.exists() ? (snap.data()?.tokens ?? 0) : 0);
        setLoading(false);
      },
      (err) => {
        console.error('useSmsTokens: listener error', err);
        setTokens(null);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [userId]);

  return { tokens, loading };
}
