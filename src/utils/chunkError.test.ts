import { describe, it, expect } from 'vitest';
import { isChunkLoadError } from './chunkError';

describe('isChunkLoadError', () => {
  it('returns false for null or undefined or generic errors', () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError(new Error('Network disconnected'))).toBe(false);
    expect(isChunkLoadError('Random string error')).toBe(false);
  });

  it('detects Failed to fetch dynamically imported module error', () => {
    const error = new TypeError('Failed to fetch dynamically imported module: https://scan-go-ashen.vercel.app/assets/OverviewPage-DMQRokMj.js');
    expect(isChunkLoadError(error)).toBe(true);
  });

  it('detects Importing a module script failed error', () => {
    const error = new Error('Importing a module script failed');
    expect(isChunkLoadError(error)).toBe(true);
  });

  it('detects ChunkLoadError', () => {
    const error = new Error('Loading chunk 4 failed.');
    error.name = 'ChunkLoadError';
    expect(isChunkLoadError(error)).toBe(true);
  });

  it('handles error objects with message property', () => {
    expect(isChunkLoadError({ message: 'Failed to fetch dynamically imported module' })).toBe(true);
  });
});
