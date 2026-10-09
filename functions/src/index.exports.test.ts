import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A Cloud Functions entry point only exists if `functions/src/index.ts`
 * re-exports it. When it does not, the module compiles, every unit test passes,
 * and the deployed callable simply is not there — the client gets a 404 that
 * looks like a client bug. That happened to `callableTableConfigure` and
 * `callableOrderListTableStatus`, so the invariant is checked here instead of
 * being discovered in the browser again.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULES_DIR = path.join(HERE, 'modules');
const ENTRY_POINT_PATTERN = /^export const ((?:callable|scheduled)[A-Za-z0-9]+)/gm;

function collectEntryPoints(source: string): string[] {
  return [...source.matchAll(ENTRY_POINT_PATTERN)].map((match) => match[1]);
}

describe('functions entry point exports', () => {
  const moduleIndexes = readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(MODULES_DIR, entry.name, 'index.ts'))
    .filter((file) => {
      try {
        readFileSync(file, 'utf8');
        return true;
      } catch {
        return false;
      }
    });

  const rootIndex = readFileSync(path.join(HERE, 'index.ts'), 'utf8');
  const rootExports = new Set(
    [...rootIndex.matchAll(/^\s{2}((?:callable|scheduled)[A-Za-z0-9]+),$/gm)].map(
      (match) => match[1],
    ),
  );

  it('finds module entry points to check', () => {
    expect(moduleIndexes.length).toBeGreaterThan(10);
    expect(rootExports.size).toBeGreaterThan(50);
  });

  it('re-exports every callable and scheduled function of every module', () => {
    const missing: string[] = [];
    for (const file of moduleIndexes) {
      for (const name of collectEntryPoints(readFileSync(file, 'utf8'))) {
        if (!rootExports.has(name)) {
          missing.push(`${path.relative(HERE, file)}: ${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('does not export a name that no module defines', () => {
    const defined = new Set(
      moduleIndexes.flatMap((file) =>
        collectEntryPoints(readFileSync(file, 'utf8')),
      ),
    );
    const orphans = [...rootExports].filter((name) => !defined.has(name));
    expect(orphans).toEqual([]);
  });
});
