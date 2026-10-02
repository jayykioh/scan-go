import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  fulfilmentCommandResultSchema,
  type FulfilmentCommandResult,
  type FulfilmentMarkReadyInput,
  type FulfilmentMarkServedInput,
  type FulfilmentStartCookingInput,
} from '@contracts/fulfilment.contract';
import {
  notificationEventSchema,
  type NotificationEvent,
} from '@contracts/notification.contract';
import {
  orderListResultSchema,
  type OrderListResult,
} from '@contracts/order.contract';
import {
  publicMenuItemSchema,
  type CatalogCommandResult,
  type CatalogSetAvailabilityInput,
  type PublicMenuItem,
} from '@contracts/catalog.contract';
import {
  getFirebaseAuth,
  getFirebaseFirestore,
  getFirebaseFunctions,
} from '../../services/firebase/client';
import { createIdempotencyKey } from './idempotency';

export const KITCHEN_AVAILABILITY_LISTENER_LIMIT = 100;

/** Notification listeners are bounded to a small recent window. */
export const NOTIFICATION_LISTENER_LIMIT = 20;

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

async function currentTenantContext(): Promise<{
  db: Firestore;
  tenantId: string;
}> {
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

/** Kitchen command `pending → cooking` through Fulfilment and Inventory. */
export async function startCooking(
  orderId: string,
  idempotencyKey: string = createIdempotencyKey('cook'),
): Promise<FulfilmentCommandResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentTenantContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<
    FulfilmentStartCookingInput,
    FulfilmentCommandResult
  >(functions, 'callableFulfilmentStartCooking');
  const result = await callable({ tenantId, orderId, idempotencyKey });
  return fulfilmentCommandResultSchema.parse(result.data);
}

/** Kitchen command `cooking → ready` through Fulfilment and Ordering. */
export async function markReady(
  orderId: string,
  idempotencyKey: string = createIdempotencyKey('ready'),
): Promise<FulfilmentCommandResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentTenantContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<
    FulfilmentMarkReadyInput,
    FulfilmentCommandResult
  >(functions, 'callableFulfilmentMarkReady');
  const result = await callable({ tenantId, orderId, idempotencyKey });
  return fulfilmentCommandResultSchema.parse(result.data);
}

/** Waiter command `ready → served` through Fulfilment and Ordering. */
export async function markServed(
  orderId: string,
  idempotencyKey: string = createIdempotencyKey('serve'),
): Promise<FulfilmentCommandResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentTenantContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<
    FulfilmentMarkServedInput,
    FulfilmentCommandResult
  >(functions, 'callableFulfilmentMarkServed');
  const result = await callable({ tenantId, orderId, idempotencyKey });
  return fulfilmentCommandResultSchema.parse(result.data);
}

/** Waiter query: bounded `ready` Order queue. */
export async function listReadyOrders(): Promise<OrderListResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentTenantContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<
    { tenantId: string },
    OrderListResult
  >(functions, 'callableFulfilmentListReady');
  return orderListResultSchema.parse((await callable({ tenantId })).data);
}

/** Kitchen query: bounded `pending`/`cooking` queue with the Pay-First gate. */
export async function listKitchenOrders(): Promise<OrderListResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentTenantContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<
    { tenantId: string },
    OrderListResult
  >(functions, 'callableOrderListKitchen');
  return orderListResultSchema.parse((await callable({ tenantId })).data);
}

/**
 * Kitchen changes item availability through the Catalog contract. Fulfilment
 * never writes the Catalog projection directly (docs/module/fulfilment.md).
 */
export async function setKitchenItemAvailability(
  menuItemId: string,
  isAvailable: boolean,
): Promise<CatalogCommandResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentTenantContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<
    CatalogSetAvailabilityInput,
    CatalogCommandResult
  >(functions, 'callableCatalogSetAvailability');
  return (await callable({ tenantId, menuItemId, isAvailable })).data;
}

/**
 * Bounded public-menu listener for the Kitchen availability board. Customer
 * and Kitchen views both observe the same public-safe projection.
 */
export function subscribeKitchenAvailability(
  tenantId: string,
  onChange: (items: PublicMenuItem[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  if (!db) {
    onChange([]);
    return () => undefined;
  }
  const menuQuery = query(
    collection(db, 'tenants', tenantId, 'publicMenuItems'),
    orderBy('updatedAt', 'desc'),
    limit(KITCHEN_AVAILABILITY_LISTENER_LIMIT),
  );
  return onSnapshot(
    menuQuery,
    (snap) => {
      onChange(
        snap.docs.map((docSnap) =>
          mapStoredPublicMenuItem(docSnap.id, docSnap.data()),
        ),
      );
    },
    (error) => onError?.(error),
  );
}

/**
 * Play one short audible tone when sound is enabled. A browser without the Web
 * Audio API, or a blocked audio context, stays silent without an error
 * (REQ-NOT-001).
 */
export function playNotificationTone(soundEnabled: boolean): boolean {
  if (!soundEnabled) {
    return false;
  }
  const AudioContextCtor =
    typeof window !== 'undefined'
      ? (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext)
      : undefined;
  if (!AudioContextCtor) {
    return false;
  }
  try {
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.05;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.15);
    oscillator.onended = () => {
      void context.close().catch(() => undefined);
    };
    return true;
  } catch {
    return false;
  }
}

/**
 * Bounded listener for the tenant notification projection. Kitchen and Waiter
 * views observe the same server-written effects; the listener is limited to
 * the most recent window and disposed on view exit (REQ-NOT-001, NFR-RT-001).
 */
export function subscribeTenantNotifications(
  tenantId: string,
  onChange: (events: NotificationEvent[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  if (!db) {
    onChange([]);
    return () => undefined;
  }
  const eventsQuery = query(
    collection(db, 'tenants', tenantId, 'notifications'),
    orderBy('createdAt', 'desc'),
    limit(NOTIFICATION_LISTENER_LIMIT),
  );
  return onSnapshot(
    eventsQuery,
    (snap) => {
      onChange(
        snap.docs.map((docSnap) =>
          notificationEventSchema.parse(docSnap.data()),
        ),
      );
    },
    (error) => onError?.(error),
  );
}
