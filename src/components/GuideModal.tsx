import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

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
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-zinc-950/35 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg rounded-[32px] border border-zinc-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600">{eyebrow}</p>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.04em] text-zinc-950">{title}</h2>
          </div>
          <button type="button" onClick={dismiss} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {steps.map((step, index) => (
            <div key={step.title} className="flex gap-3 rounded-[24px] bg-zinc-50 p-4 border border-zinc-100">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-xs font-black text-white">{index + 1}</div>
              <div>
                <p className="text-sm font-black text-zinc-950">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-500">{step.body}</p>
              </div>
            </div>
          ))}
        </div>

        <button type="button" onClick={dismiss} className="mt-5 w-full rounded-[24px] bg-zinc-950 py-4 text-sm font-black text-white shadow-lg">
          Bắt đầu thao tác
        </button>
      </div>
    </div>
  );
}
