import React, { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

interface GuideStep {
  title: string;
  body: string;
}

interface GuideModalProps {
  storageKey: string;
  title: string;
  eyebrow?: string;
  steps: GuideStep[];
}

export default function GuideModal({ storageKey, title, eyebrow = 'Hướng dẫn nhanh', steps }: GuideModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(window.localStorage.getItem(storageKey) !== 'dismissed');
  }, [storageKey]);

  const dismiss = () => {
    window.localStorage.setItem(storageKey, 'dismissed');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <aside className="fixed bottom-4 right-4 z-[9999] w-[calc(100vw-2rem)] max-w-[380px] animate-fadeIn sm:bottom-6 sm:right-6">
      <div className="overflow-hidden border-hard bg-white shadow-[8px_8px_0_0_#27272a]">
        <div className="flex items-start justify-between gap-3 border-b border-hard bg-zinc-950 p-4 text-white">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-white/20 bg-orange-600 shadow-[3px_3px_0_0_rgba(255,255,255,0.18)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[9px] font-black uppercase tracking-[0.22em] text-orange-300">ScanGo Assistant</p>
              <h2 className="mt-1 text-base font-black leading-tight tracking-[-0.03em] text-white">{title}</h2>
            </div>
          </div>
          <button type="button" onClick={dismiss} className="flex h-8 w-8 shrink-0 items-center justify-center bg-white/10 text-zinc-300 transition-colors hover:bg-white hover:text-zinc-950" aria-label="Ẩn trợ lý hướng dẫn">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          <p className="mb-3 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-orange-600">{eyebrow}</p>
          <div className="space-y-2">
          {steps.map((step, index) => (
            <div key={step.title} className="flex gap-3 border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-zinc-950 font-mono text-[10px] font-black text-white">{index + 1}</div>
              <div>
                <p className="text-xs font-black uppercase tracking-tight text-zinc-950">{step.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{step.body}</p>
              </div>
            </div>
          ))}
          </div>

          <button type="button" onClick={dismiss} className="mt-4 w-full bg-orange-600 px-4 py-3 font-mono text-[11px] font-black uppercase tracking-widest text-white shadow-[4px_4px_0_0_#27272a] transition-transform hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none">
            Đã hiểu
          </button>
        </div>
      </div>
    </aside>
  );
}
