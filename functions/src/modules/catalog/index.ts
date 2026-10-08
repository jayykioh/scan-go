import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import {
  CATALOG_CATEGORY_LIMIT,
  CATALOG_CONTRACT_VERSION,
  CATALOG_SEARCH_LIMIT,
  catalogAvailabilityListResultSchema,
  catalogCommandResultSchema,
  catalogSearchResultSchema,
  type CatalogCommand,
  type CatalogCommandResult,
  type CatalogMenuItem,
} from '../../../../shared/contracts/catalog.contract.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import { writeAuditEventInTransaction } from '../../shared/audit.js';
import { FUNCTIONS_REGION } from '../../../../shared/config/region.js';
import {
  applyMenuItemAvailability,
  applyMenuItemUpdate,
  assertActiveMember,
  assertActiveOwnerMember,
  assertTenantScopedImagePath,
  buildNewMenuItem,
  CATALOG_ITEM_NOT_FOUND_MESSAGE,
  CATALOG_TEMPLATE_NOT_FOUND_MESSAGE,
  computeNextCatalogVersion,
  isCategoryAvailabilityTarget,
  isPublicProjectionVisible,
  matchesCatalogSearch,
  nowIso,
  parseCatalogApplyTemplateInput,
  parseCatalogArchiveInput,
  parseCatalogAvailabilityListInput,
  parseCatalogCreateInput,
  parseCatalogSearchInput,
  parseCatalogSetAvailabilityInput,
  parseCatalogSetCategoryAvailabilityInput,
  parseCatalogUpdateInput,
  requireUid,
  toCatalogAvailabilityItem,
  toCatalogMenuItem,
  toPublicMenuItem,
} from './service.js';
import { getCatalogTemplate } from './templates.js';

const CALL_OPTIONS = { region: FUNCTIONS_REGION, cors: true } as const;
const ITEM_CHANGED_ACTION = 'MenuItemChanged';
const CATALOG_AVAILABILITY_DENIED_MESSAGE =
  'Chỉ bếp hoặc chủ cửa hàng đổi được tình trạng món.';

function itemCollection(tenantId: string): string {
  return `tenants/${tenantId}/menuItems`;
}

function publicItemCollection(tenantId: string): string {
  return `tenants/${tenantId}/publicMenuItems`;
}

/**
 * Write the public-safe projection in the same authoritative command as the
 * private item. Only active and available items exist in the projection.
 */
function writePublicProjection(
  transaction: Transaction,
  publicRef: DocumentReference,
  item: CatalogMenuItem,
): void {
  if (isPublicProjectionVisible(item)) {
    transaction.set(publicRef, toPublicMenuItem(item));
    return;
  }
  transaction.delete(publicRef);
}

function commandResult(
  command: CatalogCommand,
  menuItemId: string | null,
  version: number,
  publicProjection: CatalogCommandResult['publicProjection'],
  extra: Partial<CatalogCommandResult> = {},
): CatalogCommandResult {
  return catalogCommandResultSchema.parse({
    schemaVersion: CATALOG_CONTRACT_VERSION,
    command,
    status: extra.status ?? 'applied',
    menuItemId,
    publicProjection,
    version,
    templateId: extra.templateId ?? null,
    affectedItemCount: extra.affectedItemCount ?? (menuItemId ? 1 : 0),
    reason: extra.reason ?? null,
    appliedAt: extra.appliedAt ?? nowIso(),
  });
}

/**
 * Owner command: create a private menu item and its public-safe projection in
 * one transaction. Cost, recipe, and stock never reach the projection.
 */
export const callableCatalogCreate = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const input = parseCatalogCreateInput(request.data);
  assertTenantScopedImagePath(input.tenantId, input.imagePath);

  const db = getDb();
  const itemRef = db.collection(itemCollection(input.tenantId)).doc();
  const publicRef = db.doc(`${publicItemCollection(input.tenantId)}/${itemRef.id}`);
  const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);

  const outcome = await db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(memberRef);
    assertActiveOwnerMember(memberSnap.data());

    const item = buildNewMenuItem(input, itemRef.id, nowIso());
    transaction.set(itemRef, { ...item, version: 1 });
    writePublicProjection(transaction, publicRef, item);
    writeAuditEventInTransaction(transaction, {
      tenantId: input.tenantId,
      actorUid: uid,
      actorType: 'owner',
      role: 'owner',
      action: ITEM_CHANGED_ACTION,
      targetType: 'menu_item',
      targetId: itemRef.id,
      detail: { command: 'create', isAvailable: item.isAvailable },
    });
    return { item, version: 1 };
  });

  return commandResult(
    'create',
    itemRef.id,
    outcome.version,
    isPublicProjectionVisible(outcome.item)
      ? toPublicMenuItem(outcome.item)
      : null,
  );
});

/**
 * Owner command: replace a menu item and rewrite its public projection inside
 * one transaction. All reads precede all writes.
 */
export const callableCatalogUpdate = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const input = parseCatalogUpdateInput(request.data);
  assertTenantScopedImagePath(input.tenantId, input.imagePath);

  const db = getDb();
  const itemRef = db.doc(`${itemCollection(input.tenantId)}/${input.menuItemId}`);
  const publicRef = db.doc(
    `${publicItemCollection(input.tenantId)}/${input.menuItemId}`,
  );
  const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);

  const outcome = await db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(memberRef);
    const itemSnap = await transaction.get(itemRef);
    assertActiveOwnerMember(memberSnap.data());
    if (!itemSnap.exists) {
      throw new HttpsError('not-found', CATALOG_ITEM_NOT_FOUND_MESSAGE);
    }

    const current = toCatalogMenuItem(input.menuItemId, itemSnap.data() ?? {});
    const updated = applyMenuItemUpdate(current, input, nowIso());
    const version = computeNextCatalogVersion(itemSnap.get('version'));

    transaction.set(itemRef, { ...updated, version });
    writePublicProjection(transaction, publicRef, updated);
    writeAuditEventInTransaction(transaction, {
      tenantId: input.tenantId,
      actorUid: uid,
      actorType: 'owner',
      role: 'owner',
      action: ITEM_CHANGED_ACTION,
      targetType: 'menu_item',
      targetId: input.menuItemId,
      detail: { command: 'update', isAvailable: updated.isAvailable },
    });
    return { item: updated, version };
  });

  return commandResult(
    'update',
    input.menuItemId,
    outcome.version,
    isPublicProjectionVisible(outcome.item)
      ? toPublicMenuItem(outcome.item)
      : null,
  );
});

/**
 * Owner command: archive an item and remove its public projection. Archive is
 * used instead of delete so references stay intact.
 */
export const callableCatalogArchive = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const input = parseCatalogArchiveInput(request.data);

  const db = getDb();
  const itemRef = db.doc(`${itemCollection(input.tenantId)}/${input.menuItemId}`);
  const publicRef = db.doc(
    `${publicItemCollection(input.tenantId)}/${input.menuItemId}`,
  );
  const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);

  const version = await db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(memberRef);
    const itemSnap = await transaction.get(itemRef);
    assertActiveOwnerMember(memberSnap.data());
    if (!itemSnap.exists) {
      throw new HttpsError('not-found', CATALOG_ITEM_NOT_FOUND_MESSAGE);
    }

    const current = toCatalogMenuItem(input.menuItemId, itemSnap.data() ?? {});
    const now = nowIso();
    const nextVersion = computeNextCatalogVersion(itemSnap.get('version'));
    transaction.set(itemRef, {
      ...current,
      archivedAt: now,
      updatedAt: now,
      version: nextVersion,
    });
    transaction.delete(publicRef);
    writeAuditEventInTransaction(transaction, {
      tenantId: input.tenantId,
      actorUid: uid,
      actorType: 'owner',
      role: 'owner',
      action: ITEM_CHANGED_ACTION,
      targetType: 'menu_item',
      targetId: input.menuItemId,
      reason: input.reason,
      detail: { command: 'archive' },
    });
    return nextVersion;
  });

  return commandResult('archive', input.menuItemId, version, null);
});

/**
 * Kitchen/Owner command: change availability. The private item and its public
 * projection update together.
 */
export const callableCatalogSetAvailability = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseCatalogSetAvailabilityInput(request.data);

    const db = getDb();
    const itemRef = db.doc(
      `${itemCollection(input.tenantId)}/${input.menuItemId}`,
    );
    const publicRef = db.doc(
      `${publicItemCollection(input.tenantId)}/${input.menuItemId}`,
    );
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);

    const outcome = await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      const itemSnap = await transaction.get(itemRef);
      assertActiveMember(memberSnap.data());
      // Only Owner or an active Kitchen member may change availability
      // (REQ-KDS-001). The server gate stays authoritative over any UI state.
      const member = memberSnap.data() ?? {};
      const isOwner = member.membershipType === 'owner';
      const roles: unknown[] = Array.isArray(member.roles) ? member.roles : [];
      if (!isOwner && !roles.includes('kitchen')) {
        throw new HttpsError(
          'permission-denied',
          CATALOG_AVAILABILITY_DENIED_MESSAGE,
        );
      }
      if (!itemSnap.exists) {
        throw new HttpsError('not-found', CATALOG_ITEM_NOT_FOUND_MESSAGE);
      }

      const current = toCatalogMenuItem(input.menuItemId, itemSnap.data() ?? {});
      const now = nowIso();
      const updated = applyMenuItemAvailability(
        current,
        input.isAvailable,
        now,
      );
      const version = computeNextCatalogVersion(itemSnap.get('version'));
      transaction.set(itemRef, { ...updated, version });
      writePublicProjection(transaction, publicRef, updated);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: isOwner ? 'owner' : 'staff',
        role: isOwner ? 'owner' : 'kitchen',
        action: ITEM_CHANGED_ACTION,
        targetType: 'menu_item',
        targetId: input.menuItemId,
        detail: { command: 'setAvailability', isAvailable: input.isAvailable },
      });
      return { item: updated, version };
    });

    return commandResult(
      'setAvailability',
      input.menuItemId,
      outcome.version,
      isPublicProjectionVisible(outcome.item)
        ? toPublicMenuItem(outcome.item)
        : null,
    );
  },
);

/**
 * Owner or Kitchen command: change availability for every active item in one
 * category in a single transaction. An item already at the target is skipped,
 * so a retry writes nothing and audits nothing (REQ-CAT-003).
 */
export const callableCatalogSetCategoryAvailability = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseCatalogSetCategoryAvailabilityInput(request.data);

    const db = getDb();
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const itemsQuery = db
      .collection(itemCollection(input.tenantId))
      .where('category', '==', input.category)
      .limit(CATALOG_CATEGORY_LIMIT);

    const outcome = await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      assertActiveMember(memberSnap.data());
      const member = memberSnap.data() ?? {};
      const isOwner = member.membershipType === 'owner';
      const roles: unknown[] = Array.isArray(member.roles) ? member.roles : [];
      if (!isOwner && !roles.includes('kitchen')) {
        throw new HttpsError(
          'permission-denied',
          CATALOG_AVAILABILITY_DENIED_MESSAGE,
        );
      }

      const itemSnaps = await transaction.get(itemsQuery);
      const now = nowIso();
      let affectedItemCount = 0;
      let version = 0;
      for (const itemSnap of itemSnaps.docs) {
        const current = toCatalogMenuItem(itemSnap.id, itemSnap.data() ?? {});
        if (
          !isCategoryAvailabilityTarget(
            current,
            input.category,
            input.isAvailable,
          )
        ) {
          continue;
        }
        const updated = applyMenuItemAvailability(
          current,
          input.isAvailable,
          now,
        );
        const nextVersion = computeNextCatalogVersion(itemSnap.get('version'));
        const publicRef = db.doc(
          `${publicItemCollection(input.tenantId)}/${itemSnap.id}`,
        );
        transaction.set(itemSnap.ref, { ...updated, version: nextVersion });
        writePublicProjection(transaction, publicRef, updated);
        writeAuditEventInTransaction(transaction, {
          tenantId: input.tenantId,
          actorUid: uid,
          actorType: isOwner ? 'owner' : 'staff',
          role: isOwner ? 'owner' : 'kitchen',
          action: ITEM_CHANGED_ACTION,
          targetType: 'menu_item',
          targetId: itemSnap.id,
          detail: {
            command: 'setCategoryAvailability',
            category: input.category,
            isAvailable: input.isAvailable,
          },
        });
        affectedItemCount += 1;
        version = Math.max(version, nextVersion);
      }
      return { affectedItemCount, version };
    });

    return commandResult(
      'setCategoryAvailability',
      null,
      outcome.version,
      null,
      {
        affectedItemCount: outcome.affectedItemCount,
        status: outcome.affectedItemCount === 0 ? 'noop' : 'applied',
      },
    );
  },
);

/**
 * Member query: every active item in one bounded list, stripped to the
 * Kitchen-safe availability fields. It lets the Kitchen board show unavailable
 * items so they can be turned back on (REQ-KDS-002).
 */
export const callableCatalogListAvailability = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseCatalogAvailabilityListInput(request.data);

    const db = getDb();
    const memberSnap = await db
      .doc(`tenants/${input.tenantId}/members/${uid}`)
      .get();
    assertActiveMember(memberSnap.data());

    const snap = await db
      .collection(itemCollection(input.tenantId))
      .where('archivedAt', '==', null)
      .limit(CATALOG_CATEGORY_LIMIT)
      .get();
    return catalogAvailabilityListResultSchema.parse({
      schemaVersion: CATALOG_CONTRACT_VERSION,
      items: snap.docs.map((docSnap) =>
        toCatalogAvailabilityItem(
          toCatalogMenuItem(docSnap.id, docSnap.data() ?? {}),
        ),
      ),
    });
  },
);

/** Member query: bounded private-menu search for the Owner menu page. */
export const callableCatalogSearch = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const input = parseCatalogSearchInput(request.data);

  const db = getDb();
  const memberSnap = await db.doc(`tenants/${input.tenantId}/members/${uid}`).get();
  assertActiveMember(memberSnap.data());

  const snap = await db
    .collection(itemCollection(input.tenantId))
    .limit(CATALOG_SEARCH_LIMIT)
    .get();
  const items = snap.docs
    .map((docSnap) => toCatalogMenuItem(docSnap.id, docSnap.data()))
    .filter((item) => matchesCatalogSearch(item, input));

  const result = catalogSearchResultSchema.parse({
    schemaVersion: CATALOG_CONTRACT_VERSION,
    items,
    total: items.length,
  });
  return result;
});

/**
 * Owner command: seed one approved industry template into exactly one Tenant.
 * Every seeded item and its public projection commit together.
 */
export const callableCatalogApplyTemplate = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseCatalogApplyTemplateInput(request.data);
    const template = getCatalogTemplate(input.templateId);
    if (!template) {
      throw new HttpsError('invalid-argument', CATALOG_TEMPLATE_NOT_FOUND_MESSAGE);
    }

    const db = getDb();
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const now = nowIso();
    const seeds = template.items.map((templateItem) => {
      const itemRef = db.collection(itemCollection(input.tenantId)).doc();
      const publicRef = db.doc(
        `${publicItemCollection(input.tenantId)}/${itemRef.id}`,
      );
      const item = buildNewMenuItem(
        {
          tenantId: input.tenantId,
          name: templateItem.name,
          description: templateItem.description,
          category: templateItem.category,
          type: templateItem.type,
          priceVnd: templateItem.priceVnd,
          costPriceVnd: templateItem.costPriceVnd,
          imagePath: null,
          modifierGroups: templateItem.modifierGroups ?? [],
          recipeId: null,
          isAvailable: true,
          stockCount: null,
        },
        itemRef.id,
        now,
      );
      return { itemRef, publicRef, item };
    });

    await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      assertActiveOwnerMember(memberSnap.data());

      for (const seed of seeds) {
        transaction.set(seed.itemRef, { ...seed.item, version: 1 });
        transaction.set(seed.publicRef, toPublicMenuItem(seed.item));
      }
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: 'MenuTemplateApplied',
        targetType: 'tenant',
        targetId: input.tenantId,
        detail: { templateId: input.templateId },
      });
    });

    return commandResult(
      'applyTemplate',
      null,
      1,
      null,
      {
        templateId: input.templateId,
        affectedItemCount: seeds.length,
      },
    );
  },
);
