import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

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
      window.localStorage.setItem(key, serialize(value));
    } catch {
      // The app remains usable when storage is unavailable or full.
    }
  }, [key, serialize, value]);

  return [value, setValue];
}
