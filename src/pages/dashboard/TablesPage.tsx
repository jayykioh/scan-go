import React, { useState } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { TableConfig } from '../../types';
import { Plus, Trash2, Printer, CheckCircle, SmartphoneNfc, XCircle, Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { createPortal } from 'react-dom';
import GuideModal from '../../components/GuideModal';

export default function TablesPage() {
  const [tables, setTables] = usePersistentState<TableConfig[]>('scango:tables:v1', []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<TableConfig | null>(null);
  const [deletingTable, setDeletingTable] = useState<TableConfig | null>(null);
  
  const toast = useToast();

  const menuPath = (id: string) => `/menu/${encodeURIComponent(id)}`;
  const menuUrl = (id: string) => `${window.location.origin}${menuPath(id)}`;

  const createTablePayload = (id: string, secret = `sec_${Date.now().toString(36)}`) => ({
    tableSecret: secret,
    qrPayload: menuPath(id),
    nfcWritten: true,
  });

  const handleOpenAdd = () => {
    const id = `table_${Date.now()}`;
    setEditingTable({ id, name: '', ...createTablePayload(id) });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (table: TableConfig) => {
    setEditingTable({ ...table, ...(!table.tableSecret ? createTablePayload(table.id) : {}) });
    setIsModalOpen(true);
  };

  const handleSaveTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTable?.name.trim()) return;
    
    const normalized: TableConfig = {
      ...editingTable,
      name: editingTable.name.trim(),
      ...(!editingTable.tableSecret ? createTablePayload(editingTable.id) : {}),
    };
    const exists = tables.some(table => table.id === normalized.id);
    setTables(prev => exists
      ? prev.map(table => table.id === normalized.id ? normalized : table)
      : [...prev, normalized]
    );
    setEditingTable(null);
    setIsModalOpen(false);
    toast.success(exists ? `Đã cập nhật ${normalized.name}` : `Đã thêm ${normalized.name}`);
  };

  const handleDeleteTable = () => {
    if (!deletingTable) return;
    if (tables.length <= 1) {
      toast.error('Cần giữ lại ít nhất một bàn để simulator hoạt động');
      setDeletingTable(null);
      return;
    }
    setTables(prev => prev.filter(t => t.id !== deletingTable.id));
    toast.success(`Đã xóa ${deletingTable.name}`);
    setDeletingTable(null);
  };

  const handleRegenerateSecret = (table: TableConfig) => {
    const payload = createTablePayload(table.id, `sec_${Date.now().toString(36)}`);
    setTables(prev => prev.map(t => t.id === table.id ? { ...t, ...payload } : t));
    toast.success(`Đã cấp lại QR/NFC cho ${table.name}`);
  };

  const handlePrintQR = (name: string) => {
    toast.info(`Đang in mã QR cho ${name}...`);
    // In a real app, this would open a print dialog or generate a PDF.
  };

  const handleCopyLink = async (table: TableConfig) => {
    const url = menuUrl(table.id);
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Đã copy link menu ${table.name}`);
    } catch {
      toast.info(url);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full animate-fadeIn">
      <GuideModal
        storageKey="scango:guide:tables:v1"
        title="Tạo link menu cho từng bàn"
        steps={[
          { title: 'Tạo bàn', body: 'Mỗi bàn có một link menu riêng dạng /menu/:tableId để khách mở trực tiếp menu.' },
          { title: 'Copy hoặc mở thử link', body: 'Dùng nút Copy link để dán vào QR/NFC. Nút Mở menu giúp kiểm tra trải nghiệm khách.' },
          { title: 'Cấp lại mã khi cần', body: 'Khi nghi ngờ QR/NFC bị lộ, cấp lại mã mô phỏng để chuẩn bị cho production token flow.' },
        ]}
      />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-zinc-900 uppercase">Quản lý Bàn</h1>
          <p className="text-zinc-500 font-medium mt-1">Thiết lập sơ đồ bàn, in mã QR và quản lý thẻ NFC.</p>
        </div>
        <button 
          onClick={handleOpenAdd}
          className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 font-bold text-sm uppercase tracking-widest shadow-hard border-hard transition-transform active:translate-y-1 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" /> Thêm Bàn
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {tables.map(table => (
          <div key={table.id} className="bg-white border-hard shadow-[4px_4px_0_0_#e4e4e7] flex flex-col hover:-translate-y-1 transition-transform group">
            <div className="p-5 border-b border-zinc-100 flex justify-between items-start">
              <div>
                <h3 className="font-bold text-xl text-zinc-900">{table.name}</h3>
                <span className="text-[10px] text-zinc-400 font-mono mt-1 block">ID: {table.id}</span>
              </div>
              <button 
                onClick={() => setDeletingTable(table)}
                className="text-zinc-300 hover:text-red-500 transition-colors"
                title="Xóa bàn"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 bg-zinc-50 flex-1 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-600">
                <CheckCircle className="w-4 h-4" /> <span>{table.nfcWritten === false ? 'NFC chưa nạp' : 'NFC đã cấp phát'}</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-500">
                <SmartphoneNfc className="w-4 h-4" /> <span>Hỗ trợ Tap-to-Order</span>
              </div>
              <code className="block text-[10px] text-zinc-500 bg-white border border-zinc-200 p-2 break-all">{menuUrl(table.id)}</code>
            </div>

            <div className="p-4 border-t border-zinc-200 grid grid-cols-1 gap-2">
              <button 
                onClick={() => handleOpenEdit(table)}
                className="w-full py-2.5 bg-white hover:bg-zinc-50 text-zinc-900 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors border border-zinc-900 shadow-sm"
              >
                Sửa bàn
              </button>
              <button 
                onClick={() => handleRegenerateSecret(table)}
                className="w-full py-2.5 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors border border-orange-200 shadow-sm"
              >
                <RefreshCw className="w-4 h-4" /> Cấp lại mã
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => handleCopyLink(table)}
                  className="w-full py-2.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-900 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors border border-zinc-200 shadow-sm"
                >
                  <Copy className="w-4 h-4" /> Copy
                </button>
                <a 
                  href={menuPath(table.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors border border-emerald-200 shadow-sm"
                >
                  <ExternalLink className="w-4 h-4" /> Mở
                </a>
              </div>
              <button 
                onClick={() => handlePrintQR(table.name)}
                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors border border-zinc-800 shadow-sm"
              >
                <Printer className="w-4 h-4" /> In mã QR
              </button>
            </div>
          </div>
        ))}
        
        {tables.length === 0 && (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-zinc-500 border-2 border-dashed border-zinc-200 bg-zinc-50">
            <div className="w-16 h-16 mb-4 bg-zinc-200 rounded-full flex items-center justify-center">
              <Plus className="w-8 h-8 text-zinc-400" />
            </div>
            <p className="font-medium">Chưa có bàn nào được thiết lập.</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && editingTable && createPortal(
        <div className="fixed inset-0 z-[100] flex justify-center items-start pt-20 bg-zinc-950/40 backdrop-blur-sm">
          <div className="bg-white border-hard shadow-hard w-full max-w-sm animate-fadeIn">
            <div className="p-6 border-b border-hard flex justify-between items-center bg-zinc-50">
              <h3 className="text-lg font-bold uppercase tracking-tight">{tables.some(t => t.id === editingTable.id) ? 'Sửa bàn' : 'Thêm bàn mới'}</h3>
              <button onClick={() => { setIsModalOpen(false); setEditingTable(null); }} className="text-zinc-400 hover:text-zinc-900">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSaveTable} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Tên Bàn</label>
                <input 
                  type="text" required autoFocus
                  placeholder="Vd: Bàn 01, VIP 2..."
                  value={editingTable.name}
                  onChange={(e) => setEditingTable({ ...editingTable, name: e.target.value })}
                  className="w-full px-4 py-3 border-hard focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <label className="flex items-center gap-3 p-4 border-hard cursor-pointer hover:bg-zinc-50">
                <input type="checkbox" checked={editingTable.nfcWritten !== false} onChange={(e) => setEditingTable({ ...editingTable, nfcWritten: e.target.checked })} className="accent-orange-600" />
                <span className="font-bold text-xs uppercase tracking-widest">NFC đã nạp URL</span>
              </label>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">QR payload</label>
                <input type="text" value={editingTable.qrPayload || ''} onChange={(e) => setEditingTable({ ...editingTable, qrPayload: e.target.value })} className="w-full px-4 py-3 border-hard focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-xs" />
              </div>

              <button 
                type="submit"
                className="w-full bg-zinc-900 hover:bg-zinc-800 text-white py-3 font-bold uppercase tracking-widest text-sm shadow-hard transition-transform active:translate-y-1"
              >
                Lưu
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}
      {deletingTable && createPortal(
        <div className="fixed inset-0 z-[100] flex justify-center items-center p-4 bg-zinc-950/40 backdrop-blur-sm">
          <div className="bg-white border-hard shadow-[8px_8px_0_0_#ef4444] w-full max-w-sm p-6 text-center space-y-5 animate-fadeIn">
            <XCircle className="w-12 h-12 text-red-600 mx-auto" />
            <div>
              <h3 className="text-xl font-bold uppercase tracking-tight text-zinc-900">Xóa bàn?</h3>
              <p className="text-sm text-zinc-500 mt-2">Xóa <span className="font-bold text-zinc-900">{deletingTable.name}</span> và QR/NFC mô phỏng của bàn này.</p>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeletingTable(null)} className="flex-1 px-4 py-3 border-hard font-bold text-xs uppercase tracking-widest">Hủy</button>
              <button type="button" onClick={handleDeleteTable} className="flex-1 px-4 py-3 bg-red-600 text-white border-hard font-bold text-xs uppercase tracking-widest">Xóa</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );

}
