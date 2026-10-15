import { useEffect, useState, type Dispatch, type SetStateAction, useCallback } from 'react';

interface PersistentStateOptions<T> {
  deserialize?: (value: string) => T;
  serialize?: (value: T) => string;
}

export function usePersistentState<T>(
  key: string,
  initialValue: T | (() => T),
  options: PersistentStateOptions<T> = {},
): [T, Dispatch<SetStateAction<T>>] {
  const { deserialize = JSON.parse, serialize = JSON.stringify } = options;

  const [value, setValue] = useState<T>(() => {
    const fallback = typeof initialValue === 'function'
      ? (initialValue as () => T)()
      : initialValue;

    try {
      const storedValue = window.localStorage.getItem(key);
      return storedValue === null ? fallback : deserialize(storedValue);
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try {
      const serialized = serialize(value);
      window.localStorage.setItem(key, serialized);
      window.dispatchEvent(
        new CustomEvent('scango:persistent-sync', {
          detail: { key, newValue: serialized },
        }),
      );
    } catch {
      // The app remains usable when storage is unavailable or full.
    }
  }, [key, serialize, value]);

  // Sync state across different tabs/windows and inside the same window
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setValue(deserialize(e.newValue));
        } catch {
          // ignore parsing error
        }
      }
    };
    const handleLocalSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string; newValue: string }>;
      if (
        customEvent.detail &&
        customEvent.detail.key === key &&
        customEvent.detail.newValue !== null
      ) {
        try {
          const nextVal = deserialize(customEvent.detail.newValue);
          setValue((prev) => {
            if (serialize(prev) === customEvent.detail.newValue) return prev;
            return nextVal;
          });
        } catch {
          // ignore parsing error
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('scango:persistent-sync', handleLocalSync);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('scango:persistent-sync', handleLocalSync);
    };
  }, [key, deserialize, serialize]);

  return [value, setValue];
}
