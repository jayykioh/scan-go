import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import CustomerView from '../components/CustomerView';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  createOrderIdempotencyKey,
  submitOrder,
  subscribeOrderTracking,
  toOrderCartLines,
} from '../data/adapters/ordering.adapter';
import { subscribePublicMenu } from '../data/adapters/catalog.adapter';
import { evaluatePromotions } from '../data/adapters/promotion.adapter';
import { buildQrPayload, resolvePublicTable } from '../data/adapters/table.adapter';
import { toPublicMenuItem, toTrackingOrder } from '../data/adapters/view-mappers';
import { resolveInterfaceLocale, translate } from '../data/adapters/i18n.adapter';
import type { TableLinkContext } from '@contracts/table.contract';
import type { I18nMessageKey } from '@contracts/i18n.contract';
import type { PublicOrderTracking } from '@contracts/order.contract';
import type {
  PromotionCartLine,
  PromotionEvaluationResult,
} from '@contracts/promotion.contract';
import { MenuItem, OrderItem, TableConfig, TenantConfig } from '../types';

const IDEMPOTENCY_STORAGE_PREFIX = 'scango:order:idempotency:v1:';

export interface CustomerOrderResult {
  trackingToken: string;
  tracking: PublicOrderTracking;
}

/**
 * Adapter errors can be raw callable codes. Map a low-level error to a
 * user-facing message so the UI never shows an internal code (NFR-UX-001).
 */
function friendlyError(error: unknown, fallback: string): string {
  const raw =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const looksInternal =
    raw.length === 0 ||
    /^(internal|unknown|unavailable|permission-denied|firebaseerror)/i.test(raw);
  return looksInternal ? fallback : raw;
}

/** One idempotency key per pending submission, reused across retries (REQ-ORD-004). */
function readIdempotencyKey(token: string): string {
  const storageKey = `${IDEMPOTENCY_STORAGE_PREFIX}${token}`;
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created = createOrderIdempotencyKey();
    window.sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return createOrderIdempotencyKey();
  }
}

function clearIdempotencyKey(token: string): void {
  try {
    window.sessionStorage.removeItem(`${IDEMPOTENCY_STORAGE_PREFIX}${token}`);
  } catch {
    // Storage may be unavailable; the completed request still succeeded.
  }
}

const defaultTenant: TenantConfig = {
  shopName: 'ScanGo',
  industry: 'quan_an',
  pricingTier: 'Pro',
  paymentMode: 'Pay-Later',
  loyaltyEnabled: false,
  loyaltyRate: 1,
  onboardingStep: 4,
};

export default function PublicMenuPage() {
  const { tableId = '' } = useParams<{ tableId: string }>();
  const [locale] = useState(() => resolveInterfaceLocale());
  const t = (key: I18nMessageKey) => translate(locale, key);
  const [linkContext, setLinkContext] = useState<TableLinkContext | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<PublicOrderTracking | null>(null);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  // Resolve the opaque Table link token through the server resolver. The
  // resolver applies App Check and rate limits and returns only table context
  // (REQ-TBL-001, NFR-SEC-002).
  useEffect(() => {
    let cancelled = false;
    setLinkContext(null);
    setResolveError(null);
    if (!tableId) {
      setResolveError(t('publicMenu.invalidLink'));
      return;
    }
    void resolvePublicTable(tableId)
      .then((context) => {
        if (cancelled) return;
        if (!context.isActive) {
          setResolveError(t('publicMenu.revokedLink'));
          return;
        }
        setLinkContext(context);
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setResolveError(friendlyError(error, t('publicMenu.openLinkFailed')));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tableId]);

  // Subscribe to the real public menu projection once the tenant is known.
  useEffect(() => {
    if (!linkContext) return;
    const unsubscribe = subscribePublicMenu(
      linkContext.tenantId,
      (items) => setMenuItems(items.map(toPublicMenuItem)),
      { onError: (error) => setMenuError(friendlyError(error, t('publicMenu.menuLoadFailed'))) },
    );
    return () => unsubscribe();
  }, [linkContext]);

  // Subscribe to the public tracking projection for the submitted Order. The
  // listener stays bounded to one token and is disposed on exit (REQ-ORD-003).
  useEffect(() => {
    if (!trackingToken) return;
    const unsubscribe = subscribeOrderTracking(
      trackingToken,
      (next) => {
        if (next) setTracking(next);
      },
      (error) => setMenuError(friendlyError(error, t('publicMenu.trackFailed'))),
    );
    return () => unsubscribe();
  }, [trackingToken]);

  const tables = useMemo<TableConfig[]>(() => {
    if (!linkContext) return [];
    return [
      {
        id: linkContext.token,
        name: linkContext.tableName,
        qrPayload: buildQrPayload(window.location.origin, linkContext.token),
      },
    ];
  }, [linkContext]);

  const tenantConfig = useMemo<TenantConfig>(
    () => ({ ...defaultTenant, shopName: linkContext?.tableName ?? defaultTenant.shopName }),
    [linkContext],
  );

  const [activeTableId, setActiveTableId] = useState(tableId);
  useEffect(() => setActiveTableId(tableId), [tableId]);

  /**
   * The server evaluates the Promotion. The page owns the callable so the cart
   * never prices itself (REQ-PRO-001, NFR-DATA-001).
   */
  const handleEvaluatePromotion = useCallback(
    async (
      lines: PromotionCartLine[],
      code: string | null,
    ): Promise<PromotionEvaluationResult> => {
      if (!linkContext) {
        throw new Error(t('publicMenu.tableUnknown'));
      }
      return evaluatePromotions(lines, {
        tenantId: linkContext.tenantId,
        code,
      });
    },
    [linkContext, t],
  );

  const handleSubmitOrder = useCallback(
    async (
      cart: OrderItem[],
      paymentMode: 'Pay-First' | 'Pay-Later',
      promotionCode: string | null,
    ) => {
      if (!linkContext) {
        throw new Error(t('publicMenu.tableUnknown'));
      }
      let result;
      try {
        result = await submitOrder({
          token: linkContext.token,
          paymentMode: paymentMode === 'Pay-First' ? 'payFirst' : 'payLater',
          idempotencyKey: readIdempotencyKey(linkContext.token),
          lines: toOrderCartLines(cart),
          promotionCode,
        });
      } catch (error) {
        throw new Error(
          friendlyError(error, t('customer.submit.failed')),
          { cause: error },
        );
      }
      clearIdempotencyKey(linkContext.token);
      setTracking(result.tracking);
      setTrackingToken(result.tracking.trackingToken);
    },
    [linkContext, t],
  );

  const customerOrders = tracking ? [toTrackingOrder(tracking)] : [];

  return (
    <main className="min-h-dvh bg-[#eef0f4] text-zinc-950 flex justify-center sm:py-6">
      <div className="w-full max-w-[430px] min-h-dvh sm:min-h-[860px] sm:rounded-[44px] overflow-hidden bg-white shadow-2xl border border-white/80">
        {resolveError ? (
          <div role="alert" className="flex h-full items-center justify-center p-8 text-center">
            <div>
              <p className="text-lg font-black text-zinc-900">{t('publicMenu.cannotOpen')}</p>
              <p className="mt-2 text-sm text-zinc-500">{resolveError}</p>
            </div>
          </div>
        ) : (
          <CustomerView
            tenantConfig={tenantConfig}
            menuItems={menuItems}
            orders={customerOrders}
            loyaltyMembers={[]}
            setLoyaltyMembers={() => {}}
            simulationTableId={activeTableId}
            setSimulationTableId={setActiveTableId}
            tables={tables}
            directMenu
            isOnline={isOnline}
            onSubmitOrder={handleSubmitOrder}
            onEvaluatePromotion={handleEvaluatePromotion}
            menuError={menuError}
            tracking={tracking}
          />
        )}
      </div>
    </main>
  );
}
