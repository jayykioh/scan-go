import React, { useState } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { MenuItem } from '../../types';
import { Plus, Search, Edit2, Trash2, Image as ImageIcon, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { createPortal } from 'react-dom';
import GuideModal from '../../components/GuideModal';

const defaultCategories = ['Món chính', 'Đồ uống', 'Tráng miệng', 'Ăn vặt'];

export default function MenuPage() {
  const [menuItems, setMenuItems] = usePersistentState<MenuItem[]>('scango:menu:v1', []);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<MenuItem | null>(null);
  const [newToppingName, setNewToppingName] = useState('');
  const [newToppingPrice, setNewToppingPrice] = useState(0);
  
  const toast = useToast();

  const handleOpenModal = (item?: MenuItem) => {
    if (item) {
      setEditingItem(item);
    } else {
      setEditingItem({
        id: `item_${Date.now()}`,
        name: '',
        price: 0,
        costPrice: 0,
        category: defaultCategories[0],
        type: 'Đồ ăn',
        image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
        description: '',
        inStock: true,
        stockCount: 999,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setNewToppingName('');
    setNewToppingPrice(0);
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    
    if (menuItems.some(i => i.id === editingItem.id)) {
      setMenuItems(prev => prev.map(i => i.id === editingItem.id ? editingItem : i));
      toast.success('Đã cập nhật món ăn');
    } else {
      setMenuItems(prev => [...prev, editingItem]);
      toast.success('Đã thêm món mới');
    }
    handleCloseModal();
  };

  const handleDeleteItem = () => {
    if (!deletingItem) return;
    setMenuItems(prev => prev.filter(i => i.id !== deletingItem.id));
    toast.success('Đã xóa món ăn');
    setDeletingItem(null);
  };

  const handleAddTopping = () => {
    if (!editingItem || !newToppingName.trim()) return;
    setEditingItem({
      ...editingItem,
      toppings: [...(editingItem.toppings || []), { name: newToppingName.trim(), price: Math.max(0, newToppingPrice) }]
    });
    setNewToppingName('');
    setNewToppingPrice(0);
  };

  const toggleStock = (id: string) => {
    setMenuItems(prev => prev.map(i => {
      if (i.id === id) {
        const newStock = !i.inStock;
        if (newStock) toast.success(`Đã mở bán: ${i.name}`);
        else toast.info(`Đã tạm ngưng: ${i.name}`);
        return { ...i, inStock: newStock };
      }
      return i;
    }));
  };

  const categories = ['all', ...Array.from(new Set(menuItems.map(i => i.category)))];
  
  const filteredItems = menuItems.filter(item => {
    const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
    const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full animate-fadeIn">
      <GuideModal
        storageKey="scango:guide:menu:v1"
        title="Tạo menu sẵn sàng cho khách"
        steps={[
          { title: 'Thêm món chính trước', body: 'Nhập tên, giá bán, giá vốn và ảnh. Mỗi món sẽ xuất hiện ngay trên link menu công khai.' },
          { title: 'Chia loại rõ ràng', body: 'Dùng danh mục và loại món để khách lọc nhanh: đồ ăn, đồ uống, tráng miệng hoặc ăn vặt.' },
          { title: 'Thêm topping nếu cần', body: 'Topping trong form sẽ hiển thị như lựa chọn thêm ở app khách hàng.' },
        ]}
      />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-zinc-900 uppercase">Quản lý Thực đơn</h1>
          <p className="text-zinc-500 font-medium mt-1">Cấu hình danh mục, món ăn và tùy chọn (Modifier).</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 font-bold text-sm uppercase tracking-widest shadow-hard border-hard transition-transform active:translate-y-1 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" /> Thêm Món
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
          <input 
            type="text" 
            placeholder="Tìm kiếm món ăn..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border-hard bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-3 border-hard whitespace-nowrap font-bold text-xs uppercase tracking-widest transition-colors ${
                selectedCategory === cat ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {cat === 'all' ? 'Tất cả' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredItems.map(item => (
          <div key={item.id} className={`bg-white border-hard flex flex-col group ${!item.inStock ? 'opacity-60 grayscale' : ''}`}>
            <div className="relative h-48 bg-zinc-100 overflow-hidden border-b border-hard">
              {item.image ? (
                <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-400">
                  <ImageIcon className="w-10 h-10" />
                </div>
              )}
              <div className="absolute top-3 right-3 flex gap-2">
                <button 
                  onClick={() => handleOpenModal(item)}
                  className="w-8 h-8 bg-white border border-hard flex items-center justify-center text-zinc-600 hover:text-zinc-900 shadow-sm"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setDeletingItem(item)}
                  className="w-8 h-8 bg-white border border-hard flex items-center justify-center text-red-500 hover:bg-red-50 shadow-sm"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="p-4 flex flex-col flex-1">
              <div className="text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-1">{item.category}</div>
              <h3 className="font-bold text-zinc-900 leading-tight mb-2 flex-1">{item.name}</h3>
              
              <div className="flex items-center justify-between mt-auto pt-4 border-t border-dashed border-zinc-200">
                <span className="font-mono font-bold">{item.price.toLocaleString('vi-VN')}đ</span>
                <button 
                  onClick={() => toggleStock(item.id)}
                  className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-2 py-1 border ${
                    item.inStock ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200' : 'bg-red-50 text-red-700 border-red-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                  }`}
                >
                  {item.inStock ? (
                    <><CheckCircle className="w-3 h-3" /> Còn</>
                  ) : (
                    <><XCircle className="w-3 h-3" /> Hết</>
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}

        {filteredItems.length === 0 && (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-zinc-500 border-2 border-dashed border-zinc-200">
            <ImageIcon className="w-12 h-12 mb-4 text-zinc-300" />
            <p className="font-medium">Chưa có món ăn nào.</p>
          </div>
        )}
      </div>

      {/* Modal created via Portal */}
      {isModalOpen && editingItem && createPortal(
        <div className="fixed inset-0 z-[100] flex justify-center items-start pt-10 sm:pt-20 bg-zinc-950/40 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white border-hard shadow-hard w-full max-w-lg mb-20 animate-fadeIn relative">
            <div className="p-6 border-b border-hard flex justify-between items-center bg-zinc-50">
              <h3 className="text-xl font-bold uppercase tracking-tight">
                {menuItems.some(i => i.id === editingItem.id) ? 'Sửa món ăn' : 'Thêm món ăn mới'}
              </h3>
              <button onClick={handleCloseModal} className="text-zinc-400 hover:text-zinc-900">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSaveItem} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Tên món</label>
                <input 
                  type="text" required
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({...editingItem, name: e.target.value})}
                  className="w-full px-4 py-3 border-hard focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              
               <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Giá bán (VNĐ)</label>
                  <input 
                    type="number" required min="0" step="1000"
                    value={editingItem.price}
                    onChange={(e) => setEditingItem({...editingItem, price: Number(e.target.value)})}
                    className="w-full px-4 py-3 border-hard focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Giá vốn (VNĐ)</label>
                  <input 
                    type="number" required min="0" step="1000"
                    value={editingItem.costPrice}
                    onChange={(e) => setEditingItem({...editingItem, costPrice: Number(e.target.value)})}
                    className="w-full px-4 py-3 border-hard focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Danh mục</label>
                  <input 
                    type="text" required list="categories"
                    value={editingItem.category}
                    onChange={(e) => setEditingItem({...editingItem, category: e.target.value})}
                    className="w-full px-4 py-3 border-hard focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <datalist id="categories">
                    {defaultCategories.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Loại món</label>
                  <select
                    value={editingItem.type || 'Đồ ăn'}
                    onChange={(e) => setEditingItem({...editingItem, type: e.target.value})}
                    className="w-full px-4 py-3 border-hard focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                  >
                    <option value="Đồ ăn">Đồ ăn</option>
                    <option value="Đồ uống">Đồ uống</option>
                    <option value="Tráng miệng">Tráng miệng</option>
                    <option value="Ăn vặt">Ăn vặt</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Tồn món</label>
                  <input 
                    type="number" required min="0"
                    value={editingItem.stockCount}
                    onChange={(e) => {
                      const stockCount = Number(e.target.value);
                      setEditingItem({...editingItem, stockCount, inStock: stockCount > 0});
                    }}
                    className="w-full px-4 py-3 border-hard focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  />
                </div>
                <label className="flex items-center gap-3 p-4 border-hard cursor-pointer hover:bg-zinc-50 self-end">
                  <input type="checkbox" checked={editingItem.inStock} onChange={(e) => setEditingItem({...editingItem, inStock: e.target.checked, stockCount: e.target.checked && editingItem.stockCount === 0 ? 50 : editingItem.stockCount})} className="accent-orange-600" />
                  <span className="font-bold text-xs uppercase tracking-widest">Đang bán</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Link Ảnh (URL)</label>
                <input 
                  type="url"
                  value={editingItem.image}
                  onChange={(e) => setEditingItem({...editingItem, image: e.target.value})}
                  className="w-full px-4 py-3 border-hard focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Mô tả</label>
                <textarea 
                  rows={3}
                  value={editingItem.description}
                  onChange={(e) => setEditingItem({...editingItem, description: e.target.value})}
                  className="w-full px-4 py-3 border-hard focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
              </div>

              <div className="space-y-3 pt-4 border-t border-hard">
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500">Topping / modifier riêng</label>
                {(editingItem.toppings || []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {(editingItem.toppings || []).map((topping, index) => (
                      <span key={`${topping.name}-${index}`} className="inline-flex items-center gap-2 bg-zinc-50 border-hard px-3 py-1 text-xs font-bold">
                        {topping.name} +{topping.price.toLocaleString('vi-VN')}đ
                        <button type="button" onClick={() => setEditingItem({...editingItem, toppings: (editingItem.toppings || []).filter((_, i) => i !== index)})} className="text-red-500 hover:text-red-700">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-[1fr_120px_auto] gap-2">
                  <input type="text" value={newToppingName} onChange={(e) => setNewToppingName(e.target.value)} placeholder="Tên topping" className="w-full px-4 py-3 border-hard focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  <input type="number" min={0} step={1000} value={newToppingPrice} onChange={(e) => setNewToppingPrice(Number(e.target.value))} placeholder="Giá" className="w-full px-4 py-3 border-hard focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono" />
                  <button type="button" onClick={handleAddTopping} className="px-4 py-3 bg-zinc-900 text-white font-bold text-xs uppercase tracking-widest border-hard">Thêm</button>
                </div>
              </div>

              <div className="pt-4 border-t border-hard flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={handleCloseModal}
                  className="px-6 py-3 font-bold text-zinc-500 hover:bg-zinc-100 uppercase tracking-widest text-sm transition-colors"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  className="bg-zinc-900 hover:bg-zinc-800 text-white px-8 py-3 font-bold uppercase tracking-widest text-sm shadow-hard transition-transform active:translate-y-1"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {deletingItem && createPortal(
        <div className="fixed inset-0 z-[100] flex justify-center items-center p-4 bg-zinc-950/40 backdrop-blur-sm">
          <div className="bg-white border-hard shadow-[8px_8px_0_0_#ef4444] w-full max-w-sm p-6 text-center space-y-5 animate-fadeIn">
            <XCircle className="w-12 h-12 text-red-600 mx-auto" />
            <div>
              <h3 className="text-xl font-bold uppercase tracking-tight text-zinc-900">Xóa món?</h3>
              <p className="text-sm text-zinc-500 mt-2">Xóa <span className="font-bold text-zinc-900">{deletingItem.name}</span> khỏi thực đơn.</p>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeletingItem(null)} className="flex-1 px-4 py-3 border-hard font-bold text-xs uppercase tracking-widest">Hủy</button>
              <button type="button" onClick={handleDeleteItem} className="flex-1 px-4 py-3 bg-red-600 text-white border-hard font-bold text-xs uppercase tracking-widest">Xóa</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
