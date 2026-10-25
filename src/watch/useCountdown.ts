import { useCallback, useEffect, useRef, useState } from 'react';
import { cooldownEndsAt, DEFAULT_RESEND_SEC } from './otp.ts';
import { secondsLeft } from './format.ts';

/** Visible resend cool-down. Uses wall-clock time so it stays correct when the tab was in the background. */
export function useCountdown(initialSec = 0) {
  const endsAt = useRef(initialSec > 0 ? cooldownEndsAt(Date.now(), initialSec) : 0);
  const [left, setLeft] = useState(initialSec);
  useEffect(() => {
    const id = window.setInterval(() => setLeft(secondsLeft(endsAt.current)), 500);
    return () => window.clearInterval(id);
  }, []);
  const start = useCallback((sec: number = DEFAULT_RESEND_SEC) => {
    endsAt.current = cooldownEndsAt(Date.now(), sec);
    setLeft(secondsLeft(endsAt.current));
  }, []);
  return { left, start, ready: left <= 0 };
}
