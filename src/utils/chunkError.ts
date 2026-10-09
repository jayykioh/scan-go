/**
 * Detects whether an error was caused by a failed dynamic import / chunk fetch.
 * This commonly happens when a new version is deployed to Vercel and an existing
 * client session attempts to fetch an outdated hashed JS chunk.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;

  const name =
    error instanceof Error
      ? error.name
      : typeof (error as Record<string, unknown>)?.name === 'string'
        ? String((error as Record<string, unknown>).name)
        : '';

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof (error as Record<string, unknown>)?.message === 'string'
          ? String((error as Record<string, unknown>).message)
          : '';

  const lower = `${name} ${message}`.toLowerCase();

  return (
    lower.includes('failed to fetch dynamically imported module') ||
    lower.includes('importing a module script failed') ||
    lower.includes('error loading dynamically imported module') ||
    lower.includes('dynamically imported module') ||
    lower.includes('chunkloaderror') ||
    (error instanceof TypeError && lower.includes('dynamically imported module'))
  );
}
