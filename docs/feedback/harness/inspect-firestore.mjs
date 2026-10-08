/**
 * Read-only Firestore inspection for the feedback review. Confirms what the
 * server actually wrote while the browser was driven by the workflow harness.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const report = JSON.parse(
  readFileSync('docs/feedback/artifacts/workflow-report.json', 'utf8'),
);

const app = initializeApp({
  credential: applicationDefault(),
  projectId: 'scango-8f0e9',
});
const db = getFirestore(app);

const users = await db
  .collection('users')
  .where('email', '==', report.ownerAccount)
  .get();

for (const user of users.docs) {
  const tenantId = user.get('activeTenantId');
  console.log('user', user.id, 'activeTenantId =', tenantId);
  if (!tenantId) continue;

  const members = await db.collection(`tenants/${tenantId}/members`).get();
  console.log(
    '  members:',
    members.docs.map((d) => `${d.id}:${d.get('membershipType')}`),
  );

  const tables = await db.collection(`tenants/${tenantId}/tables`).get();
  console.log(
    '  tables:',
    tables.docs.map((d) => ({ id: d.id, name: d.get('name'), archivedAt: d.get('archivedAt'), activeToken: d.get('activeToken') })),
  );

  const menu = await db.collection(`tenants/${tenantId}/menuItems`).get();
  console.log(
    '  menuItems:',
    menu.docs.map((d) => ({ id: d.id, name: d.get('name'), priceVnd: d.get('priceVnd') })),
  );

  const orders = await db.collection(`tenants/${tenantId}/orders`).get();
  console.log(
    '  orders:',
    orders.docs.map((d) => ({ id: d.id, status: d.get('status'), totalVnd: d.get('totalVnd') })),
  );

  const tenant = await db.doc(`tenants/${tenantId}`).get();
  console.log('  tenant doc exists:', tenant.exists, JSON.stringify(tenant.data() ?? {}).slice(0, 200));
}

process.exit(0);
