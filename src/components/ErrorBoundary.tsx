import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('ScanGo render error', error, info.componentStack);
    }
  }

  private resetApp = () => {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith('scango:'))
      .forEach((key) => window.localStorage.removeItem(key));
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-dvh bg-slate-50 px-6 py-16 flex items-center justify-center">
        <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/60">
          <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
            <AlertTriangle aria-hidden="true" className="size-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-950">ScanGo cần khởi động lại</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Dữ liệu lưu trên trình duyệt có thể không còn tương thích. Khôi phục bản mẫu để tiếp tục.
          </p>
          <button
            type="button"
            onClick={this.resetApp}
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Khôi phục dữ liệu mẫu
          </button>
        </section>
      </main>
    );
  }
}
