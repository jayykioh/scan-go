import { useEffect, useState } from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import type { Ingredient, Recipe } from '@contracts/inventory.contract';
import type {
  CatalogMenuItem,
  PublicMenuItem,
} from '@contracts/catalog.contract';
import type { TenantTable, TenantTableArea } from './adapters/table.adapter';
import type { Promotion } from '@contracts/promotion.contract';
import type { CampaignSuggestion } from '@contracts/campaign.contract';
import type { LoyaltyConfig } from '@contracts/loyalty.contract';
import type { SubscriptionState } from '@contracts/subscription.contract';
import type { StaffDirectoryEntry } from '@contracts/staff.contract';
import { getFirebaseAuth } from '../services/firebase/client';
import {
  subscribeActiveTenantId,
  subscribeCurrentMembership,
  type ActiveMembershipReadContext,
} from './adapters/tenant.adapter';
import {
  subscribeOwnerMenu,
  subscribePublicMenu,
} from './adapters/catalog.adapter';
import {
  subscribeIngredients,
  subscribeRecipes,
} from './adapters/inventory.adapter';
import {
  subscribeTenantTableAreas,
  subscribeTenantTables,
} from './adapters/table.adapter';
import { listPromotions } from './adapters/promotion.adapter';
import { readCampaignSuggestions } from './firestoreRead';
import { getLoyaltyConfig } from './adapters/loyalty.adapter';
import { getSubscription } from './adapters/subscription.adapter';
import { subscribeStaffDirectory } from './adapters/staff.adapter';
import { clearReadCache, invalidateReadCache } from './readCache';

/**
 * One app-lifetime client store for the active non-ADMIN Tenant. Each slice is
 * loaded once per identity/tenant/authorization context and remains cached across
 * route unmounts. Live listeners are shared and disposed only when that context
 * changes. See ADR 0015 / REQ-CACHE-001.
 *
 * Writes still go through the server callables. The store holds reads only.
 */

export interface TenantStoreState {
  userId: string | null;
  tenantId: string | null;
  authorizationKey: string | null;
  menuItems: CatalogMenuItem[];
  publicMenu: PublicMenuItem[];
  ingredients: Ingredient[];
  recipes: Recipe[];
  tables: TenantTable[];
  tableAreas: TenantTableArea[];
  promotions: Promotion[];
  campaignSuggestions: CampaignSuggestion[];
  loyaltyConfig: LoyaltyConfig | null;
  subscription: SubscriptionState | null;
  staffDirectory: StaffDirectoryEntry[];
  loading: {
    menuItems: boolean;
    publicMenu: boolean;
    ingredients: boolean;
    recipes: boolean;
    tables: boolean;
    tableAreas: boolean;
    promotions: boolean;
    campaignSuggestions: boolean;
    loyaltyConfig: boolean;
    subscription: boolean;
    staffDirectory: boolean;
  };
  errors: Partial<Record<keyof TenantStoreState['loading'], string>>;
}

type SliceKey =
  | 'menuItems'
  | 'publicMenu'
  | 'ingredients'
  | 'recipes'
  | 'tables'
  | 'tableAreas'
  | 'promotions'
  | 'campaignSuggestions'
  | 'loyaltyConfig'
  | 'subscription'
  | 'staffDirectory';

type Listener = () => void;

interface Slice {
  key: SliceKey;
  refCount: number;
  unsubscribe: (() => void) | null;
  pending: boolean;
  hasValue: boolean;
  dirty: boolean;
  revision: number;
}

const EMPTY_LOADING = {
  menuItems: false,
  publicMenu: false,
  ingredients: false,
  recipes: false,
  tables: false,
  tableAreas: false,
  promotions: false,
  campaignSuggestions: false,
  loyaltyConfig: false,
  subscription: false,
  staffDirectory: false,
} as const;

let state: TenantStoreState = {
  userId: null,
  tenantId: null,
  authorizationKey: null,
  menuItems: [],
  publicMenu: [],
  ingredients: [],
  recipes: [],
  tables: [],
  tableAreas: [],
  promotions: [],
  campaignSuggestions: [],
  loyaltyConfig: null,
  subscription: null,
  staffDirectory: [],
  loading: { ...EMPTY_LOADING },
  errors: {},
};

const listeners = new Set<Listener>();
const slices = new Map<SliceKey, Slice>();
let tenantUnsubscribe: (() => void) | null = null;
let profileUnsubscribe: (() => void) | null = null;
let membershipUnsubscribe: (() => void) | null = null;
let watchedUid: string | null = null;
let watchedTenantId: string | null = null;
let authorizationKey: string | null = null;
/**
 * The active member's area scope (REQ-TBL-010), kept beside `authorizationKey`
 * so the `tables` slice can pick its query without re-reading the membership.
 */
let assignedAreas: string[] = [];
let contextGeneration = 0;

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(patch: Partial<TenantStoreState>): void {
  state = { ...state, ...patch };
  emit();
}

function setLoading(key: SliceKey, value: boolean): void {
  setState({ loading: { ...state.loading, [key]: value } });
}

function setError(key: SliceKey, message: string | null): void {
  const errors = { ...state.errors };
  if (message) {
    errors[key] = message;
  } else {
    delete errors[key];
  }
  setState({ errors });
}

function slice(key: SliceKey): Slice {
  const existing = slices.get(key);
  if (existing) {
    return existing;
  }
  const created: Slice = {
    key,
    refCount: 0,
    unsubscribe: null,
    pending: false,
    hasValue: false,
    dirty: false,
    revision: 0,
  };
  slices.set(key, created);
  return created;
}

function clearSliceData(key: SliceKey): void {
  if (key === 'promotions') {
    setState({ promotions: [] });
  } else if (key === 'publicMenu') {
    setState({ publicMenu: [] });
  } else if (key === 'campaignSuggestions') {
    setState({ campaignSuggestions: [] });
  } else if (key === 'loyaltyConfig') {
    setState({ loyaltyConfig: null });
  } else if (key === 'subscription') {
    setState({ subscription: null });
  } else if (key === 'staffDirectory') {
    setState({ staffDirectory: [] });
  } else if (key === 'tableAreas') {
    setState({ tableAreas: [] });
  } else {
    setState({ [key]: [] } as Partial<TenantStoreState>);
  }
}

function isCurrentSliceRequest(
  tenantId: string,
  generation: number,
  entry: Slice,
  revision: number,
): boolean {
  return (
    generation === contextGeneration &&
    state.tenantId === tenantId &&
    state.userId !== null &&
    state.authorizationKey !== null &&
    entry.revision === revision
  );
}

function isAccessError(error: Error): boolean {
  const code = (error as Error & { code?: string }).code;
  return code === 'permission-denied' || code === 'unauthenticated';
}

function publishSlice(
  key: SliceKey,
  tenantId: string,
  entry: Slice,
  generation: number,
  revision: number,
  patch: Partial<TenantStoreState>,
): void {
  if (!isCurrentSliceRequest(tenantId, generation, entry, revision)) {
    return;
  }
  entry.pending = false;
  entry.hasValue = true;
  entry.dirty = false;
  setState(patch);
  setLoading(key, false);
  setError(key, null);
}

function failSlice(
  key: SliceKey,
  tenantId: string,
  entry: Slice,
  generation: number,
  revision: number,
  error: Error,
): void {
  if (!isCurrentSliceRequest(tenantId, generation, entry, revision)) {
    return;
  }
  entry.pending = false;
  entry.unsubscribe?.();
  entry.unsubscribe = null;
  entry.dirty = true;
  if (isAccessError(error)) {
    entry.hasValue = false;
    entry.dirty = false;
    clearSliceData(key);
  }
  setError(key, error.message);
  setLoading(key, false);
}

function startSlice(key: SliceKey, tenantId: string): void {
  const entry = slice(key);
  if (
    !state.userId ||
    !state.authorizationKey ||
    state.tenantId !== tenantId ||
    entry.unsubscribe ||
    entry.pending ||
    (entry.hasValue && !entry.dirty)
  ) {
    return;
  }

  const generation = contextGeneration;
  const revision = entry.revision;
  entry.pending = true;
  entry.dirty = false;
  setError(key, null);
  if (!entry.hasValue) {
    setLoading(key, true);
  }

  const onFailure = (error: Error) =>
    failSlice(key, tenantId, entry, generation, revision, error);

  if (key === 'menuItems') {
    entry.unsubscribe = subscribeOwnerMenu(
      tenantId,
      (items) =>
        publishSlice(key, tenantId, entry, generation, revision, {
          menuItems: items,
        }),
      onFailure,
    );
    return;
  }

  if (key === 'publicMenu') {
    entry.unsubscribe = subscribePublicMenu(
      tenantId,
      (items) =>
        publishSlice(key, tenantId, entry, generation, revision, {
          publicMenu: items,
        }),
      { onError: onFailure },
    );
    return;
  }

  if (key === 'ingredients') {
    entry.unsubscribe = subscribeIngredients(
      tenantId,
      (items) =>
        publishSlice(key, tenantId, entry, generation, revision, {
          ingredients: items,
        }),
      onFailure,
    );
    return;
  }

  if (key === 'recipes') {
    entry.unsubscribe = subscribeRecipes(
      tenantId,
      (items) =>
        publishSlice(key, tenantId, entry, generation, revision, {
          recipes: items,
        }),
      onFailure,
    );
    return;
  }

  if (key === 'tables') {
    entry.unsubscribe = subscribeTenantTables(
      tenantId,
      // A member with no area assignment keeps the tenant-wide listener; an
      // assigned member loads only their areas, because Rules deny the rest
      // (REQ-TBL-010). Changing an assignment changes the membership access
      // key, which resets this context and re-subscribes.
      assignedAreas.length === 0 || !state.userId
        ? 'all'
        : { uid: state.userId },
      (items) =>
        publishSlice(key, tenantId, entry, generation, revision, {
          tables: items,
        }),
      onFailure,
    );
    return;
  }

  if (key === 'staffDirectory') {
    entry.unsubscribe = subscribeStaffDirectory(
      tenantId,
      (staffDirectory) =>
        publishSlice(key, tenantId, entry, generation, revision, {
          staffDirectory,
        }),
      onFailure,
    );
    return;
  }

  if (key === 'tableAreas') {
    entry.unsubscribe = subscribeTenantTableAreas(
      tenantId,
      (tableAreas) =>
        publishSlice(key, tenantId, entry, generation, revision, {
          tableAreas,
        }),
      onFailure,
    );
    return;
  }

  const publishFailure = (error: Error) =>
    failSlice(key, tenantId, entry, generation, revision, error);
  const publishPromotions = (items: Promotion[]) =>
    publishSlice(key, tenantId, entry, generation, revision, { promotions: items });
  const publishSuggestions = (items: CampaignSuggestion[]) =>
    publishSlice(key, tenantId, entry, generation, revision, {
      campaignSuggestions: items,
    });
  const publishLoyaltyConfig = (config: LoyaltyConfig) =>
    publishSlice(key, tenantId, entry, generation, revision, {
      loyaltyConfig: config,
    });
  const publishSubscription = (subscription: SubscriptionState | null) =>
    publishSlice(key, tenantId, entry, generation, revision, { subscription });

  if (key === 'promotions') {
    void listPromotions(tenantId).then(publishPromotions).catch(publishFailure);
  } else if (key === 'campaignSuggestions') {
    void readCampaignSuggestions(tenantId)
      .then(publishSuggestions)
      .catch(publishFailure);
  } else if (key === 'loyaltyConfig') {
    void getLoyaltyConfig(tenantId)
      .then(publishLoyaltyConfig)
      .catch(publishFailure);
  } else {
    void getSubscription(tenantId)
      .then(publishSubscription)
      .catch(publishFailure);
  }
}

function resetForContext(
  userId: string | null,
  tenantId: string | null,
  accessKey: string | null,
): void {
  if (accessKey === null) {
    // No resolved context: drop the area scope with it, so a later context can
    // never inherit the previous member's zones (REQ-TBL-010).
    assignedAreas = [];
  }
  contextGeneration += 1;
  clearReadCache();
  for (const entry of slices.values()) {
    entry.unsubscribe?.();
    entry.unsubscribe = null;
    entry.pending = false;
    entry.hasValue = false;
    entry.dirty = false;
    entry.revision += 1;
  }
  state = {
    userId,
    tenantId,
    authorizationKey: accessKey,
    menuItems: [],
    publicMenu: [],
    ingredients: [],
    recipes: [],
    tables: [],
    tableAreas: [],
    promotions: [],
    campaignSuggestions: [],
    loyaltyConfig: null,
    subscription: null,
    staffDirectory: [],
    loading: { ...EMPTY_LOADING },
    errors: {},
  };
  emit();
  if (!userId || !tenantId || !accessKey) {
    return;
  }
  for (const entry of slices.values()) {
    if (entry.refCount > 0) {
      startSlice(entry.key, tenantId);
    }
  }
}

function membershipAccessKey(
  membership: ActiveMembershipReadContext,
): string {
  return JSON.stringify([
    membership.isActive,
    membership.membershipType,
    membership.roles,
    membership.sessionVersion,
    // An area re-assignment changes what this member may read, so it must reset
    // the cached slices and re-subscribe the table listener (REQ-TBL-010).
    membership.assignedAreas,
  ]);
}

function startTenantWatch(): void {
  if (tenantUnsubscribe) {
    return;
  }
  const auth = getFirebaseAuth();
  if (!auth) {
    return;
  }

  let cancelled = false;
  let tokenGeneration = 0;
  const stopAuth = onIdTokenChanged(auth, (user) => {
    const identityUid = user?.uid ?? null;
    if (identityUid !== watchedUid) {
      watchedUid = identityUid;
      profileUnsubscribe?.();
      profileUnsubscribe = null;
      membershipUnsubscribe?.();
      membershipUnsubscribe = null;
      watchedTenantId = null;
      authorizationKey = null;
      resetForContext(identityUid, null, null);
    }
    const thisTokenGeneration = ++tokenGeneration;
    if (!user) {
      return;
    }
    const uid = user.uid;

    void user
      .getIdTokenResult()
      .then((token) => {
        if (
          cancelled ||
          tokenGeneration !== thisTokenGeneration ||
          watchedUid !== uid
        ) {
          return;
        }
        if (token.claims.admin === true) {
          profileUnsubscribe?.();
          profileUnsubscribe = null;
          membershipUnsubscribe?.();
          membershipUnsubscribe = null;
          watchedTenantId = null;
          authorizationKey = null;
          resetForContext(uid, null, null);
          return;
        }
        if (profileUnsubscribe) {
          return;
        }

        profileUnsubscribe = subscribeActiveTenantId(
          uid,
          (tenantId) => {
            if (cancelled || watchedUid !== uid) {
              return;
            }
            if (
              tenantId === watchedTenantId &&
              (tenantId === null || membershipUnsubscribe !== null)
            ) {
              return;
            }
            membershipUnsubscribe?.();
            membershipUnsubscribe = null;
            watchedTenantId = tenantId;
            authorizationKey = null;
            resetForContext(uid, null, null);
            if (!tenantId) {
              return;
            }

            membershipUnsubscribe = subscribeCurrentMembership(
              tenantId,
              uid,
              (membership) => {
                if (
                  cancelled ||
                  watchedUid !== uid ||
                  watchedTenantId !== tenantId
                ) {
                  return;
                }
                if (!membership?.isActive) {
                  authorizationKey = null;
                  assignedAreas = [];
                  resetForContext(uid, null, null);
                  return;
                }
                assignedAreas = membership.assignedAreas;
                const nextAccessKey = membershipAccessKey(membership);
                if (
                  state.userId !== uid ||
                  state.tenantId !== tenantId ||
                  authorizationKey !== nextAccessKey
                ) {
                  authorizationKey = nextAccessKey;
                  resetForContext(uid, tenantId, nextAccessKey);
                }
              },
              () => {
                if (cancelled || watchedUid !== uid) {
                  return;
                }
                membershipUnsubscribe?.();
                membershipUnsubscribe = null;
                watchedTenantId = null;
                authorizationKey = null;
                resetForContext(uid, null, null);
              },
            );
          },
          () => {
            if (cancelled || watchedUid !== uid) {
              return;
            }
            profileUnsubscribe?.();
            profileUnsubscribe = null;
            membershipUnsubscribe?.();
            membershipUnsubscribe = null;
            watchedTenantId = null;
            authorizationKey = null;
            resetForContext(uid, null, null);
          },
        );
      })
      .catch(() => {
        if (
          !cancelled &&
          tokenGeneration === thisTokenGeneration &&
          watchedUid === uid
        ) {
          profileUnsubscribe?.();
          profileUnsubscribe = null;
          membershipUnsubscribe?.();
          membershipUnsubscribe = null;
          watchedTenantId = null;
          authorizationKey = null;
          resetForContext(uid, null, null);
        }
      });
  });

  tenantUnsubscribe = () => {
    cancelled = true;
    tokenGeneration += 1;
    profileUnsubscribe?.();
    profileUnsubscribe = null;
    membershipUnsubscribe?.();
    membershipUnsubscribe = null;
    stopAuth();
  };
}

/** Register a mounted screen as a consumer of one slice. */
/** Start the shared auth/tenant/membership watcher before one-shot reads. */
export function ensureTenantStoreContext(): void {
  startTenantWatch();
}

export function acquireSlice(key: SliceKey): () => void {
  startTenantWatch();
  const entry = slice(key);
  entry.refCount += 1;
  if (state.tenantId) {
    startSlice(key, state.tenantId);
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    entry.refCount = Math.max(0, entry.refCount - 1);
    // Keep the valid value and shared listener across route unmounts. The
    // authenticated/tenant/role context watcher clears them when access changes.
  };
}

export function getStoreState(): TenantStoreState {
  return state;
}

/**
 * Re-run one slice's fetch after a server command changed its data. Writes go
 * through callables, so the store has no optimistic update to reconcile; it
 * simply reloads the authoritative list.
 */
function cachePathForSlice(key: SliceKey, tenantId: string): string {
  const collectionBySlice: Record<SliceKey, string> = {
    menuItems: 'menuItems',
    publicMenu: 'publicMenuItems',
    ingredients: 'ingredients',
    recipes: 'recipes',
    tables: 'tables',
    tableAreas: 'tableAreas',
    promotions: 'promotions',
    campaignSuggestions: 'campaignSuggestions',
    loyaltyConfig: 'loyaltyConfig',
    subscription: '',
    staffDirectory: 'staffDirectory',
  };
  const collection = collectionBySlice[key];
  return collection
    ? `tenants/${tenantId}/${collection}`
    : `tenants/${tenantId}`;
}

export function refreshSlice(key: SliceKey): void {
  const entry = slices.get(key);
  if (!entry || !state.tenantId) {
    return;
  }
  if (entry.refCount === 0 && entry.unsubscribe) {
    // A live listener already carries server updates, so do not disturb it just
    // because an inactive screen requested invalidation.
    return;
  }
  invalidateReadCache({
    userId: state.userId ?? undefined,
    tenantId: state.tenantId,
    pathPrefix: cachePathForSlice(key, state.tenantId),
  });
  entry.revision += 1;
  entry.pending = false;
  entry.dirty = true;
  if (entry.refCount === 0) {
    return;
  }
  entry.unsubscribe?.();
  entry.unsubscribe = null;
  startSlice(key, state.tenantId);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Read one slice of the tenant store with a React hook. */
export function useStore<K extends keyof TenantStoreState>(
  key: K,
): TenantStoreState[K] {
  const [value, setValue] = useState<TenantStoreState[K]>(state[key]);
  useEffect(() => {
    setValue(state[key]);
    return subscribe(() => setValue(state[key]));
  }, [key]);
  return value;
}

/** Read the active tenant id from the store without a listener of its own. */
export function useStoreTenantId(): string | null {
  return useStore('tenantId');
}

/**
 * Read one slice and register a screen as a consumer. The cache/listener remain
 * shared across route unmounts and close only when auth/tenant access changes.
 */
export function useStoreSlice<K extends SliceKey>(
  key: K,
): [TenantStoreState[K], { loading: boolean; error: string | null }] {
  const value = useStore(key);
  const loading = useStore('loading');
  const errors = useStore('errors');
  useEffect(() => acquireSlice(key), [key]);
  return [value, { loading: loading[key], error: errors[key] ?? null }];
}
