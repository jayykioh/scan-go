import { useEffect, useState } from 'react';
import type { Ingredient, Recipe } from '@contracts/inventory.contract';
import type { CatalogMenuItem } from '@contracts/catalog.contract';
import type { TenantTable } from './adapters/table.adapter';
import type { Promotion } from '@contracts/promotion.contract';
import type { LoyaltyConfig } from '@contracts/loyalty.contract';
import { getFirebaseAuth } from '../services/firebase/client';
import { getActiveTenantId } from './adapters/tenant.adapter';
import { subscribeOwnerMenu } from './adapters/catalog.adapter';
import {
  subscribeIngredients,
  subscribeRecipes,
} from './adapters/inventory.adapter';
import { subscribeTenantTables } from './adapters/table.adapter';
import { listPromotions } from './adapters/promotion.adapter';
import { getLoyaltyConfig } from './adapters/loyalty.adapter';

/**
 * One client-side store for the active tenant. Every slice opens a single
 * shared Firestore listener (or fetch) and keeps it alive while at least one
 * screen uses it. Screens read the same data, so switching screens no longer
 * restarts a load. See ADR 0015.
 *
 * Writes still go through the server callables. The store holds reads only.
 */

export interface TenantStoreState {
  tenantId: string | null;
  menuItems: CatalogMenuItem[];
  ingredients: Ingredient[];
  recipes: Recipe[];
  tables: TenantTable[];
  promotions: Promotion[];
  loyaltyConfig: LoyaltyConfig | null;
  loading: {
    menuItems: boolean;
    ingredients: boolean;
    recipes: boolean;
    tables: boolean;
    promotions: boolean;
    loyaltyConfig: boolean;
  };
  errors: Partial<Record<keyof TenantStoreState['loading'], string>>;
}

type SliceKey =
  | 'menuItems'
  | 'ingredients'
  | 'recipes'
  | 'tables'
  | 'promotions'
  | 'loyaltyConfig';

type Listener = () => void;

interface Slice {
  key: SliceKey;
  refCount: number;
  unsubscribe: (() => void) | null;
}

const EMPTY_LOADING = {
  menuItems: false,
  ingredients: false,
  recipes: false,
  tables: false,
  promotions: false,
  loyaltyConfig: false,
} as const;

let state: TenantStoreState = {
  tenantId: null,
  menuItems: [],
  ingredients: [],
  recipes: [],
  tables: [],
  promotions: [],
  loyaltyConfig: null,
  loading: { ...EMPTY_LOADING },
  errors: {},
};

const listeners = new Set<Listener>();
const slices = new Map<SliceKey, Slice>();
let tenantUnsubscribe: (() => void) | null = null;

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
  const created: Slice = { key, refCount: 0, unsubscribe: null };
  slices.set(key, created);
  return created;
}

function clearSliceData(key: SliceKey): void {
  if (key === 'promotions') {
    setState({ promotions: [] });
  } else if (key === 'loyaltyConfig') {
    setState({ loyaltyConfig: null });
  } else {
    setState({ [key]: [] } as Partial<TenantStoreState>);
  }
}

function startSlice(key: SliceKey, tenantId: string): void {
  const entry = slice(key);
  if (entry.unsubscribe) {
    return;
  }
  setLoading(key, true);
  setError(key, null);

  if (key === 'menuItems') {
    entry.unsubscribe = subscribeOwnerMenu(
      (items) => {
        setState({ menuItems: items });
        setLoading(key, false);
      },
      (error) => {
        setError(key, error.message);
        setLoading(key, false);
      },
    );
    return;
  }

  if (key === 'ingredients') {
    entry.unsubscribe = subscribeIngredients(
      (items) => {
        setState({ ingredients: items });
        setLoading(key, false);
      },
      (error) => {
        setError(key, error.message);
        setLoading(key, false);
      },
    );
    return;
  }

  if (key === 'recipes') {
    entry.unsubscribe = subscribeRecipes(
      (items) => {
        setState({ recipes: items });
        setLoading(key, false);
      },
      (error) => {
        setError(key, error.message);
        setLoading(key, false);
      },
    );
    return;
  }

  if (key === 'tables') {
    entry.unsubscribe = subscribeTenantTables(
      (items) => {
        setState({ tables: items });
        setLoading(key, false);
      },
      (error) => {
        setError(key, error.message);
        setLoading(key, false);
      },
    );
    return;
  }

  if (key === 'promotions') {
    let cancelled = false;
    entry.unsubscribe = () => {
      cancelled = true;
    };
    void listPromotions()
      .then((items) => {
        if (!cancelled) {
          setState({ promotions: items });
          setLoading(key, false);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setError(key, error.message);
          setLoading(key, false);
        }
      });
    return;
  }

  if (key === 'loyaltyConfig') {
    let cancelled = false;
    entry.unsubscribe = () => {
      cancelled = true;
    };
    void getLoyaltyConfig()
      .then((config) => {
        if (!cancelled) {
          setState({ loyaltyConfig: config });
          setLoading(key, false);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setError(key, error.message);
          setLoading(key, false);
        }
      });
  }
}

function stopSlice(key: SliceKey): void {
  const entry = slices.get(key);
  if (!entry) {
    return;
  }
  entry.unsubscribe?.();
  entry.unsubscribe = null;
  clearSliceData(key);
  setLoading(key, false);
  setError(key, null);
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
  const sync = () => {
    void getActiveTenantId()
      .then((tenantId) => {
        if (cancelled || tenantId === state.tenantId) {
          return;
        }
        resetForTenant(tenantId);
      })
      .catch(() => {
        if (!cancelled && state.tenantId !== null) {
          resetForTenant(null);
        }
      });
  };
  sync();
  const stopAuth = auth.onAuthStateChanged(sync);
  tenantUnsubscribe = () => {
    cancelled = true;
    stopAuth();
  };
}

function resetForTenant(tenantId: string | null): void {
  for (const entry of slices.values()) {
    entry.unsubscribe?.();
    entry.unsubscribe = null;
    slice(entry.key).refCount = entry.refCount;
  }
  state = {
    tenantId,
    menuItems: [],
    ingredients: [],
    recipes: [],
    tables: [],
    promotions: [],
    loyaltyConfig: null,
    loading: { ...EMPTY_LOADING },
    errors: {},
  };
  emit();
  for (const entry of slices.values()) {
    if (entry.refCount > 0 && tenantId) {
      startSlice(entry.key, tenantId);
    }
  }
}

/** Register a mounted screen as a consumer of one slice. */
export function acquireSlice(key: SliceKey): () => void {
  startTenantWatch();
  const entry = slice(key);
  entry.refCount += 1;
  if (entry.refCount === 1 && state.tenantId) {
    startSlice(key, state.tenantId);
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    entry.refCount -= 1;
    if (entry.refCount === 0) {
      stopSlice(key);
    }
  };
}

export function getStoreState(): TenantStoreState {
  return state;
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
 * Read one slice and keep it alive while the calling screen is mounted. The
 * shared listener opens on the first screen and closes when the last unmounts.
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
