import { type ComponentType, lazy, type LazyExoticComponent } from 'react';
import { isChunkLoadError } from './chunkError';

/**
 * Enhanced React lazy loader that handles dynamic module import failures
 * gracefully (e.g. after a new deployment changes chunk hashes).
 *
 * If a chunk fetch fails, it triggers a single forced page reload so the client
 * downloads the latest index.html and module chunks.
 */
export function lazyRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  chunkName = 'module'
): LazyExoticComponent<T> {
  return lazy(async () => {
    const storageKey = `scango:chunk-retry:${chunkName}`;
    const alreadyRetried = sessionStorage.getItem(storageKey);

    try {
      const module = await factory();
      if (alreadyRetried) {
        sessionStorage.removeItem(storageKey);
      }
      return module;
    } catch (error: unknown) {
      if (isChunkLoadError(error) && !alreadyRetried) {
        sessionStorage.setItem(storageKey, 'true');
        // Force reload from server to fetch the updated index.html
        window.location.reload();
        // Return a promise that never resolves so Suspense does not throw before reload takes over
        return new Promise<{ default: T }>(() => {});
      }

      throw error;
    }
  });
}
