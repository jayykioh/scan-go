/**
 * Restore the QA tenant to an empty Promotion state after a verification run.
 *
 * Every non-archived Promotion is archived (never deleted) so the audit trail
 * survives, which also clears the Free plan's single active slot. The
 * `campaignSuggestions` the harness generated are deleted, because they are
 * test artefacts rather than business records.
 *
 * Usage:
 *   node docs/feedback/harness/cleanup-promotions.mjs [--confirm]
 */
import process from 'node:process';

const PROJECT = 'scango-8f0e9';
const REGION = 'asia-southeast1';
const FUNCTIONS_ORIGIN =
  process.env.SCANGO_FUNCTIONS_ORIGIN ?? 'http://127.0.0.1:5001';
const API_KEY =
  process.env.SCANGO_API_KEY ?? 'AIzaSyAxuOZQiw-UQHTQev-xfsdgPJAZVDZo0K8';
const EMAIL =
  process.env.SCANGO_QA_EMAIL ?? 'qa.playwright+1791453969001@example.com';
const PASSWORD = process.env.SCANGO_QA_PASSWORD ?? 'ScanGo-QA-2026!';

if (!process.argv.includes('--confirm')) {
  console.log(
    'Dry run. Re-run with --confirm to archive every `[AUDIT]` Promotion.',
  );
  process.exit(0);
}

const token = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
  },
)
  .then((response) => response.json())
  .then((body) => body.idToken);

if (!token) {
  throw new Error('owner sign-in failed');
}

async function callCallable(name, data) {
  const response = await fetch(
    `${FUNCTIONS_ORIGIN}/${PROJECT}/${REGION}/${name}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ data }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (body.error) {
    throw new Error(body.error.message ?? 'callable failed');
  }
  return body.result;
}

const { initializeApp, applicationDefault } = await import(
  'firebase-admin/app'
);
const { getFirestore } = await import('firebase-admin/firestore');
const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const db = getFirestore(app);

const users = await db
  .collection('users')
  .where('email', '==', EMAIL)
  .limit(1)
  .get();
const tenantId = users.docs[0]?.get('activeTenantId');
if (!tenantId) {
  throw new Error('QA owner has no active tenant');
}

const list = await callCallable('callablePromotionList', { tenantId });
console.log(`Found ${list.promotions.length} non-archived promotion(s) in ${tenantId}`);

for (const promotion of list.promotions) {
  await callCallable('callablePromotionSetStatus', {
    tenantId,
    promotionId: promotion.promotionId,
    status: 'archived',
  }).catch((error) => console.log(`  ! ${promotion.name}: ${error.message}`));
  console.log(`  archived ${promotion.name}`);
}

const suggestions = await db
  .collection(`tenants/${tenantId}/campaignSuggestions`)
  .get();
for (const suggestion of suggestions.docs) {
  await suggestion.ref.delete();
  console.log(`  deleted suggestion ${suggestion.id}`);
}

const remaining = await db
  .collection(`tenants/${tenantId}/promotions`)
  .where('archivedAt', '==', null)
  .get();
const orders = await db.collection(`tenants/${tenantId}/orders`).get();
console.log(`Remaining non-archived promotions: ${remaining.size}`);
console.log(
  `Orders left in the tenant: ${orders.size} (${orders.docs
    .map((doc) => doc.get('status'))
    .join(', ')})`,
);
process.exit(0);
