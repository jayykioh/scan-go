import { useEffect, useState } from 'react';

/**
 * A ticking "now" for elapsed-time displays. The stored minutes always come
 * from the server's stamps; this only moves the on-screen counter.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
