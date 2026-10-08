/**
 * P0-008 Inventory Security Rules tests (REQ-INV-001, REQ-KDS-001,
 * CON-002, NFR-SEC-001).
 *
 * These tests prove the tenant read boundary for ingredients, recipes, and the
 * stock-movement ledger, and deny every direct business write so only server
 * commands may change stock (docs/RULES_FIREBASE.md §1 and §3).
 *
 * Run with the root script:
 *   npm run test:rules
 */
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';

const OWNER_UID = 'owner-uid';
const STAFF_UID = 'staff-uid';
const CASHIER_UID = 'cashier-uid';
const INACTIVE_UID = 'inactive-uid';
const OTHER_UID = 'other-uid';

const inventoryRules = readFileSync(
  new URL('../../../firestore.rules', import.meta.url),
  'utf8',
);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'scango-rules-test',
    firestore: { rules: inventoryRules },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

async function seed(): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'tenants', TENANT_A), { shopName: 'Alpha' });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', OWNER_UID), {
      uid: OWNER_UID,
      membershipType: 'owner',
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', STAFF_UID), {
      uid: STAFF_UID,
      membershipType: 'staff',
      roles: ['kitchen'],
      isActive: true,
    });
    // A non-Kitchen Staff member keeps the reduced permission set: inventory
    // carries Cost and is not part of the till role (ADR 0013).
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', CASHIER_UID), {
      uid: CASHIER_UID,
      membershipType: 'staff',
      roles: ['cashier'],
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', INACTIVE_UID), {
      uid: INACTIVE_UID,
      membershipType: 'staff',
      isActive: false,
    });

    await setDoc(doc(db, 'tenants', TENANT_A, 'ingredients', 'ingredient-1'), {
      ingredientId: 'ingredient-1',
      tenantId: TENANT_A,
      name: 'Bánh phở',
      baseUnit: 'g',
      unitCostVnd: 40,
      stockQuantity: 10000,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'recipes', 'recipe-1'), {
      recipeId: 'recipe-1',
      tenantId: TENANT_A,
      menuItemId: 'item-1',
      costVnd: 38000,
    });
    await setDoc(
      doc(db, 'tenants', TENANT_A, 'stockMovements', 'movement-1'),
      {
        movementId: 'movement-1',
        tenantId: TENANT_A,
        ingredientId: 'ingredient-1',
        quantityDelta: -400,
        reason: 'order_deduction',
      },
    );

    await setDoc(doc(db, 'tenants', TENANT_B), { shopName: 'Bravo' });
    await setDoc(doc(db, 'tenants', TENANT_B, 'members', OTHER_UID), {
      uid: OTHER_UID,
      membershipType: 'owner',
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_B, 'ingredients', 'ingredient-b'), {
      ingredientId: 'ingredient-b',
      tenantId: TENANT_B,
      name: 'Rau',
      baseUnit: 'g',
      unitCostVnd: 10,
      stockQuantity: 500,
    });
  });
}

function ownerDb() {
  return testEnv.authenticatedContext(OWNER_UID).firestore();
}

function staffDb() {
  return testEnv.authenticatedContext(STAFF_UID).firestore();
}

function cashierDb() {
  return testEnv.authenticatedContext(CASHIER_UID).firestore();
}

function otherDb() {
  return testEnv.authenticatedContext(OTHER_UID).firestore();
}

function inactiveDb() {
  return testEnv.authenticatedContext(INACTIVE_UID).firestore();
}

function unauthDb() {
  return testEnv.unauthenticatedContext().firestore();
}

describe('ingredient tenant read boundary', () => {
  it('allows the Owner and Kitchen, and denies Cashier, cross-tenant, inactive, and anonymous readers', async () => {
    await seed();

    await assertSucceeds(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'ingredients', 'ingredient-1')),
    );
    await assertSucceeds(
      getDoc(doc(staffDb(), 'tenants', TENANT_A, 'ingredients', 'ingredient-1')),
    );
    await assertFails(
      getDoc(doc(cashierDb(), 'tenants', TENANT_A, 'ingredients', 'ingredient-1')),
    );
    await assertFails(
      getDoc(doc(otherDb(), 'tenants', TENANT_A, 'ingredients', 'ingredient-1')),
    );
    await assertFails(
      getDoc(doc(inactiveDb(), 'tenants', TENANT_A, 'ingredients', 'ingredient-1')),
    );
    await assertFails(
      getDoc(doc(unauthDb(), 'tenants', TENANT_A, 'ingredients', 'ingredient-1')),
    );
  });
});

describe('recipe and stock-movement tenant read boundary', () => {
  it('allows the Owner and Kitchen, and denies Cashier and a cross-tenant Owner', async () => {
    await seed();

    await assertSucceeds(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'recipes', 'recipe-1')),
    );
    await assertSucceeds(
      getDoc(doc(staffDb(), 'tenants', TENANT_A, 'stockMovements', 'movement-1')),
    );
    await assertFails(
      getDoc(doc(cashierDb(), 'tenants', TENANT_A, 'recipes', 'recipe-1')),
    );
    await assertFails(
      getDoc(
        doc(cashierDb(), 'tenants', TENANT_A, 'stockMovements', 'movement-1'),
      ),
    );
    await assertFails(
      getDoc(doc(otherDb(), 'tenants', TENANT_A, 'recipes', 'recipe-1')),
    );
    await assertFails(
      getDoc(
        doc(otherDb(), 'tenants', TENANT_A, 'stockMovements', 'movement-1'),
      ),
    );
  });

  it('keeps each Tenant scoped to its own inventory', async () => {
    await seed();

    await assertSucceeds(
      getDoc(doc(otherDb(), 'tenants', TENANT_B, 'ingredients', 'ingredient-b')),
    );
    await assertFails(
      getDoc(doc(otherDb(), 'tenants', TENANT_A, 'ingredients', 'ingredient-1')),
    );
  });
});

describe('cancellation restoration write denial (REQ-CAS-002, REQ-INV-002)', () => {
  it('denies a direct Order cancellation and a forged order_restore movement', async () => {
    await seed();

    await assertFails(
      setDoc(
        doc(ownerDb(), 'tenants', TENANT_A, 'orders', 'order-001'),
        { status: 'cancelled', cancellationReason: 'forged' },
        { merge: true },
      ),
    );
    await assertFails(
      setDoc(
        doc(
          ownerDb(),
          'tenants',
          TENANT_A,
          'stockMovements',
          'order-001__restore__ingredient-1',
        ),
        {
          movementId: 'order-001__restore__ingredient-1',
          tenantId: TENANT_A,
          ingredientId: 'ingredient-1',
          quantityDelta: 400,
          reason: 'order_restore',
        },
      ),
    );
    await assertFails(
      setDoc(
        doc(unauthDb(), 'tenants', TENANT_A, 'stockMovements', 'forged-restore'),
        { quantityDelta: 400, reason: 'order_restore' },
      ),
    );
  });
});

describe('inventory direct write denial', () => {
  it('denies every direct ingredient, recipe, and stock-movement write', async () => {
    await seed();

    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'ingredients', 'ingredient-1'), {
        stockQuantity: 1,
      }),
    );
    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'ingredients', 'forged'), {
        stockQuantity: 1,
      }),
    );
    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'recipes', 'recipe-1'), {
        costVnd: 1,
      }),
    );
    await assertFails(
      setDoc(
        doc(ownerDb(), 'tenants', TENANT_A, 'stockMovements', 'movement-1'),
        { quantityDelta: 999999 },
      ),
    );
    await assertFails(
      setDoc(doc(unauthDb(), 'tenants', TENANT_A, 'ingredients', 'ingredient-1'), {
        stockQuantity: 1,
      }),
    );
  });
});
