import { useEffect, useTransition } from 'react';
import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';
import { AlertTriangle, RotateCcw, RefreshCw, Home } from 'lucide-react';
import { captureMonitoringError } from '../services/monitoring';
import { isChunkLoadError } from '../utils/chunkError';

export default function RouteErrorBoundary() {
  const error = useRouteError();
  const [, startTransition] = useTransition();

  const isChunkError = isChunkLoadError(error);
  const is404 = isRouteErrorResponse(error) && error.status === 404;

  useEffect(() => {
    if (isChunkError) {
      const storageKey = 'scango:chunk-retry:route-boundary';
      const lastRetry = sessionStorage.getItem(storageKey);
      if (!lastRetry) {
        sessionStorage.setItem(storageKey, Date.now().toString());
        window.location.reload();
        return;
      }
    }

    if (!is404) {
      captureMonitoringError(error, { source: 'RouteErrorBoundary' });
      if (import.meta.env.DEV) {
        console.error('ScanGo route error:', error);
      }
    }
  }, [error, isChunkError, is404]);

  const handleReload = () => {
    startTransition(() => {
      window.location.reload();
    });
  };

  const handleResetData = () => {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith('scango:'))
      .forEach((key) => window.localStorage.removeItem(key));
    window.location.href = '/';
  };

  // 1. Chunk load error / New deployment update state
  if (isChunkError) {
    return (
      <main className="min-h-dvh bg-zinc-50 px-6 py-16 flex items-center justify-center">
        <section className="w-full max-w-md rounded-2xl border-2 border-zinc-900 bg-white p-8 text-center shadow-[4px_4px_0px_0px_rgba(24,24,27,1)]">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-xl bg-orange-100 text-orange-600 border-2 border-zinc-900">
            <RefreshCw aria-hidden="true" className="size-7 animate-spin" />
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight text-zinc-950 font-mono">
            Đang cập nhật phiên bản mới
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Hệ thống phát hiện phiên bản mới của ScanGo trên máy chủ. Vui lòng làm mới trang để tải các tài nguyên mới nhất.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleReload}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold uppercase tracking-wider text-white border-2 border-zinc-900 shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] hover:bg-orange-500 active:translate-x-0.5 active:translate-y-0.5"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              Tải lại trang ngay
            </button>
            <Link
              to="/"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 px-4 py-3 text-sm font-bold text-zinc-800 border-2 border-zinc-900 hover:bg-zinc-200"
            >
              <Home aria-hidden="true" className="size-4" />
              Về trang chủ
            </Link>
          </div>
        </section>
      </main>
    );
  }

  // 2. 404 Route Not Found
  if (is404) {
    return (
      <main className="min-h-dvh bg-zinc-50 px-6 py-16 flex items-center justify-center">
        <section className="w-full max-w-md rounded-2xl border-2 border-zinc-900 bg-white p-8 text-center shadow-[4px_4px_0px_0px_rgba(24,24,27,1)]">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-xl bg-zinc-100 text-zinc-900 border-2 border-zinc-900">
            <span className="font-mono text-2xl font-black">404</span>
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight text-zinc-950 font-mono">
            Không tìm thấy trang
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Đường dẫn bạn yêu cầu không tồn tại hoặc đã được thay đổi cấu trúc.
          </p>
          <div className="mt-6">
            <Link
              to="/"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold uppercase tracking-wider text-white border-2 border-zinc-900 hover:bg-zinc-800 shadow-[2px_2px_0px_0px_rgba(24,24,27,1)]"
            >
              <Home aria-hidden="true" className="size-4" />
              Quay lại trang chủ
            </Link>
          </div>
        </section>
      </main>
    );
  }

  // 3. General Application Error
  const errorMessage =
    error instanceof Error
      ? error.message
      : isRouteErrorResponse(error)
        ? `${error.status} ${error.statusText}`
        : 'Lỗi không xác định';

  return (
    <main className="min-h-dvh bg-zinc-50 px-6 py-16 flex items-center justify-center">
      <section className="w-full max-w-md rounded-2xl border-2 border-zinc-900 bg-white p-8 text-center shadow-[4px_4px_0px_0px_rgba(24,24,27,1)]">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-xl bg-amber-100 text-amber-700 border-2 border-zinc-900">
          <AlertTriangle aria-hidden="true" className="size-7" />
        </div>
        <h1 className="text-xl font-bold uppercase tracking-tight text-zinc-950 font-mono">
          Đã xảy ra sự cố ứng dụng
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Ứng dụng gặp sự cố khi tải trang này. Bạn có thể làm mới trang hoặc khôi phục dữ liệu bộ nhớ đệm.
        </p>

        {import.meta.env.DEV && (
          <div className="mt-4 max-h-32 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-left font-mono text-xs text-red-600">
            {errorMessage}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleReload}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold uppercase tracking-wider text-white border-2 border-zinc-900 shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] hover:bg-zinc-800 active:translate-x-0.5 active:translate-y-0.5"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Tải lại trang
          </button>
          <button
            type="button"
            onClick={handleResetData}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-700 border-2 border-zinc-300 hover:bg-zinc-50"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Khôi phục dữ liệu mẫu
          </button>
        </div>
      </section>
    </main>
  );
}
