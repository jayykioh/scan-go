import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bug,
  Gauge,
  ImageIcon,
  Lightbulb,
  Loader2,
  MousePointerClick,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type {
  ProductFeedbackCategory,
  ProductFeedbackRecord,
  ProductFeedbackStatus,
} from '@contracts/product-feedback.contract';
import type { I18nMessageKey } from '@contracts/i18n.contract';
import {
  listProductFeedback,
  resolveFeedbackImageUrl,
  setProductFeedbackStatus,
} from '../data/adapters/product-feedback.adapter';
import { resolveInterfaceLocale, translate } from '../data/adapters/i18n.adapter';
import { useActiveTenantId } from '../hooks/useActiveTenantId';
import { useToast } from '../contexts/ToastContext';

const CATEGORY_KEY: Record<ProductFeedbackCategory, I18nMessageKey> = {
  bug: 'feedback.category.bug',
  ux: 'feedback.category.ux',
  feature: 'feedback.category.feature',
  performance: 'feedback.category.performance',
  other: 'feedback.category.other',
};

const STATUS_KEY: Record<ProductFeedbackStatus, I18nMessageKey> = {
  received: 'feedback.status.received',
  in_progress: 'feedback.status.in_progress',
  resolved: 'feedback.status.resolved',
};

const CATEGORY_ICON: Record<ProductFeedbackCategory, React.ElementType> = {
  bug: Bug,
  ux: MousePointerClick,
  feature: Lightbulb,
  performance: Gauge,
  other: Sparkles,
};

const SEVERITY_TONE: Record<string, string> = {
  low: 'border-zinc-300 bg-zinc-100 text-zinc-700',
  medium: 'border-sky-300 bg-sky-50 text-sky-800',
  high: 'border-amber-300 bg-amber-50 text-amber-800',
  critical: 'border-red-300 bg-red-50 text-red-800',
};

const STATUS_TONE: Record<ProductFeedbackStatus, string> = {
  received: 'border-zinc-300 bg-white text-zinc-700',
  in_progress: 'border-sky-300 bg-sky-50 text-sky-800',
  resolved: 'border-emerald-300 bg-emerald-50 text-emerald-800',
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** One screenshot, resolved lazily so a missing object never breaks the list. */
function FeedbackImage({ storagePath }: { storagePath: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void resolveFeedbackImageUrl(storagePath).then((resolved) => {
      if (cancelled) return;
      if (resolved) setUrl(resolved);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  if (failed) {
    return (
      <span className="flex h-20 w-20 flex-col items-center justify-center gap-1 border border-dashed border-zinc-300 bg-zinc-50 text-zinc-400">
        <ImageIcon className="h-4 w-4" />
        <span className="font-mono text-[8px] uppercase">missing</span>
      </span>
    );
  }

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className="block h-20 w-20 border-hard bg-zinc-100"
    >
      {url ? (
        <img src={url} alt={storagePath} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
      )}
    </a>
  );
}

/**
 * Owner inbox for product feedback (REQ-FDB-006). The list comes from the
 * server callable, which re-verifies that the caller is an active Owner, so the
 * page never relies on a client-side role check alone.
 */
export default function ProductFeedbackInbox() {
  const tenantId = useActiveTenantId();
  const toast = useToast();
  const locale = resolveInterfaceLocale();
  const t = (key: I18nMessageKey) => translate(locale, key);

  const [items, setItems] = useState<ProductFeedbackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listProductFeedback({ tenantId, limit: 50 });
      setItems(result.items);
    } catch (loadError) {
      setError((loadError as Error).message || t('feedback.inbox.loadError'));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async (
    record: ProductFeedbackRecord,
    toStatus: ProductFeedbackStatus,
  ) => {
    if (!tenantId) return;
    const reason = window.prompt(t('feedback.action.reason'));
    if (!reason || reason.trim().length === 0) return;
    setBusyId(record.feedbackId);
    try {
      const result = await setProductFeedbackStatus({
        tenantId,
        feedbackId: record.feedbackId,
        toStatus,
        reason: reason.trim(),
      });
      setItems((prev) =>
        prev.map((item) =>
          item.feedbackId === record.feedbackId ? result.record : item,
        ),
      );
      toast.success(t(STATUS_KEY[toStatus]));
    } catch (statusError) {
      toast.error((statusError as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl p-6 md:p-10">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-zinc-900 uppercase">
            {t('feedback.inbox.title')}
          </h1>
          <p className="mt-1 font-medium text-zinc-500">
            {t('feedback.inbox.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-2 border-hard bg-white px-4 py-2.5 font-mono text-[11px] font-black uppercase tracking-widest shadow-hard transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
        >
          <RefreshCw className="h-4 w-4" />
          {t('common.retry')}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-6 border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
        >
          {error}
        </p>
      )}

      {loading && items.length === 0 && (
        <p className="flex items-center gap-2 py-16 font-mono text-xs uppercase tracking-widest text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}
        </p>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-zinc-200 bg-zinc-50 py-20 text-zinc-500">
          <AlertTriangle className="h-8 w-8 text-zinc-300" />
          <p className="font-bold">{t('feedback.inbox.empty')}</p>
        </div>
      )}

      <ul className="space-y-4">
        {items.map((item) => {
          const Icon = CATEGORY_ICON[item.category];
          return (
            <li
              key={item.feedbackId}
              className="border-hard bg-white p-5 shadow-[4px_4px_0_0_#e4e4e7]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 border border-zinc-900 bg-zinc-950 px-2 py-1 font-mono text-[10px] font-black uppercase tracking-widest text-white">
                  <Icon className="h-3.5 w-3.5" />
                  {t(CATEGORY_KEY[item.category])}
                </span>
                <span
                  className={`border px-2 py-1 font-mono text-[10px] font-black uppercase tracking-widest ${SEVERITY_TONE[item.severity]}`}
                >
                  {item.severity}
                </span>
                <span
                  className={`border px-2 py-1 font-mono text-[10px] font-black uppercase tracking-widest ${STATUS_TONE[item.status]}`}
                >
                  {t(STATUS_KEY[item.status])}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                  {item.actorRole} · {formatTime(item.createdAt)}
                </span>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
                {item.message}
              </p>

              {item.screenContext && (
                <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                  {item.screenContext}
                </p>
              )}

              {item.attachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.attachments.map((attachment) => (
                    <FeedbackImage
                      key={attachment.storagePath}
                      storagePath={attachment.storagePath}
                    />
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                {item.status !== 'in_progress' && item.status !== 'resolved' && (
                  <button
                    type="button"
                    disabled={busyId === item.feedbackId}
                    onClick={() => void changeStatus(item, 'in_progress')}
                    className="border border-sky-300 bg-sky-50 px-3 py-2 font-mono text-[10px] font-black uppercase tracking-widest text-sky-800 disabled:opacity-50"
                  >
                    {t('feedback.action.start')}
                  </button>
                )}
                {item.status !== 'resolved' && (
                  <button
                    type="button"
                    disabled={busyId === item.feedbackId}
                    onClick={() => void changeStatus(item, 'resolved')}
                    className="border border-emerald-300 bg-emerald-50 px-3 py-2 font-mono text-[10px] font-black uppercase tracking-widest text-emerald-800 disabled:opacity-50"
                  >
                    {t('feedback.action.resolve')}
                  </button>
                )}
                <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                  {item.history.length} history
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
