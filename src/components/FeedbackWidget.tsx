import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, Loader2, MessageSquarePlus, Send, Trash2, X } from 'lucide-react';
import {
  PRODUCT_FEEDBACK_MAX_ATTACHMENTS,
  PRODUCT_FEEDBACK_MESSAGE_MAX_LENGTH,
  PRODUCT_FEEDBACK_MESSAGE_MIN_LENGTH,
  type ProductFeedbackAttachment,
  type ProductFeedbackCategory,
  type ProductFeedbackSeverity,
} from '@contracts/product-feedback.contract';
import type { I18nMessageKey } from '@contracts/i18n.contract';
import {
  PRODUCT_FEEDBACK_IMAGE_COUNT_ERROR,
  submitProductFeedback,
  uploadFeedbackImage,
} from '../data/adapters/product-feedback.adapter';
import { resolveInterfaceLocale, translate } from '../data/adapters/i18n.adapter';
import { useActiveTenantId } from '../hooks/useActiveTenantId';
import { useToast } from '../contexts/ToastContext';

const CATEGORIES: ProductFeedbackCategory[] = [
  'bug',
  'ux',
  'feature',
  'performance',
  'other',
];

const SEVERITIES: ProductFeedbackSeverity[] = [
  'low',
  'medium',
  'high',
  'critical',
];

const CATEGORY_KEY: Record<ProductFeedbackCategory, I18nMessageKey> = {
  bug: 'feedback.category.bug',
  ux: 'feedback.category.ux',
  feature: 'feedback.category.feature',
  performance: 'feedback.category.performance',
  other: 'feedback.category.other',
};

const SEVERITY_KEY: Record<ProductFeedbackSeverity, I18nMessageKey> = {
  low: 'feedback.severity.low',
  medium: 'feedback.severity.medium',
  high: 'feedback.severity.high',
  critical: 'feedback.severity.critical',
};

interface PendingImage {
  attachment: ProductFeedbackAttachment;
  previewUrl: string;
  name: string;
}

/**
 * Floating product-feedback widget (REQ-FDB-004, REQ-FDB-005).
 *
 * Every signed-in Tenant member can report a bug, a usability problem, or a
 * feature request about ScanGo itself, with up to three screenshots. The
 * browser uploads each image straight to Storage under
 * `tenants/{tenantId}/feedbackAttachments/{uid}/` — the reporter's own prefix —
 * and the server records the paths on a tenant-scoped, server-written document.
 * Nothing here writes a business collection directly (docs/RULES.md).
 */
export default function FeedbackWidget() {
  const tenantId = useActiveTenantId();
  const toast = useToast();
  const locale = resolveInterfaceLocale();
  const t = (key: I18nMessageKey) => translate(locale, key);

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ProductFeedbackCategory>('bug');
  const [severity, setSeverity] = useState<ProductFeedbackSeverity>('medium');
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<PendingImage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Preview URLs are revoked on unmount only: revoking them on every render
  // would blank the thumbnails that are still attached.
  const imagesRef = useRef<PendingImage[]>([]);
  imagesRef.current = images;

  useEffect(() => {
    return () => {
      for (const image of imagesRef.current) {
        URL.revokeObjectURL(image.previewUrl);
      }
    };
  }, []);

  const reset = () => {
    for (const image of images) {
      URL.revokeObjectURL(image.previewUrl);
    }
    setImages([]);
    setMessage('');
    setCategory('bug');
    setSeverity('medium');
    setError(null);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!tenantId) {
      setError('Chưa xác định được cửa hàng. Vui lòng tải lại trang.');
      return;
    }
    setError(null);
    const room = PRODUCT_FEEDBACK_MAX_ATTACHMENTS - images.length;
    const selected = [...files].slice(0, Math.max(0, room));
    if ([...files].length > room) {
      setError(PRODUCT_FEEDBACK_IMAGE_COUNT_ERROR);
    }
    for (const file of selected) {
      try {
        const attachment = await uploadFeedbackImage(tenantId, file);
        setImages((prev) => [
          ...prev,
          {
            attachment,
            previewUrl: URL.createObjectURL(file),
            name: file.name,
          },
        ]);
      } catch (uploadError) {
        setError((uploadError as Error).message);
      }
    }
  };

  const removeImage = (storagePath: string) => {
    setImages((prev) => {
      const hit = prev.find((image) => image.attachment.storagePath === storagePath);
      if (hit) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((image) => image.attachment.storagePath !== storagePath);
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    if (!tenantId) {
      setError('Chưa xác định được cửa hàng. Vui lòng tải lại trang.');
      return;
    }
    if (message.trim().length < PRODUCT_FEEDBACK_MESSAGE_MIN_LENGTH) {
      setError(
        `Cần ít nhất ${PRODUCT_FEEDBACK_MESSAGE_MIN_LENGTH} ký tự để mô tả vấn đề.`,
      );
      return;
    }
    setSending(true);
    setError(null);
    try {
      await submitProductFeedback({
        tenantId,
        category,
        severity,
        message: message.trim(),
        attachments: images.map((image) => image.attachment),
        screenContext: window.location.pathname.slice(0, 200),
      });
      toast.success(t('feedback.success'));
      reset();
      setOpen(false);
    } catch (submitError) {
      const text = (submitError as Error).message || t('feedback.error');
      setError(text);
      toast.error(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('feedback.widget.open')}
        // `lg:left-[17.5rem]` clears the 16rem dashboard sidebar, whose bottom
        // edge holds the sign-out control; without it the button covers it.
        className="fixed bottom-4 left-4 z-[9998] flex items-center gap-2 border-hard bg-white px-4 py-3 font-mono text-[11px] font-black uppercase tracking-widest text-zinc-900 shadow-hard transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none sm:bottom-6 sm:left-6 lg:left-[17.5rem]"
      >
        <MessageSquarePlus className="h-4 w-4 text-orange-600" />
        <span className="hidden sm:inline">{t('feedback.widget.open')}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-zinc-950/50 p-4 pt-10 backdrop-blur-sm sm:items-center sm:pt-4"
            role="dialog"
            aria-modal="true"
            aria-label={t('feedback.widget.title')}
          >
            <motion.form
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              onSubmit={submit}
              className="w-full max-w-lg border-hard bg-white shadow-hard"
            >
              <header className="flex items-start justify-between gap-3 border-b border-hard bg-zinc-950 p-4 text-white">
                <div className="min-w-0">
                  <p className="font-mono text-[9px] font-black uppercase tracking-[0.22em] text-orange-300">
                    ScanGo
                  </p>
                  <h2 className="mt-1 text-base font-black tracking-[-0.03em]">
                    {t('feedback.widget.title')}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                    {t('feedback.widget.subtitle')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Đóng"
                  className="flex h-8 w-8 shrink-0 items-center justify-center bg-white/10 text-zinc-300 hover:bg-white hover:text-zinc-950"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="space-y-4 p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="feedback-category"
                      className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500"
                    >
                      {t('feedback.category.label')}
                    </label>
                    <select
                      id="feedback-category"
                      value={category}
                      onChange={(e) =>
                        setCategory(e.target.value as ProductFeedbackCategory)
                      }
                      className="w-full border-hard bg-zinc-50 px-3 py-2.5 font-mono text-sm font-bold focus:border-orange-600 focus:outline-none"
                    >
                      {CATEGORIES.map((value) => (
                        <option key={value} value={value}>
                          {t(CATEGORY_KEY[value])}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="feedback-severity"
                      className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500"
                    >
                      {t('feedback.severity.label')}
                    </label>
                    <select
                      id="feedback-severity"
                      value={severity}
                      onChange={(e) =>
                        setSeverity(e.target.value as ProductFeedbackSeverity)
                      }
                      className="w-full border-hard bg-zinc-50 px-3 py-2.5 font-mono text-sm font-bold focus:border-orange-600 focus:outline-none"
                    >
                      {SEVERITIES.map((value) => (
                        <option key={value} value={value}>
                          {t(SEVERITY_KEY[value])}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="feedback-message"
                    className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500"
                  >
                    {t('feedback.message.label')}
                  </label>
                  <textarea
                    id="feedback-message"
                    required
                    rows={4}
                    maxLength={PRODUCT_FEEDBACK_MESSAGE_MAX_LENGTH}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t('feedback.message.placeholder')}
                    className="w-full border-hard bg-zinc-50 px-3 py-2.5 text-sm focus:border-orange-600 focus:outline-none"
                  />
                  <p className="mt-1 text-right font-mono text-[10px] text-zinc-400">
                    {message.length}/{PRODUCT_FEEDBACK_MESSAGE_MAX_LENGTH}
                  </p>
                </div>

                <div>
                  <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    {t('feedback.attachments.label')}
                  </p>
                  <p className="mb-2 text-xs text-zinc-500">
                    {t('feedback.attachments.hint')}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {images.map((image) => (
                      <div
                        key={image.attachment.storagePath}
                        className="relative h-20 w-20 border-hard bg-zinc-100"
                      >
                        <img
                          src={image.previewUrl}
                          alt={image.name}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(image.attachment.storagePath)}
                          aria-label={`${t('feedback.attachments.remove')} ${image.name}`}
                          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center border border-zinc-900 bg-white text-red-600 shadow-sm"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {images.length < PRODUCT_FEEDBACK_MAX_ATTACHMENTS && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex h-20 w-20 flex-col items-center justify-center gap-1 border-2 border-dashed border-zinc-300 bg-zinc-50 text-zinc-500 hover:border-orange-500 hover:text-orange-600"
                      >
                        <Camera className="h-5 w-5" />
                        <span className="font-mono text-[9px] font-bold uppercase">
                          {images.length}/{PRODUCT_FEEDBACK_MAX_ATTACHMENTS}
                        </span>
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    multiple
                    className="hidden"
                    aria-label={t('feedback.attachments.label')}
                    onChange={(e) => {
                      void handleFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </div>

                {error && (
                  <p
                    role="alert"
                    className="border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700"
                  >
                    {error}
                  </p>
                )}
              </div>

              <footer className="flex items-center justify-end gap-3 border-t border-hard p-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2.5 font-mono text-[11px] font-black uppercase tracking-widest text-zinc-600 hover:text-zinc-900"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="flex items-center gap-2 bg-orange-600 px-5 py-2.5 font-mono text-[11px] font-black uppercase tracking-widest text-white shadow-hard transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {sending ? t('feedback.submitting') : t('feedback.submit')}
                </button>
              </footer>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
