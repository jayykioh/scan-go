import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  catalogMenuItemSchema,
  publicMenuItemSchema,
  type CatalogCommandResult,
  type CatalogCreateInput,
  type CatalogMenuItem,
  type CatalogSearchResult,
  type CatalogSetAvailabilityInput,
  type CatalogUpdateInput,
  type PublicMenuItem,
} from '@contracts/catalog.contract';
import {
  getFirebaseAuth,
  getFirebaseFirestore,
  getFirebaseFunctions,
} from '../../services/firebase/client';

export const PRIVATE_MENU_LISTENER_LIMIT = 100;
export const PUBLIC_MENU_LISTENER_LIMIT = 100;

export type CatalogItemCommandFields = Omit<
  CatalogCreateInput,
  'tenantId'
>;

async function readActiveTenantId(
  db: Firestore,
  uid: string,
): Promise<string | null> {
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) {
    return null;
  }
  const activeTenantId = userSnap.get('activeTenantId');
  return typeof activeTenantId === 'string' ? activeTenantId : null;
}

async function currentOwnerContext(): Promise<{ db: Firestore; tenantId: string }> {
  const db = getFirebaseFirestore();
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!db || !uid) {
    throw new Error(
      'Firebase chưa được cấu hình. Thêm VITE_FIREBASE_* vào .env.local.',
    );
  }
  const tenantId = await readActiveTenantId(db, uid);
  if (!tenantId) {
    throw new Error('Chưa chọn cửa hàng.');
  }
  return { db, tenantId };
}

/** Rebuild the frozen private-item contract from a stored document. */
export function mapStoredMenuItem(
  menuItemId: string,
  data: DocumentData,
): CatalogMenuItem {
  return catalogMenuItemSchema.parse({
    schemaVersion: data.schemaVersion ?? 1,
    menuItemId,
    tenantId: data.tenantId,
    name: data.name,
    description: data.description ?? null,
    category: data.category,
    type: data.type ?? null,
    priceVnd: data.priceVnd,
    costPriceVnd: data.costPriceVnd ?? null,
    imagePath: data.imagePath ?? null,
    modifierGroups: data.modifierGroups ?? [],
    recipeId: data.recipeId ?? null,
    isAvailable: data.isAvailable ?? false,
    stockCount: data.stockCount ?? null,
    archivedAt: data.archivedAt ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  });
}

export function mapStoredPublicMenuItem(
  menuItemId: string,
  data: DocumentData,
): PublicMenuItem {
  return publicMenuItemSchema.parse({
    schemaVersion: data.schemaVersion ?? 1,
    menuItemId,
    tenantId: data.tenantId,
    name: data.name,
    description: data.description ?? null,
    category: data.category,
    type: data.type ?? null,
    priceVnd: data.priceVnd,
    imageUrl: data.imageUrl ?? null,
    modifierGroups: data.modifierGroups ?? [],
    isAvailable: data.isAvailable ?? false,
    updatedAt: data.updatedAt,
  });
}

export async function createMenuItem(
  fields: CatalogItemCommandFields,
): Promise<CatalogCommandResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentOwnerContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<CatalogCreateInput, CatalogCommandResult>(
    functions,
    'callableCatalogCreate',
  );
  return (await callable({ ...fields, tenantId })).data;
}

export async function updateMenuItem(
  menuItemId: string,
  fields: CatalogItemCommandFields,
): Promise<CatalogCommandResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentOwnerContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<CatalogUpdateInput, CatalogCommandResult>(
    functions,
    'callableCatalogUpdate',
  );
  return (await callable({ ...fields, tenantId, menuItemId })).data;
}

export async function archiveMenuItem(
  menuItemId: string,
  reason: string | null = null,
): Promise<CatalogCommandResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentOwnerContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<
    { tenantId: string; menuItemId: string; reason: string | null },
    CatalogCommandResult
  >(functions, 'callableCatalogArchive');
  return (await callable({ tenantId, menuItemId, reason })).data;
}

export async function setMenuAvailability(
  menuItemId: string,
  isAvailable: boolean,
): Promise<CatalogCommandResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentOwnerContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<
    CatalogSetAvailabilityInput,
    CatalogCommandResult
  >(functions, 'callableCatalogSetAvailability');
  return (await callable({ tenantId, menuItemId, isAvailable })).data;
}

export async function applyMenuTemplate(
  templateId: string,
): Promise<CatalogCommandResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentOwnerContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<
    { tenantId: string; templateId: string },
    CatalogCommandResult
  >(functions, 'callableCatalogApplyTemplate');
  return (await callable({ tenantId, templateId })).data;
}

export async function searchOwnerMenu(input: {
  query: string | null;
  category: string | null;
}): Promise<CatalogSearchResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentOwnerContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<
    { tenantId: string; query: string | null; category: string | null },
    CatalogSearchResult
  >(functions, 'callableCatalogSearch');
  return (
    await callable({ tenantId, query: input.query, category: input.category })
  ).data;
}

/** Bounded private-menu listener for the Owner menu page. */
export function subscribeOwnerMenu(
  onChange: (items: CatalogMenuItem[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!db || !uid) {
    onChange([]);
    return () => undefined;
  }

  let unsubscribe: Unsubscribe | null = null;
  let cancelled = false;

  void readActiveTenantId(db, uid).then((tenantId) => {
    if (cancelled || !tenantId) {
      return;
    }
    const menuQuery = query(
      collection(db, 'tenants', tenantId, 'menuItems'),
      limit(PRIVATE_MENU_LISTENER_LIMIT),
    );
    unsubscribe = onSnapshot(
      menuQuery,
      (snap) => {
        onChange(
          snap.docs.map((docSnap) =>
            mapStoredMenuItem(docSnap.id, docSnap.data()),
          ),
        );
      },
      (error) => onError?.(error),
    );
  });

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

/**
 * Bounded public-menu listener. The server projection contains only public
 * fields, so the Customer never sees Cost, recipe, or stock.
 */
export function subscribePublicMenu(
  tenantId: string,
  onChange: (items: PublicMenuItem[]) => void,
  options: { category?: string | null; onError?: (error: Error) => void } = {},
): Unsubscribe {
  const db = getFirebaseFirestore();
  if (!db) {
    onChange([]);
    return () => undefined;
  }

  const base = collection(db, 'tenants', tenantId, 'publicMenuItems');
  const menuQuery = options.category
    ? query(
        base,
        where('category', '==', options.category),
        orderBy('updatedAt', 'desc'),
        limit(PUBLIC_MENU_LISTENER_LIMIT),
      )
    : query(base, orderBy('updatedAt', 'desc'), limit(PUBLIC_MENU_LISTENER_LIMIT));

  return onSnapshot(
    menuQuery,
    (snap) => {
      onChange(
        snap.docs.map((docSnap) =>
          mapStoredPublicMenuItem(docSnap.id, docSnap.data()),
        ),
      );
    },
    (error) => options.onError?.(error),
  );
}
