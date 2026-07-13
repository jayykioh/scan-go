import React, { useState } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { TableConfig } from '../../types';
import { Plus, Trash2, Printer, CheckCircle, SmartphoneNfc, XCircle } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { createPortal } from 'react-dom';

export default function TablesPage() {
  const [tables, setTables] = usePersistentState<TableConfig[]>('scango:tables:v1', []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tableName, setTableName] = useState('');
  
  const toast = useToast();

  const handleAddTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableName.trim()) return;
    
    const newTable: TableConfig = {
      id: `table_${Date.now()}`,
      name: tableName.trim()
    };
    
    setTables(prev => [...prev, newTable]);
    setTableName('');
    setIsModalOpen(false);
    toast.success(`Đã thêm ${newTable.name}`);
  };

  const handleDeleteTable = (id: string, name: string) => {
    if (window.confirm(`Bạn có chắc muốn xóa ${name}?`)) {
      setTables(prev => prev.filter(t => t.id !== id));
      toast.success(`Đã xóa ${name}`);
    }
  };

  const handlePrintQR = (name: string) => {
    toast.info(`Đang in mã QR cho ${name}...`);
    // In a real app, this would open a print dialog or generate a PDF.
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full animate-fadeIn">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-zinc-900 uppercase">Quản lý Bàn</h1>
          <p className="text-zinc-500 font-medium mt-1">Thiết lập sơ đồ bàn, in mã QR và quản lý thẻ NFC.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
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
                onClick={() => handleDeleteTable(table.id, table.name)}
                className="text-zinc-300 hover:text-red-500 transition-colors"
                title="Xóa bàn"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 bg-zinc-50 flex-1 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-600">
                <CheckCircle className="w-4 h-4" /> <span>NFC đã cấp phát</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-500">
                <SmartphoneNfc className="w-4 h-4" /> <span>Hỗ trợ Tap-to-Order</span>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-200">
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
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex justify-center items-start pt-20 bg-zinc-950/40 backdrop-blur-sm">
          <div className="bg-white border-hard shadow-hard w-full max-w-sm animate-fadeIn">
            <div className="p-6 border-b border-hard flex justify-between items-center bg-zinc-50">
              <h3 className="text-lg font-bold uppercase tracking-tight">Thêm Bàn Mới</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-zinc-900">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleAddTable} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Tên Bàn</label>
                <input 
                  type="text" required autoFocus
                  placeholder="Vd: Bàn 01, VIP 2..."
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  className="w-full px-4 py-3 border-hard focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
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
    </div>
  );
