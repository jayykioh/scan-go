import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Ticket } from 'lucide-react';
import type { FeedbackTopic } from '@contracts/feedback.contract';
import type { I18nMessageKey } from '@contracts/i18n.contract';
import { readFeedbackTopics } from '../data/firestoreRead';
import { createFeedbackTicket } from '../data/adapters/feedback-ticket.adapter';
import { resolveInterfaceLocale, translate } from '../data/adapters/i18n.adapter';
import { useActiveTenantId } from '../hooks/useActiveTenantId';
import { useToast } from '../contexts/ToastContext';

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Customer report counters per topic (REQ-FDB-007, REQ-FDB-008). A topic at or
 * over the configured count is badged, and the Owner opens a ticket from the
 * reports behind it. The count comes from the server; this view never computes
 * a threshold of its own.
 */
export default function CustomerReportTopics() {
  const tenantId = useActiveTenantId();
  const toast = useToast();
  const t = (key: I18nMessageKey) => translate(resolveInterfaceLocale(), key);

  const [topics, setTopics] = useState<FeedbackTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyTopic, setBusyTopic] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTopics(await readFeedbackTopics());
    } catch (loadError) {
      setError((loadError as Error).message || t('owner.topics.loadError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    void load();
  }, [tenantId, load]);

  const openTicket = async (topic: FeedbackTopic) => {
    if (!tenantId) return;
    setBusyTopic(topic.topicKey);
    try {
      await createFeedbackTicket({
        tenantId,
        feedbackIds: topic.recentFeedbackIds,
        priority: topic.alertState === 'alerted' ? 'high' : 'medium',
        reason: `${topic.label}: ${topic.windowCount} phản hồi gần đây`,
      });
      toast.success(t('owner.topics.ticketCreated'));
    } catch (ticketError) {
      toast.error((ticketError as Error).message || t('owner.topics.ticketError'));
    } finally {
      setBusyTopic(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-zinc-950">
            {t('owner.topics.title')}
          </h2>
          <p className="text-sm text-zinc-500">{t('owner.topics.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="shrink-0 rounded-full border border-zinc-200 bg-white p-2 text-zinc-600"
          aria-label={t('common.retry')}
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-zinc-100 bg-white p-6 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('common.loading')}
        </div>
      ) : error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </p>
      ) : topics.length === 0 ? (
        <p className="rounded-2xl border border-zinc-100 bg-white p-6 text-center text-sm text-zinc-500">
          {t('owner.topics.empty')}
        </p>
      ) : (
        <ul className="space-y-3">
          {topics.map((topic) => (
            <li
              key={topic.topicKey}
              className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-black text-zinc-950">
                    {topic.label}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {t('owner.topics.countLabel')}: {topic.count} · {formatTime(topic.lastAt)}
                  </p>
                </div>
                {topic.alertState === 'alerted' && (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800">
                    <AlertTriangle className="h-3 w-3" />
                    {t('owner.topics.alerted')}
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-700">
                  {topic.windowCount}
                </span>
                <button
                  type="button"
                  onClick={() => void openTicket(topic)}
                  disabled={busyTopic === topic.topicKey}
                  className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40"
                >
                  {busyTopic === topic.topicKey ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Ticket className="h-3 w-3" />
                  )}
                  {t('owner.topics.openTicket')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
