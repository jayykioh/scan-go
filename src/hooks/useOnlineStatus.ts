import { useEffect, useState } from 'react';

/**
 * Track browser connectivity with the `online`/`offline` events and the
 * `navigator.onLine` initial value (REQ-ORD-004).
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
      return true;
    }
    return navigator.onLine;
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
