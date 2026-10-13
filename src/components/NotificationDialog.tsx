import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { createPortal } from 'react-dom';
import { Bell, X } from 'lucide-react';

interface NotificationDialogItem {
  name: string;
  quantity: number;
  selectedModifiers?: string[];
}

interface NotificationDialogProps {
  open: boolean;
  /** Alert heading, for example "Đơn mới" or "Món đã sẵn sàng". */
  title: string;
  /** Table the Order belongs to, already in display form ("Bàn 1"). */
  tableName: string;
  /** Lines of the Order, read from the queue the view already holds. */
  items?: NotificationDialogItem[];
  onClose: () => void;
}

/** A swipe further than this, or faster than this, dismisses the alert. */
const SWIPE_DISTANCE = -60;
const SWIPE_VELOCITY = -300;

/**
 * Centred alert for one server-written notification effect (REQ-NOT-001).
 * Rendered at the document body: the card is `position: fixed`, so it must
 * never depend on an ancestor's transform (see the fadeIn note in index.css).
 * The backdrop is transparent to clicks on purpose, so Kitchen keeps working
 * while the alert is on screen; the close control and an upward swipe dismiss
 * it early.
 */
export default function NotificationDialog({
  open,
  title,
  tableName,
  items = [],
  onClose,
}: NotificationDialogProps) {
  // Only the header starts a drag: the item list must keep its own touch
  // scrolling, and the controls must stay tappable (REQ-NOT-001).
  const dragControls = useDragControls();

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-950/25 p-6"
        >
          <motion.div
            role="alert"
            initial={{ opacity: 0, scale: 0.85, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 12 }}
            transition={{ type: 'spring', stiffness: 480, damping: 20 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.5, bottom: 0.05 }}
            onDragEnd={(_, info) => {
              if (
                info.offset.y < SWIPE_DISTANCE ||
                info.velocity.y < SWIPE_VELOCITY
              ) {
                onClose();
              }
            }}
            className="pointer-events-auto relative w-full max-w-sm rounded-[28px] border border-amber-200 bg-white p-6 text-center shadow-2xl"
          >
            <div
              onPointerDown={(event) => dragControls.start(event)}
              className="cursor-grab touch-none active:cursor-grabbing"
            >
              <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-zinc-200" />
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng thông báo"
                className="absolute right-4 top-4 rounded-full p-1.5 text-[#8E8E93] transition-colors hover:text-zinc-900"
              >
                <X className="h-4 w-4" />
              </button>
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
                <Bell className="h-7 w-7 text-amber-600" />
              </span>
              <p className="mt-3 text-xl font-black tracking-tight text-[#2D2B30]">
                {title}
              </p>
              <p className="mt-1 text-2xl font-black tracking-tight text-amber-600">
                {tableName}
              </p>
            </div>

            {items.length > 0 && (
              <div className="mt-4 max-h-48 space-y-1.5 overflow-y-auto rounded-[20px] bg-[#F5F5F7] p-3 text-left">
                {items.map((item, index) => (
                  <div key={`${item.name}-${index}`}>
                    <p className="flex justify-between gap-3 text-sm font-semibold text-[#2D2B30]">
                      <span className="min-w-0">{item.name}</span>
                      <span className="shrink-0 font-black">
                        x{item.quantity}
                      </span>
                    </p>
                    {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                      <p className="text-[11px] text-[#8E8E93]">
                        {item.selectedModifiers.join(' • ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-[21px] bg-zinc-950 py-3 text-xs font-bold text-white transition-colors hover:bg-zinc-900"
            >
              Đóng
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
