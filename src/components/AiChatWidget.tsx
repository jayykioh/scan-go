import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Loader2,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  AiAskResult,
  AiWarningSeverity,
} from '@contracts/ai.contract';
import { askAiQuestion } from '../data/adapters/ai.adapter';
import { useActiveTenantId } from '../hooks/useActiveTenantId';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  result?: AiAskResult;
  error?: string;
}

const SUGGESTIONS = [
  'Hôm nay doanh thu và lãi gộp là bao nhiêu?',
  'Món nào đang bán dưới giá vốn?',
  'Nguyên liệu nào sắp hết hàng?',
];

const MAX_QUESTION_LENGTH = 500;

const WARNING_TONE: Record<AiWarningSeverity, string> = {
  info: 'border-sky-300 bg-sky-50 text-sky-800',
  warning: 'border-amber-300 bg-amber-50 text-amber-800',
  critical: 'border-red-300 bg-red-50 text-red-800',
};

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Floating Owner AI assistant (REQ-AI-001, REQ-AI-003). The browser never holds
 * a provider secret: every question goes through the server `callableAiAsk`
 * seam, which re-verifies membership and grounds the answer in the active
 * Tenant's authorized data. Missing data is shown as a warning, never invented.
 */
export default function AiChatWidget() {
  const tenantId = useActiveTenantId();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const lastResult = [...messages]
    .reverse()
    .find((message) => message.result)?.result;

  useEffect(() => {
    if (!open) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, open, sending]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending || !tenantId) return;
    if (trimmed.length > MAX_QUESTION_LENGTH) return;

    setMessages((prev) => [
      ...prev,
      { id: newId(), role: 'user', text: trimmed },
    ]);
    setQuestion('');
    setSending(true);
    try {
      const result = await askAiQuestion({ tenantId, question: trimmed });
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'assistant', text: result.answer, result },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'assistant',
          text: '',
          error:
            error instanceof Error
              ? error.message
              : 'Không gọi được trợ lý AI.',
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void send(question);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send(question);
    }
  };

  const disabled = sending || !tenantId;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.section
            key="panel"
            role="dialog"
            aria-label="Trợ lý AI ScanGo"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="pointer-events-auto flex h-[min(72vh,560px)] w-[calc(100vw-3rem)] max-w-[400px] flex-col overflow-hidden border-hard bg-white shadow-[8px_8px_0_0_#27272a]"
          >
            <header className="flex items-center justify-between gap-3 border-b border-hard bg-zinc-950 p-3 text-white">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/20 bg-orange-600 shadow-[3px_3px_0_0_rgba(255,255,255,0.18)]">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[9px] font-black uppercase tracking-[0.22em] text-orange-300">
                    Trợ lý AI
                  </p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                    {lastResult
                      ? `${lastResult.provider} · ${lastResult.model}`
                      : 'Gemini · dữ liệu cửa hàng'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Đóng trợ lý AI"
                className="flex h-8 w-8 shrink-0 items-center justify-center bg-white/10 text-zinc-300 transition-colors hover:bg-white hover:text-zinc-950"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div
              ref={scrollRef}
              aria-live="polite"
              className="flex-1 space-y-3 overflow-y-auto bg-zinc-50 p-3"
            >
              {messages.length === 0 && (
                <div className="space-y-3">
                  <div className="border border-zinc-200 bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-900">
                      Hỏi về hoạt động của quán
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                      Câu trả lời dựa trên dữ liệu cửa hàng đang chọn và luôn
                      nêu nguồn. Trợ lý không tự đổi giá, tồn kho hay quyền.
                    </p>
                  </div>
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      disabled={!tenantId}
                      onClick={() => void send(suggestion)}
                      className="block w-full border border-zinc-200 bg-white p-3 text-left text-xs font-bold text-zinc-700 transition-colors hover:border-orange-400 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === 'user'
                      ? 'flex justify-end'
                      : 'flex justify-start'
                  }
                >
                  {message.role === 'user' ? (
                    <p className="max-w-[85%] whitespace-pre-wrap border-hard bg-orange-600 px-3 py-2 text-xs font-bold leading-relaxed text-white">
                      {message.text}
                    </p>
                  ) : (
                    <div className="max-w-[92%] space-y-2">
                      {message.error ? (
                        <p className="flex items-start gap-2 border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold leading-relaxed text-red-700">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {message.error}
                        </p>
                      ) : (
                        <div className="border-hard bg-white p-3">
                          <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-900">
                            {message.text}
                          </p>

                          {message.result && (
                            <div className="mt-3 space-y-2 border-t border-zinc-100 pt-2">
                              {message.result.warnings.length > 0 && (
                                <ul className="space-y-1">
                                  {message.result.warnings.map(
                                    (warning, index) => (
                                      <li
                                        key={`${warning.kind}-${index}`}
                                        className={`border px-2 py-1 text-[11px] font-bold leading-relaxed ${WARNING_TONE[warning.severity]}`}
                                      >
                                        {warning.message}
                                      </li>
                                    ),
                                  )}
                                </ul>
                              )}

                              {message.result.sources.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {message.result.sources
                                    .slice(0, 8)
                                    .map((source) => (
                                      <span
                                        key={`${source.type}-${source.id}`}
                                        className="border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500"
                                      >
                                        {source.label}
                                      </span>
                                    ))}
                                </div>
                              )}

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] uppercase tracking-wider text-zinc-400">
                                <span>
                                  Độ tin cậy{' '}
                                  {Math.round(message.result.confidence * 100)}%
                                </span>
                                {message.result.period && (
                                  <span>Kỳ {message.result.period}</span>
                                )}
                                {message.result.missingData && (
                                  <span className="text-amber-600">
                                    Thiếu dữ liệu
                                  </span>
                                )}
                                {message.result.dataUpdatedAt && (
                                  <span>
                                    Cập nhật{' '}
                                    {formatTime(
                                      message.result.dataUpdatedAt,
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {sending && (
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Đang phân tích…
                </div>
              )}
            </div>

            <form
              onSubmit={handleSubmit}
              className="border-t border-hard bg-white p-3"
            >
              {!tenantId && (
                <p className="mb-2 text-[11px] font-bold text-amber-700">
                  Đăng nhập và chọn cửa hàng để dùng trợ lý.
                </p>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  maxLength={MAX_QUESTION_LENGTH}
                  disabled={sending || !tenantId}
                  placeholder="Hỏi về doanh thu, món, tồn kho…"
                  aria-label="Câu hỏi cho trợ lý AI"
                  className="max-h-24 min-h-[42px] flex-1 resize-none border-hard bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-900 outline-none placeholder:text-zinc-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={disabled || question.trim().length === 0}
                  aria-label="Gửi câu hỏi"
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center border-hard bg-zinc-950 text-white shadow-hard transition-transform hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Đóng trợ lý AI' : 'Mở trợ lý AI'}
        aria-expanded={open}
        whileHover={{ y: -2 }}
        whileTap={{ x: 1, y: 1 }}
        className="pointer-events-auto relative flex h-14 w-14 items-center justify-center border-hard bg-orange-600 text-white shadow-hard"
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <>
            <Sparkles className="h-6 w-6" />
            <span className="absolute -right-1 -top-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping bg-orange-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 border border-white bg-orange-500" />
            </span>
          </>
        )}
      </motion.button>
    </div>
  );
}
