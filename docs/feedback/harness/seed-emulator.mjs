/**
 * Seed the local Firestore emulator so the Storage emulator can evaluate the
 * product-feedback rules. `storage.rules` calls `firestore.exists(...)` on
 * `tenants/{tenantId}/members/{uid}`, so the Storage rules runtime needs a
 * Firestore emulator that knows the reporter.
 *
 * Runs only against the emulator: it refuses to touch a real project.
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Refusing to run without FIRESTORE_EMULATOR_HOST.');
}

const report = JSON.parse(
  readFileSync('docs/feedback/artifacts/workflow-report.json', 'utf8'),
);
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const TENANT_ID = process.env.SCANGO_TENANT_ID ?? 'first-g43h5hgnc4RJ0FJrYHxmd3g7qXl1';
const UID = process.env.SCANGO_UID ?? 'g43h5hgnc4RJ0FJrYHxmd3g7qXl1';

initializeApp({ projectId: env.VITE_FIREBASE_PROJECT_ID });
const db = getFirestore();

await db.doc(`tenants/${TENANT_ID}`).set({ shopName: 'QA emulator tenant' });
await db.doc(`tenants/${TENANT_ID}/members/${UID}`).set({
  uid: UID,
  membershipType: 'owner',
  isActive: true,
});

console.log(
  `seeded emulator firestore: tenants/${TENANT_ID}/members/${UID} (${report.ownerAccount})`,
);
process.exit(0);
