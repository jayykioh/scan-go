import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TenantConfig, TableConfig, Order, MenuItem, LoyaltyMember } from '../types';
import { 
  Sparkles, 
  TrendingUp, 
  Package, 
  UtensilsCrossed,
  Clock,
  Cpu,
  RefreshCw,
  Gift,
  Shield,
  ChefHat,
  Receipt,
  Plus,
  Undo2,
  Search,
  Scale,
  Calculator,
  History,
  Trash2,
  AlertTriangle,
  UserPlus,
  Building2,
  ArrowRight,
  Check,
  Coffee,
  CreditCard
} from 'lucide-react';

interface SoloProps {
  tenantConfig: TenantConfig;
  setTenantConfig: React.Dispatch<React.SetStateAction<TenantConfig>>;
  tables: TableConfig[];
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  menuItems: MenuItem[];
  setMenuItems: React.Dispatch<React.SetStateAction<MenuItem[]>>;
  loyaltyMembers: LoyaltyMember[];
  setLoyaltyMembers: React.Dispatch<React.SetStateAction<LoyaltyMember[]>>;
  onboardCompleted: boolean;
  setOnboardCompleted: (val: boolean) => void;
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number; // in VND
  stockAmount: number; // in grams, ml, or units
}

interface RecipeItem {
  ingredientId: string;
  quantity: number; // quantity of ingredient used for this dish
}

interface DishRecipe {
  menuId: string;
  recipes: RecipeItem[];
}

export default function SoloOperatorView({
  tenantConfig,
  setTenantConfig,
  tables,
  orders,
  setOrders,
  menuItems,
  setMenuItems,
  loyaltyMembers,
  setLoyaltyMembers,
  onboardCompleted,
  setOnboardCompleted,
}: SoloProps) {
  // Navigation tabs simplified and organized exactly as requested for 40-50yo users:
  // Tab 1: "home" - Đơn hàng & Lịch sử revert, doanh thu hôm nay
  // Tab 2: "pantry" - Bật tắt món, Kho nguyên liệu, thêm nguyên liệu mới
  // Tab 3: "cogs" - Định lượng & Giá vốn (COGS), công thức/định vị
  // Tab 4: "gói" - Chọn hạng gói của app (Lite, Pro, Enterprise) & Tích điểm & Trợ lý phân tích AI
  const [activeTab, setActiveTab] = useState<'home' | 'pantry' | 'cogs' | 'gói'>('home');
  
  // Onboarding parameters for Solo
  const [tempShopName, setTempShopName] = useState(tenantConfig.shopName || 'Bún Phở Kinh Kỳ');
  const [tempIndustry, setTempIndustry] = useState<'quan_an' | 'quan_cafe' | 'nha_hang' | 'tiem_banh' | 'tra_sua'>(tenantConfig.industry || 'quan_an');
  const [tempTier, setTempTier] = useState<'Lite' | 'Pro' | 'Enterprise'>(tenantConfig.pricingTier || 'Pro');
  const [tempPayMode, setTempPayMode] = useState<'Pay-First' | 'Pay-Later'>(tenantConfig.paymentMode || 'Pay-Later');
  const [onboardStep, setOnboardStep] = useState(1);

  const nextStep = () => {
    if (onboardStep < 4) {
      setOnboardStep(prev => prev + 1);
    } else {
      // Save temp selections into real config
      setTenantConfig(prev => ({
        ...prev,
        shopName: tempShopName,
        industry: tempIndustry,
        pricingTier: tempTier,
        paymentMode: tempPayMode,
        loyaltyEnabled: tempTier !== 'Lite',
        onboardingStep: 4,
      }));
      setOnboardCompleted(true);
    }
  };
  
  // Custom interactive Confirmation States (Bypass unsafe window.confirm)
  const [revertingOrderId, setRevertingOrderId] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [deletingIngId, setDeletingIngId] = useState<string | null>(null);

  // Search queries for screens
  const [searchRevertQuery, setSearchRevertQuery] = useState('');
  const [searchLoyaltyQuery, setSearchLoyaltyQuery] = useState('');
  
  // Create member state in Solo View
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [loyaltyMessage, setLoyaltyMessage] = useState<string | null>(null);

  // Notifications
  const [showSimNotification, setShowSimNotification] = useState<string | null>(null);
  const [aiTipRefreshes, setAiTipRefreshes] = useState(0);
  
  // Raw Ingredients Inventory state
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { id: 'ing1', name: 'Thịt bò tươi phi lê', unit: 'g', costPerUnit: 250, stockAmount: 5000 }, // 5.0kg
    { id: 'ing2', name: 'Bánh phở tươi dẻo', unit: 'g', costPerUnit: 22, stockAmount: 10000 },  // 10.0kg
    { id: 'ing3', name: 'Phở gà ta đồi thả vườn', unit: 'g', costPerUnit: 120, stockAmount: 3500 }, // 3.5kg
    { id: 'ing4', name: 'Bún tươi Kinh Bắc', unit: 'g', costPerUnit: 18, stockAmount: 8500 },    // 8.5kg
    { id: 'ing5', name: 'Thịt chả xiên mật mía', unit: 'xiên', costPerUnit: 8000, stockAmount: 12 }, // 12 xiên (low stock alert!)
    { id: 'ing6', name: 'Tôm nõn hấp', unit: 'g', costPerUnit: 180, stockAmount: 1200 },        // 1.2kg
    { id: 'ing7', name: 'Quẩy giòn giòn', unit: 'cái', costPerUnit: 1500, stockAmount: 6 },     // 6 cái (low stock!)
    { id: 'ing8', name: 'Lá dứa lạt tự nhiên', unit: 'g', costPerUnit: 108, stockAmount: 2500 },   // 2.5kg
  ]);

  // Dish Recipe Recipes matching MOCK_MENU_ITEMS
  const [dishRecipes, setDishRecipes] = useState<DishRecipe[]>([
    {
      menuId: 'qa1', // Phở Bò Tái Lăn Kinh Kỳ
      recipes: [
        { ingredientId: 'ing1', quantity: 90 },  // 90g * 250 = 22,500đ
        { ingredientId: 'ing2', quantity: 150 }, // 150g * 22 = 3,300đ
        { ingredientId: 'ing7', quantity: 1 }    // 1 cái * 1500 = 1,500đ
      ]
    },
    {
      menuId: 'qa2', // Phở Gà Thảo Mộc Sợi Nhỏ
      recipes: [
        { ingredientId: 'ing3', quantity: 120 }, // 120g * 120 = 14,400đ
        { ingredientId: 'ing2', quantity: 150 }, // 150g * 22 = 3,300đ
      ]
    },
    {
      menuId: 'qa3', // Bún Chả Tre Thạch Thất
      recipes: [
        { ingredientId: 'ing4', quantity: 160 }, // 160g * 18 = 2,880đ
        { ingredientId: 'ing5', quantity: 3 },   // 3 xiên * 8000 = 24,000đ
      ]
    },
    {
      menuId: 'qa4', // Nem Rán Tôm Lụa (4 chiếc)
      recipes: [
        { ingredientId: 'ing6', quantity: 80 },  // 80g * 180 = 14,400đ
      ]
    },
    {
      menuId: 'qa5', // Quẩy Khô Siêu Giòn
      recipes: [
        { ingredientId: 'ing7', quantity: 1 }    // 1 cái = 1,500đ
      ]
    },
    {
      menuId: 'qa6', // Trà Sâm Dứa Hương Lài
      recipes: [
        { ingredientId: 'ing8', quantity: 25 }   // 25g * 108 = 2,700đ
      ]
    }
  ]);

  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  
  // Quick Add new material states
  const [quickIngName, setQuickIngName] = useState('');
  const [quickIngUnit, setQuickIngUnit] = useState('g');
  const [quickIngCost, setQuickIngCost] = useState('100');
  const [quickIngQty, setQuickIngQty] = useState('2000');

  // Trigger popup toaster
  const triggerPulseText = (text: string) => {
    setShowSimNotification(text);
    setTimeout(() => {
      setShowSimNotification(null);
    }, 4500);
  };

  // Switch App Pricing Plan Tier
  const handleUpgradeTier = (tier: 'Lite' | 'Pro' | 'Enterprise') => {
    setTenantConfig(prev => ({
      ...prev,
      pricingTier: tier,
      loyaltyEnabled: tier !== 'Lite'
    }));
    triggerPulseText(`⚡ ĐÃ ĐỔI APP SANG GÓI: [ hạng ${tier.toUpperCase()} ]\n${
      tier === 'Lite' ? '• Giới hạn chức năng cơ bản' :
      tier === 'Pro' ? '• Mở khóa Tích điểm Khách hàng!' :
      '• Toàn năng: Tích điểm + Định lượng giá vốn vật tư!'
    }`);
  };

  // Toggle Shop payment Mode in Solo view
  const togglePaymentModeInSolo = () => {
    const nextMode = tenantConfig.paymentMode === 'Pay-First' ? 'Pay-Later' : 'Pay-First';
    setTenantConfig(prev => ({ ...prev, paymentMode: nextMode }));
    triggerPulseText(`⚙️ Đã chuyển chế độ thanh toán thành: ${nextMode === 'Pay-First' ? 'QR Trả Trước (Pay-First)' : '💵 Trả Sau (Pay-Later)'}`);
  };

  // DEDUCT RAW INGREDIENTS WHEN PREPARING (PENDING -> COOKING)
  const deductIngredientsForOrder = (order: Order) => {
    const changes: string[] = [];
    
    setIngredients(prev => {
      let isChanged = false;
      const updated = prev.map(ing => {
        let deductAmount = 0;
        
        order.items.forEach(orderItem => {
          const recipe = dishRecipes.find(r => r.menuId === orderItem.menuId);
          if (recipe) {
            const ingredientItem = recipe.recipes.find(ri => ri.ingredientId === ing.id);
            if (ingredientItem) {
              deductAmount += ingredientItem.quantity * orderItem.quantity;
            }
          }
        });

        if (deductAmount > 0) {
          isChanged = true;
          const currentStock = ing.stockAmount;
          const nextStock = Math.max(0, currentStock - deductAmount);
          
          const formatUnit = (val: number) => {
            if (ing.unit === 'g' || ing.unit === 'ml') {
              return `${(val / 1000).toFixed(2)}kg`;
            }
            return `${val} ${ing.unit}`;
          };

          changes.push(`${ing.name}: ${formatUnit(currentStock)} ➔ ${formatUnit(nextStock)}`);
          return { ...ing, stockAmount: nextStock };
        }
        return ing;
      });
      return isChanged ? updated : prev;
    });

    if (changes.length > 0) {
      triggerPulseText(`📦 Trừ kho vật liệu cho Bàn ${order.tableId}:\n${changes.join(', ')}`);
    }
  };

  // RE-ADD RAW INGREDIENTS WHEN CANCELLING AN ORDER
  const returnIngredientsForOrder = (order: Order) => {
    const changes: string[] = [];
    setIngredients(prev => {
      let isChanged = false;
      const updated = prev.map(ing => {
        let restoreAmount = 0;
        order.items.forEach(orderItem => {
          const recipe = dishRecipes.find(r => r.menuId === orderItem.menuId);
          if (recipe) {
            const ingredientItem = recipe.recipes.find(ri => ri.ingredientId === ing.id);
            if (ingredientItem) {
              restoreAmount += ingredientItem.quantity * orderItem.quantity;
            }
          }
        });

        if (restoreAmount > 0) {
          isChanged = true;
          const currentStock = ing.stockAmount;
          const nextStock = currentStock + restoreAmount;
          const formatUnit = (val: number) => {
            if (ing.unit === 'g' || ing.unit === 'ml') {
              return `${(val / 1000).toFixed(2)}kg`;
            }
            return `${val} ${ing.unit}`;
          };
          changes.push(`${ing.name} hoàn lại ${formatUnit(restoreAmount)}`);
          return { ...ing, stockAmount: nextStock };
        }
        return ing;
      });
      return isChanged ? updated : prev;
    });

    if (changes.length > 0) {
      triggerPulseText(`🔄 Khôi phục kho cho đơn hủy bớt:\n${changes.join(', ')}`);
    }
  };

  // Settle or Advance order states
  const handleAdvanceStatus = (orderId: string, currentStatus: string) => {
    const targetOrder = orders.find(o => o.id === orderId);
    if (!targetOrder) return;

    let nextStatus: 'cooking' | 'ready' | 'paid' = 'cooking';
    if (currentStatus === 'pending') {
      nextStatus = 'cooking';
      // Only deduct if Pro package selected (Portioning Engine)
      if (tenantConfig.pricingTier === 'Pro') {
        deductIngredientsForOrder(targetOrder);
      }
    } else if (currentStatus === 'cooking') {
      nextStatus = 'ready';
      triggerPulseText(`🔔 Bếp nấu xong Bàn ${targetOrder.tableId}. Hãy bưng ra phục vụ!`);
    } else if (currentStatus === 'ready') {
      nextStatus = 'paid';
      
      // Update customer loyalty points securely (If integrated - Lite/Pro required)
      if (tenantConfig.pricingTier !== 'Lite' && targetOrder.customerPhone) {
        const pointsToAward = Math.floor(targetOrder.total / 10000);
        setLoyaltyMembers(prev => prev.map(member => {
          if (member.phone === targetOrder.customerPhone) {
            const updated = {
              ...member,
              points: member.points + pointsToAward,
              totalSpent: member.totalSpent + targetOrder.total,
              visits: member.visits + 1
            };
            triggerPulseText(`🌟 Khách ${member.name} (+${pointsToAward}đ) tích lũy thành công! Tổng: ${updated.points} điểm`);
            return updated;
          }
          return member;
        }));
      } else {
        triggerPulseText(`💵 Thu tiền Bàn ${targetOrder.tableId} thành công: +${(targetOrder.total).toLocaleString()}đ`);
      }
    }

    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return { ...o, status: nextStatus };
      }
      return o;
    }));
  };

  // REVERT PAID ORDER WITH SECURE LOYALTY REVERSAL
  const handleRevertOrderAction = (orderId: string) => {
    const targetOrder = orders.find(o => o.id === orderId);
    if (!targetOrder) return;

    // Reverse Loyalty score if applicable
    if (tenantConfig.pricingTier !== 'Lite' && targetOrder.customerPhone) {
      const pointsDeducted = Math.floor(targetOrder.total / 10000);
      setLoyaltyMembers(prev => prev.map(member => {
        if (member.phone === targetOrder.customerPhone) {
          return {
            ...member,
            points: Math.max(0, member.points - pointsDeducted),
            totalSpent: Math.max(0, member.totalSpent - targetOrder.total),
            visits: Math.max(0, member.visits - 1)
          };
        }
        return member;
      }));
    }

    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return { ...o, status: 'ready' }; // return to preparing/ready table state
      }
      return o;
    }));

    setRevertingOrderId(null);
    triggerPulseText(`🔄 Đã hoán tác (Revert) thành công hóa đơn Bàn ${targetOrder.tableId} về hàng chờ phục vụ!`);
  };

  const handleCancelOrderAction = (orderId: string) => {
    const targetOrder = orders.find(o => o.id === orderId);
    if (!targetOrder) return;

    if (tenantConfig.pricingTier === 'Pro' && (targetOrder.status === 'cooking' || targetOrder.status === 'ready')) {
      returnIngredientsForOrder(targetOrder);
    }
    setOrders(prev => prev.filter(o => o.id !== orderId));
    setCancellingOrderId(null);
    triggerPulseText(`❌ Đã huỷ và dọn dẹp hóa đơn Bàn ${targetOrder.tableId}`);
  };

  // Calculate COGS values for each dish
  const calculateDishCost = (menuId: string): number => {
    const findRecipe = dishRecipes.find(r => r.menuId === menuId);
    if (!findRecipe) return 0;
    return findRecipe.recipes.reduce((sum, item) => {
      const ingredient = ingredients.find(i => i.id === item.ingredientId);
      if (!ingredient) return sum;
      return sum + (item.quantity * ingredient.costPerUnit);
    }, 0);
  };

  // Toggle Item Out of Stock quickly (Hide/Show on QR)
  const toggleItemStock = (itemId: string) => {
    setMenuItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const nextStock = !item.inStock;
        return {
          ...item,
          inStock: nextStock,
          stockCount: nextStock ? 50 : 0
        };
      }
      return item;
    }));
    
    const dish = menuItems.find(m => m.id === itemId);
    if (dish) {
      triggerPulseText(`${dish.name} ➔ ${!dish.inStock ? '🟢 ĐÃ MỞ BÁN' : '🚫 ĐÃ BÁO HẾT MÓN'}`);
    }
  };

  // Add custom Raw Material form
  const handleAddIngredientForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickIngName.trim()) return;

    const priceNum = parseFloat(quickIngCost);
    const qtyNum = parseFloat(quickIngQty);
    if (isNaN(priceNum) || priceNum < 0 || isNaN(qtyNum) || qtyNum < 0) return;

    const newId = `ing_${Date.now()}`;
    const newIngredient: Ingredient = {
      id: newId,
      name: quickIngName.trim(),
      unit: quickIngUnit,
      costPerUnit: priceNum,
      stockAmount: qtyNum
    };

    setIngredients(prev => [...prev, newIngredient]);
    setQuickIngName('');
    triggerPulseText(`🍎 Đã sắm thêm vật tư thô mới: ${newIngredient.name} (${newIngredient.stockAmount}${newIngredient.unit} • giá vốn ${newIngredient.costPerUnit}đ)`);
  };

  const handleDeleteIngredientAction = (id: string) => {
    const target = ingredients.find(i => i.id === id);
    if (target) {
      setIngredients(prev => prev.filter(i => i.id !== id));
      setDishRecipes(prev => prev.map(dr => ({
        ...dr,
        recipes: dr.recipes.filter(r => r.ingredientId !== id)
      })));
      triggerPulseText(`Đã dọn dẹp nguyên liệu thô: ${target.name}`);
    }
    setDeletingIngId(null);
  };

  // Update recipe ingredient value
  const handleUpdateRecipeFormula = (menuId: string, ingredientId: string, qty: number) => {
    setDishRecipes(prev => {
      const existing = prev.find(r => r.menuId === menuId);
      if (!existing) {
        return [...prev, { menuId, recipes: [{ ingredientId, quantity: qty }] }];
      }

      const hasIng = existing.recipes.some(r => r.ingredientId === ingredientId);
      let updatedRecipes = [];

      if (qty <= 0) {
        updatedRecipes = existing.recipes.filter(r => r.ingredientId !== ingredientId);
      } else if (hasIng) {
        updatedRecipes = existing.recipes.map(r => 
          r.ingredientId === ingredientId ? { ...r, quantity: qty } : r
        );
      } else {
        updatedRecipes = [...existing.recipes, { ingredientId, quantity: qty }];
      }

      return prev.map(dr => 
        dr.menuId === menuId ? { ...dr, recipes: updatedRecipes } : dr
      );
    });
  };

  // Add loyalty member inside Solo view
  const handleCreateMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberPhone.trim() || newMemberPhone.trim().length < 8) {
      setLoyaltyMessage('Số điện thoại không hợp lệ (nhập ít nhất 8 số).');
      return;
    }
    const alreadyExists = loyaltyMembers.some(m => m.phone === newMemberPhone.trim());
    if (alreadyExists) {
      setLoyaltyMessage('Số điện thoại này đã đăng ký trước đó!');
      return;
    }

    const nameToRegister = newMemberName.trim() || 'Khách Thân Thiết';
    const newMemberOnboard: LoyaltyMember = {
      phone: newMemberPhone.trim(),
      name: nameToRegister,
      points: 20, // 20 welcome points
      totalSpent: 0,
      visits: 1,
      isVerified: true
    };

    setLoyaltyMembers(prev => [...prev, newMemberOnboard]);
    setNewMemberPhone('');
    setNewMemberName('');
    setLoyaltyMessage(`🎉 Đăng ký thành công hội viên ${nameToRegister}! Đã tặng 20 điểm chào mừng.`);
    setTimeout(() => setLoyaltyMessage(null), 4000);
  };

  // Simulation table placer
  const handleSoloSimulateOrder = () => {
    const tableId = String(Math.floor(Math.random() * 6) + 1);
    const activeMenu = menuItems.filter(m => m.inStock);
    if (activeMenu.length === 0) {
      triggerPulseText(`⚠️ Quán đang tạm ngắt bán mọi món, vui lòng mở món trước khi đặt.`);
      return;
    }
    const randomItem = activeMenu[Math.floor(Math.random() * activeMenu.length)];

    const uniqueOrderId = `solo_sim_${Date.now()}`;
    // Assign a random member if registered, or default to generic phone
    const assignedPhone = loyaltyMembers.length > 0 && Math.random() > 0.4
      ? loyaltyMembers[Math.floor(Math.random() * loyaltyMembers.length)].phone
      : '0987654321';

    const newOrder: Order = {
      id: uniqueOrderId,
      tableId: tableId,
      items: [
        { id: `it_${Date.now()}`, menuId: randomItem.id, name: randomItem.name, price: randomItem.price, quantity: 1, selectedModifiers: [] }
      ],
      total: randomItem.price,
      status: 'pending', 
      timestamp: new Date(),
      customerPhone: assignedPhone,
      paymentMode: tenantConfig.paymentMode,
    };

    setOrders(prev => [newOrder, ...prev]);
    triggerPulseText(`🔔 Bàn ${tableId} vừa quét mã QR chọn món: ${randomItem.name}. Vui lòng xử lý!`);
  };

  const getTableName = (tableId: string) => {
    const tbl = tables.find(t => t.id === tableId);
    return tbl ? tbl.name : `Bàn ${tableId.padStart(2, '0')}`;
  };

  // Helper arrays for tabs
  const paidOrders = orders.filter(o => o.status === 'paid');
  const activeOrders = orders.filter(o => o.status !== 'paid');
  const totalPaidRevenue = paidOrders.reduce((sum, o) => sum + o.total, 0);

  // Completed paid orders search filtering (Resolves completed order search bug)
  const filteredCompletedOrders = paidOrders.filter(o => {
    const search = searchRevertQuery.toLowerCase();
    const table = getTableName(o.tableId).toLowerCase();
    const phone = (o.customerPhone || '').toLowerCase();
    const invoiceId = o.id.toLowerCase();
    return table.includes(search) || phone.includes(search) || invoiceId.includes(search);
  });

  const dishSalesDict: Record<string, { name: string, qty: number, revenue: number, menuId: string }> = {};
  orders.forEach(o => {
    o.items.forEach(it => {
      if (!dishSalesDict[it.menuId]) {
        dishSalesDict[it.menuId] = { name: it.name, qty: 0, revenue: 0, menuId: it.menuId };
      }
      dishSalesDict[it.menuId].qty += it.quantity;
      if (o.status === 'paid') {
        dishSalesDict[it.menuId].revenue += it.price * it.quantity;
      }
    });
  });

  const rawTopRev = Object.values(dishSalesDict).sort((a,b) => b.revenue - a.revenue);
  const topRevenueDishes = rawTopRev.length > 0 ? rawTopRev : [
    { menuId: 'qa1', name: 'Phở Bò Tái Lăn Kinh Kỳ', qty: 9, revenue: 585000 },
    { menuId: 'qa3', name: 'Bún Chả Tre Thạch Thất', qty: 5, revenue: 250000 },
    { menuId: 'qa6', name: 'Trà Sâm Dứa Hương Lài', qty: 15, revenue: 75000 }
  ];

  const calculatedMargins = menuItems.map(item => {
    const cogs = calculateDishCost(item.id);
    const profit = item.price - cogs;
    const pct = item.price > 0 ? (profit / item.price) * 105 : 0; 
    return {
      id: item.id,
      name: item.name,
      price: item.price,
      cogs: cogs,
      profit: profit,
      percent: Math.min(98, Math.round(pct || 65))
    };
  }).sort((a,b) => b.percent - a.percent);

  const slowMovingDishes = menuItems.map(item => {
    const matchedSales = dishSalesDict[item.id]?.qty || 0;
    return {
      id: item.id,
      name: item.name,
      salesQty: matchedSales || (item.id === 'qa4' ? 1 : item.id === 'qa2' ? 2 : 0) 
    };
  }).sort((a,b) => a.salesQty - b.salesQty);

  // Search filter for integrated loyalty panel
  const filteredLoyaltyMembers = loyaltyMembers.filter(m => {
    const s = searchLoyaltyQuery.toLowerCase().trim();
    return m.phone.includes(s) || (m.name ?? '').toLowerCase().includes(s);
  });

  if (!onboardCompleted) {
    return (
      <div className="flex-grow flex flex-col bg-white p-[34px] font-sans justify-between text-[#2D2B30] h-full" id="solo-onboarding">
        <div>
          <div className="w-[50px] h-[50px] rounded-[21px] bg-orange-50 border border-orange-200 flex items-center justify-center mb-[13px]">
            <Sparkles className="w-[24px] h-[24px] text-orange-600" />
          </div>
          <h2 className="text-[24px] font-bold text-[#2D2B30] tracking-tight leading-tight">
            Thiết lập quán
          </h2>
          <p className="text-sm text-[#808080] mt-1 text-pretty font-medium">
            Tối ưu hóa quy trình trong 15s.
          </p>

          <div className="flex gap-1.5 mt-[13px]">
            {[1, 2, 3, 4].map(idx => (
              <div 
                key={idx} 
                className={`h-1 rounded-[21px] flex-1 transition-all duration-350 ${
                  idx <= onboardStep ? 'bg-orange-600' : 'bg-[#E5E5EA]'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="my-[13px] flex-grow flex flex-col justify-center bg-white border border-[#B5C7D8] rounded-[21px] p-[13px] shadow-sm">
          {onboardStep === 1 && (
            <div className="space-y-[13px]">
              <span className="text-xs text-orange-600 font-bold ">B1: Thông tin quán</span>
              <h3 className="text-[16px] font-bold text-[#2D2B30]">Tên thương hiệu</h3>
              
              <div className="space-y-[4px]">
                <label className="block text-xs text-[#7E7E7E] font-semibold ">Tên thương hiệu</label>
                <input 
                  type="text" 
                  value={tempShopName} 
                  required
                  onChange={(e) => setTempShopName(e.target.value)}
                  className="w-full bg-[#F5F5F7] border border-[#B5C7D8] rounded-[21px] px-[13px] py-2.5 text-[14px] text-[#2D2B30] focus:outline-2 focus:outline-orange-500 focus:outline-offset-2 font-semibold shadow-inner"
                  placeholder="E.g. Phở Kinh Kỳ"
                />
              </div>

              <div className="space-y-[4px]">
                <label className="block text-xs text-[#7E7E7E] font-semibold mb-1.5">Mô hình phân loại</label>
                <div className="grid grid-cols-2 gap-[13px]">
                  <button 
                    onClick={() => { setTempIndustry('quan_an'); setTempShopName('Phở Truyền Thuyết Kinh Kỳ'); }}
                    className={`p-[13px] rounded-[21px] border text-center flex flex-col items-center gap-1.5 transition-all shadow-sm ${
                      tempIndustry === 'quan_an' 
                        ? 'bg-orange-600 text-white border-orange-600' 
                        : 'bg-white border-[#B5C7D8] text-[#2D2B30] hover:bg-[#F5F5F7]'
                    }`}
                  >
                    <UtensilsCrossed className="w-5 h-5" />
                    <span className="text-xs font-semibold ">Quán ăn / Phở</span>
                  </button>
                  <button 
                    onClick={() => { setTempIndustry('quan_cafe'); setTempShopName('Cà Phê Rang Muối Cổ Đô'); }}
                    className={`p-[13px] rounded-[21px] border text-center flex flex-col items-center gap-1.5 transition-all shadow-sm ${
                      tempIndustry === 'quan_cafe' 
                        ? 'bg-orange-600 text-white border-orange-600' 
                        : 'bg-white border-[#B5C7D8] text-[#2D2B30] hover:bg-[#F5F5F7]'
                    }`}
                  >
                    <Coffee className="w-5 h-5" />
                    <span className="text-xs font-semibold ">Cà phê / Trà sữa</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {onboardStep === 2 && (
            <div className="space-y-[13px]">
              <span className="text-xs text-orange-600 font-bold ">B2: Gói tính năng</span>
              <h3 className="text-[16px] font-bold text-[#2D2B30]">Chọn gói phù hợp</h3>
              
              <div className="space-y-[4px]">
                <button 
                  onClick={() => setTempTier('Pro')}
                  className={`w-full p-[13px] rounded-[21px] border text-left transition-all flex items-center justify-between shadow-xs ${
                    tempTier === 'Pro' ? 'bg-orange-50 text-[#2D2B30] border-orange-500' : 'bg-white text-gray-700 border-[#B5C7D8]'
                  }`}
                >
                  <div className="space-y-0.5 max-w-[80%]">
                    <div className="text-sm font-bold flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-orange-500" /> PRO AI
                    </div>
                    <p className="text-xs text-[#707070]">Tối ưu lợi nhuận, KDS realtime.</p>
                  </div>
                  <span className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-250 px-2 py-0.5 rounded-[21px] font-bold">MIỄN PHÍ</span>
                </button>
              </div>
            </div>
          )}

          {onboardStep === 3 && (
            <div className="space-y-[13px]">
              <span className="text-xs text-orange-600 font-bold ">B3: Thanh toán</span>
              <h3 className="text-[16px] font-bold text-[#2D2B30]">Quy trình thu ngân</h3>
              
              <div className="grid grid-cols-2 gap-[13px]">
                <button 
                  onClick={() => setTempPayMode('Pay-Later')}
                  className={`p-[13px] rounded-[21px] border text-center flex flex-col items-center gap-[4px] transition-all shadow-xs ${
                    tempPayMode === 'Pay-Later' ? 'bg-orange-50 text-[#2D2B30] border-orange-500' : 'bg-white border-[#B5C7D8] text-[#2D2B30]'
                  }`}
                >
                  <Receipt className="w-5 h-5 text-orange-600" />
                  <div className="text-xs font-bold leading-tight">Trả sau<br/><span className="text-[8px] font-medium">(Ăn xong thanh toán)</span></div>
                </button>
                <button 
                  onClick={() => setTempPayMode('Pay-First')}
                  className={`p-[13px] rounded-[21px] border text-center flex flex-col items-center gap-[4px] transition-all shadow-xs ${
                    tempPayMode === 'Pay-First' ? 'bg-orange-50 text-[#2D2B30] border-orange-500' : 'bg-white border-[#B5C7D8] text-[#2D2B30]'
                  }`}
                >
                  <CreditCard className="w-5 h-5 text-orange-600" />
                  <div className="text-xs font-bold leading-tight">Trả trước<br/><span className="text-[8px] font-medium">(Thanh toán tại quầy)</span></div>
                </button>
              </div>
            </div>
          )}

          {onboardStep === 4 && (
            <div className="space-y-[13px] text-[#2D2B30]">
              <div className="w-[40px] h-[40px] rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-2">
                <Check className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="text-[16px] font-bold text-[#2D2B30] text-center">Hoàn tất!</h3>
              <p className="text-sm text-[#707070] text-center">
                Workspace đã thiết lập xong. Bạn có thể sử dụng QR, KDS và AI ngay lập tức.
              </p>
            </div>
          )}
        </div>

        <button 
          onClick={nextStep}
          className="w-full bg-orange-600 hover:bg-orange-500 active:translate-y-0.5 text-white py-3.5 rounded-[21px] font-semibold text-[14px] flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
        >
          {onboardStep === 4 ? 'Kích Hoạt' : 'Tiếp theo'}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex-grow flex flex-col bg-zinc-50 font-sans text-zinc-900 h-full relative" id="solo-operator-view">
      
      {/* Toast Notification Simulation */}
      <AnimatePresence>
        {showSimNotification && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-14 left-4 right-4 bg-zinc-950 text-white rounded-xl p-3.5 shadow-xl flex items-start gap-2.5 z-50 border border-zinc-805"
          >
            <Sparkles className="w-4 h-4 text-orange-400 fill-orange-400/20 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-0.5">
              <span className="text-sm font-bold text-orange-400 font-sans">Nhật ký Hệ thống Thu-Nấu 3-in-1</span>
              <p className="text-xs text-zinc-300 font-medium whitespace-pre-line leading-normal font-sans">{showSimNotification}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Header Area with Quick Stats (Clear and bold for older eyes) */}
      <div className="bg-zinc-900 text-white p-4 pb-5 rounded-b-[24px] space-y-3 shadow-md border-b border-orange-500/15">
        <div className="flex justify-between items-center">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex w-2.5 h-2.5 rounded-full bg-orange-505 animate-pulse shrink-0"></span>
              <span className="text-[9.5px] font-black text-orange-400 flex items-center gap-1">
                <Cpu className="w-3 h-3" /> HẠNG GÓI: {tenantConfig.pricingTier.toUpperCase()} UNLOCKED
              </span>
            </div>
            <h1 className="text-base font-black tracking-tight">{tenantConfig.shopName}</h1>
          </div>
          
          <button 
            type="button"
            onClick={togglePaymentModeInSolo}
            className="text-[9.5px] font-bold py-1 px-3 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 rounded-full text-orange-300 transition-all cursor-pointer select-none flex items-center gap-1"
            title="Nhấp để chuyển nhanh qua lại Trả Trước / Trả Sau"
          >
            {tenantConfig.paymentMode === 'Pay-First' ? <><CreditCard className="w-3 h-3" /> QR Trả Trước</> : <><Receipt className="w-3 h-3" /> Trả Sau</>}
          </button>
        </div>

        {/* Simplistic Ribbon - Quick summary of today's health */}
        <div className="grid grid-cols-3 gap-2 bg-white/5 p-2.5 rounded-xl text-center select-none">
          <div className="py-1">
            <span className="text-[8.5px] text-zinc-400 font-bold block">TIỀN HÔM NAY</span>
            <span className="text-sm font-black text-orange-400 block mt-0.5 ">
              {(totalPaidRevenue).toLocaleString('vi-VN')}đ
            </span>
          </div>
          <div className="border-x border-white/10 py-1">
            <span className="text-[8.5px] text-zinc-400 font-bold block">HÓA ĐƠN</span>
            <span className="text-sm font-black text-white block mt-0.5 font-sans">
              {paidOrders.length} đã thu
            </span>
          </div>
          <div className="py-1">
            <span className="text-[8.5px] text-zinc-400 font-bold block">CHỜ PHỤC VỤ</span>
            <span className="text-sm font-black text-amber-400 block mt-0.5 font-sans">
              {activeOrders.length} đơn
            </span>
          </div>
        </div>
      </div>

      {/* Main Container Area with Navigation Screens */}
      <div className="flex-grow overflow-y-auto p-3 pb-24 space-y-3">
        
        {/* VIEW 1: HOME & ACTIVE QUEUES & COMPLETED REVERT DATABASE */}
        {activeTab === 'home' && (
          <div className="space-y-4.5 animate-fadeIn">
            
            {/* Simulation triggers */}
            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-extrabold text-zinc-500 ">Hành trình đơn hàng hôm nay</span>
              <button
                type="button"
                onClick={handleSoloSimulateOrder}
                className="bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-2.5 py-1 text-[9.5px] font-extrabold flex items-center gap-1 tracking-wide shadow-sm font-sans cursor-pointer transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> Giả lập bàn quét QR đặt món
              </button>
            </div>

            {/* INTERACTIVE CONFIRMATION POPUPS FOR SAFE IFRAME USE */}
            <AnimatePresence>
              {revertingOrderId && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-orange-50 border-2 border-orange-500 rounded-2xl p-4.5 space-y-3 shadow-md"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-black text-zinc-900">Hoàn tác hóa đơn này về chưa thu tiền?</h4>
                      <p className="text-sm text-zinc-650 leading-relaxed font-sans">Đơn sẽ phục hồi về trạng thái <strong>'Chờ giao khách'</strong>, thu hồi lại điểm thưởng tích lũy của khách hàng liên kết nếu có.</p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2.5 pt-1">
                    <button 
                      type="button"
                      onClick={() => setRevertingOrderId(null)}
                      className="px-3.5 py-1.5 border border-zinc-300 rounded-xl text-[10.5px] font-bold text-zinc-600 hover:bg-zinc-100 cursor-pointer"
                    >
                      Quay lại
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleRevertOrderAction(revertingOrderId)}
                      className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-[10.5px] font-extrabold shadow-sm cursor-pointer"
                    >
                      Xác nhận Revert
                    </button>
                  </div>
                </motion.div>
              )}

              {cancellingOrderId && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-red-50 border-2 border-red-500 rounded-2xl p-4.5 space-y-3 shadow-md"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-red-650 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-black text-zinc-900">Huỷ bỏ vĩnh viễn đơn hàng này?</h4>
                      <p className="text-sm text-zinc-650 leading-relaxed font-sans">Hành động này sẽ xóa dữ liệu đơn hàng và hoàn lại các mộc thô đã khấu trừ ra tủ nguyên liệu.</p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2.5 pt-1">
                    <button 
                      type="button"
                      onClick={() => setCancellingOrderId(null)}
                      className="px-3.5 py-1.5 border border-zinc-300 rounded-xl text-[10.5px] font-bold text-zinc-600 hover:bg-zinc-100 cursor-pointer"
                    >
                      Bỏ qua
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleCancelOrderAction(cancellingOrderId)}
                      className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10.5px] font-extrabold shadow-sm cursor-pointer"
                    >
                      Xác nhận Huỷ
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* SECTION: ACTIVE ORDERS PROCESSING (3-in-1 Workflow) */}
            <div className="space-y-2.5">
              <span className="text-[9.5px] font-black text-zinc-400 block">1. ĐƠN ĐANG CHẾ BIẾN & CHỜ GIAO ({activeOrders.length})</span>
              
              {activeOrders.length === 0 ? (
                <div className="bg-white rounded-2xl border border-zinc-205 p-6 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center mx-auto text-zinc-400">
                    <UtensilsCrossed className="w-5 h-5" />
                  </div>
                  <p className="text-[11.5px] font-bold text-zinc-500">Chưa có bàn nào gọi món</p>
                  <p className="text-xs text-zinc-400">Bấm nút "Giả lập bàn đặt món" góc trên để kiểm nghiệm nhanh luồng đi của đơn.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {activeOrders.map((order) => {
                    const statusText = order.status === 'pending' ? 'Chờ duyệt gán bếp' : order.status === 'cooking' ? 'Bếp đang hầm nấu' : 'Nấu xong chờ giao';
                    const activeStepNum = order.status === 'pending' ? 1 : order.status === 'cooking' ? 2 : 3;

                    return (
                      <div key={order.id} className="bg-white border border-zinc-200/90 rounded-2xl p-3.5 shadow-2xs space-y-3">
                        {/* Title box */}
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-black text-zinc-950">{getTableName(order.tableId)}</span>
                              {order.paymentMode === 'Pay-First' && (
                                <span className="text-[8.5px] bg-zinc-100 text-zinc-800 border border-zinc-200 font-black px-1 rounded ">TRẢ TRƯỚC</span>
                              )}
                            </div>
                            <span className="text-[9px] text-zinc-400 font-bold block mt-0.5">MÃ: #{order.id.slice(-6).toUpperCase()} • {new Date(order.timestamp).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>

                          <div className="text-right">
                            <span className="text-sm font-black text-zinc-900 block">{(order.total).toLocaleString()}đ</span>
                            {tenantConfig.pricingTier !== 'Lite' && order.customerPhone && (
                              <span className="text-[8.5px] text-zinc-400 italic block">Mã hội viên: {order.customerPhone.slice(-4)}</span>
                            )}
                          </div>
                        </div>

                        {/* Order lines */}
                        <div className="bg-zinc-50 rounded-xl p-2.5 divide-y divide-zinc-200 text-[11.5px] space-y-1.5">
                          {order.items.map((it, idx) => (
                            <div key={idx} className="flex justify-between items-center py-1">
                              <span className="font-bold text-zinc-800">
                                {it.quantity}x {it.name}
                              </span>
                              <span className="text-zinc-500 text-[10.5px]">
                                {(it.price * it.quantity).toLocaleString()}đ
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Progress Stepper graphic: visual & intuitive for older owners */}
                        <div className="grid grid-cols-3 gap-1 shadow-inner bg-zinc-100 p-1 rounded-lg text-center select-none text-[9px] font-black">
                          <div className={`py-1 rounded-md transition-all ${activeStepNum === 1 ? 'bg-orange-600 text-white' : 'text-zinc-500'}`}>1. CHỜ DUYỆT</div>
                          <div className={`py-1 rounded-md transition-all ${activeStepNum === 2 ? 'bg-amber-500 text-white' : 'text-zinc-500'}`}>2. ĐANG NẤU</div>
                          <div className={`py-1 rounded-md transition-all ${activeStepNum === 3 ? 'bg-emerald-600 text-white' : 'text-zinc-500'}`}>3. CHỜ KHÁCH THU</div>
                        </div>

                        {/* Fast action button based on current status */}
                        <div className="flex gap-2 pt-1 border-t border-zinc-100">
                          <button
                            type="button"
                            onClick={() => setCancellingOrderId(order.id)}
                            className="bg-zinc-100 hover:bg-red-50 text-zinc-600 hover:text-red-600 px-3.5 py-2 rounded-xl text-[10.5px] font-bold border border-zinc-250 cursor-pointer text-center"
                          >
                            Xoá/Hủy đơn
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => handleAdvanceStatus(order.id, order.status)}
                            className={`flex-1 text-white text-[10.5px] py-2 px-4 rounded-xl font-extrabold shadow-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                              order.status === 'pending' ? 'bg-orange-600 hover:bg-orange-700 animate-pulse' :
                              order.status === 'cooking' ? 'bg-amber-500 hover:bg-amber-600' :
                              'bg-emerald-600 hover:bg-emerald-700'
                            }`}
                          >
                            <ChefHat className="w-3.5 h-3.5" />
                            {order.status === 'pending' ? 'Báo Nhận & Nổi Lửa ➔' :
                             order.status === 'cooking' ? 'Báo Đã Nấu Xong ✓ ➔' :
                             'Thu Tiền & In Bill Đơn Hàng ✓'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SECTION: HISTORY COMPLETED LOG & SEARCH WITH REVERT BACK MECHANISM */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-3.5 shadow-2xs space-y-3.5">
              <div className="flex items-center gap-1.5 border-b pb-2 select-none">
                <History className="w-4 h-4 text-zinc-600" />
                <h3 className="text-xs font-black text-zinc-805">2. BIÊN LAI ĐÃ THU - REVERT HOÀN TÁC</h3>
              </div>

              {/* Dynamic search input for historical paid invoices */}
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-450 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Tìm hóa đơn: Số bàn, sđt hội viên, mã hoá đơn..."
                  value={searchRevertQuery}
                  onChange={(e) => setSearchRevertQuery(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-250 rounded-xl py-2 pl-9 pr-4 text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none"
                />
                {searchRevertQuery && (
                  <button 
                    onClick={() => setSearchRevertQuery('')}
                    className="absolute right-3 top-2.5 text-xs text-zinc-400 hover:text-zinc-600 font-bold"
                  >
                    Xóa lọc
                  </button>
                )}
              </div>

              {filteredCompletedOrders.length === 0 ? (
                <p className="text-center text-zinc-400 text-[10.5px] py-4 select-none">
                  Chưa tìm được hóa đơn hòa hoàn thành tương thích nào hôm nay.
                </p>
              ) : (
                <div className="divide-y divide-zinc-150 text-xs">
                  {filteredCompletedOrders.map((invoice) => (
                    <div key={invoice.id} className="py-2.5 space-y-2 first:pt-0 last:pb-0">
                      <div className="flex justify-between items-start text-sm ">
                        <div>
                          <p className="font-extrabold text-zinc-900">{getTableName(invoice.tableId)}</p>
                          <span className="text-[8.5px] text-zinc-400 font-medium leading-none block mt-0.5">#{invoice.id.slice(-8).toUpperCase()} • {new Date(invoice.timestamp).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-emerald-600 block">+{(invoice.total).toLocaleString()}đ</span>
                          {invoice.customerPhone && (
                            <span className="text-[8px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1 py-0.2 rounded font-semibold">Tích điểm: {invoice.customerPhone}</span>
                          )}
                        </div>
                      </div>

                      {/* Items row in tiny */}
                      <p className="text-xs text-zinc-500 truncate leading-relaxed">
                        {invoice.items.map(it => `${it.quantity}x ${it.name}`).join(', ')}
                      </p>

                      <div className="flex justify-end select-none">
                        <button
                          type="button"
                          onClick={() => setRevertingOrderId(invoice.id)}
                          className="bg-zinc-50 hover:bg-orange-50 text-orange-600 border border-orange-200 hover:border-orange-300 font-bold px-3 py-1.5 rounded-xl text-[9.5px] flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Undo2 className="w-3.5 h-3.5" /> REVERT (Nhấp lộn / Hoàn hoá đơn)
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* VIEW 2: KHO & VẬT LIỆU (PANTRY & ITEM AVAILABILITY) */}
        {activeTab === 'pantry' && (
          <div className="space-y-4 animate-fadeIn">
            
            {/* ITEM STOCK TOGGLE RAIL */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-4.5 space-y-3 shadow-2xs">
              <div className="flex items-center gap-1.5 border-b pb-2 select-none">
                <ChefHat className="w-4 h-4 text-orange-600" />
                <h3 className="text-xs font-black text-zinc-800">Quản lý đóng/mở món gọi tại QR</h3>
              </div>
              <p className="text-xs text-zinc-550 leading-relaxed font-sans">
                Nhấp nút bật tắt khi nguyên liệu hết đột xuất giữa ca. Món ngắt sẽ hiển thị dưới dạng <strong>🚫 Báo tạm hết</strong> trên điện thoại khách hàng lập tức.
              </p>

              <div className="space-y-1.5 text-xs pt-1.5">
                {menuItems.map((dish) => (
                  <div key={dish.id} className="flex justify-between items-center bg-zinc-50 p-2 rounded-xl border border-zinc-200">
                    <div className="space-y-0.5 truncate pr-2.5">
                      <p className="font-bold text-zinc-850 truncate text-sm ">{dish.name}</p>
                      <span className="text-zinc-400 text-[9.5px]">{(dish.price).toLocaleString()}đ • {dish.category}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleItemStock(dish.id)}
                      className={`text-xs py-1 px-3 rounded-xl border font-extrabold tracking-wide transition-all select-none cursor-pointer ${
                        dish.inStock 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                          : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                      }`}
                    >
                      {dish.inStock ? '🟢 Còn món' : '🚫 Hết món'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* RAW INGREDIENTS LISTS */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-4.5 space-y-4 shadow-2xs">
              <div className="flex items-center gap-1.5 border-b pb-2 select-none">
                <Package className="w-4 h-4 text-orange-600" />
                <h3 className="text-xs font-black text-zinc-800">Kho hàng dự trữ & Đầy vật tư</h3>
              </div>

              {/* Delete Confirm inline dialog for ingredients safety */}
              <AnimatePresence>
                {deletingIngId && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-red-50 border-2 border-red-300 rounded-2xl p-3.5 space-y-2.5"
                  >
                    <p className="text-sm font-bold text-red-950">Bạn thật sự muốn xóa nguyên liệu này? Các công thức liên kết sẽ mất dòng vật tư này.</p>
                    <div className="flex justify-end gap-2 text-xs font-bold">
                      <button 
                        onClick={() => setDeletingIngId(null)}
                        className="px-2.5 py-1.5 border border-zinc-300 rounded bg-white text-zinc-600 cursor-pointer"
                      >
                        Bỏ qua
                      </button>
                      <button 
                        onClick={() => handleDeleteIngredientAction(deletingIngId)}
                        className="px-3 py-1.5 bg-red-600 text-white rounded cursor-pointer"
                      >
                        Xóa vĩnh viễn
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {ingredients.map((ing) => {
                  const isLow = ing.stockAmount < 1500;
                  const weightDisplay = (ing.unit === 'g' || ing.unit === 'ml') 
                    ? `${(ing.stockAmount / 1000).toFixed(2)} kg/l` 
                    : `${ing.stockAmount} ${ing.unit}`;

                  return (
                    <div key={ing.id} className={`p-3 rounded-xl border space-y-1.5 relative ${isLow ? 'bg-amber-50/70 border-amber-300 text-amber-950' : 'bg-zinc-50 border-zinc-200 text-zinc-850'}`}>
                      <div className="flex justify-between items-start">
                        <span className="font-extrabold text-sm pr-5 leading-tight">{ing.name}</span>
                        <button
                          type="button"
                          onClick={() => setDeletingIngId(ing.id)}
                          className="text-zinc-400 hover:text-red-650 cursor-pointer select-none absolute top-2 right-2 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex justify-between items-baseline pt-1">
                        <div className="space-y-0.5">
                          <span className="text-[11.5px] font-black tracking-tight">{weightDisplay}</span>
                          {isLow && <span className="text-[8px] bg-amber-500 text-white font-black px-1 rounded block w-fit">⚠️ Dự báo hụt</span>}
                        </div>
                        <span className="text-[9.5px] text-zinc-500">Giá: {ing.costPerUnit}đ/{ing.unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* QUICK ADD NEW INGREDIENT FORM */}
              <div className="bg-gradient-to-tr from-zinc-50 to-zinc-100 rounded-2xl p-4.5 border border-zinc-200 space-y-3.5">
                <span className="text-[9.5px] font-bold text-zinc-400 block select-none">Nhập kho vật tư thô mới</span>
                
                <form onSubmit={handleAddIngredientForm} className="space-y-3 text-xs leading-none">
                  <div className="space-y-1">
                    <label className="text-zinc-500 font-bold block">Tên nguyên liệu</label>
                    <input
                      type="text"
                      required
                      placeholder="Ví dụ: Phở khô gia truyền, Cốt trà bồm sâm dứa..."
                      value={quickIngName}
                      onChange={(e) => setQuickIngName(e.target.value)}
                      className="w-full bg-white border border-zinc-250 p-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-orange-500 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-zinc-500 font-bold block">Đơn vị</label>
                      <select
                        value={quickIngUnit}
                        onChange={(e) => setQuickIngUnit(e.target.value)}
                        className="w-full bg-white border border-zinc-250 p-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-orange-500 text-xs"
                      >
                        <option value="g">gram (g)</option>
                        <option value="ml">mililit (ml)</option>
                        <option value="cái">cái / xiên</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-zinc-500 font-bold block">Đơn giá vốn (đ)</label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={quickIngCost}
                        onChange={(e) => setQuickIngCost(e.target.value)}
                        className="w-full bg-white border border-zinc-250 p-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-orange-500 text-xs "
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-zinc-500 font-bold block">Dự trữ ban đầu</label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={quickIngQty}
                        onChange={(e) => setQuickIngQty(e.target.value)}
                        className="w-full bg-white border border-zinc-250 p-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-orange-500 text-xs "
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-extrabold py-2.5 rounded-xl flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-98 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm nguyên liệu vào Kho
                  </button>
                </form>
              </div>
            </div>

          </div>
        )}

        {/* VIEW 3: ĐỊNH LƯỢNG & GIÁ VỐN (FORMULA SETUP) */}
        {activeTab === 'cogs' && (
          <div className="space-y-4 animate-fadeIn">
            
            {/* PRICING PLANS COMPATIBILITY LOCK ON PRO PORTIONING SYSTEM */}
            {tenantConfig.pricingTier !== 'Pro' ? (
              <div className="bg-zinc-950 text-white rounded-2xl p-6 text-center space-y-4 border border-zinc-800 shadow-md">
                <div className="w-12 h-12 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-700 flex items-center justify-center mx-auto">
                  <Shield className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-black text-white">Chức năng Định lượng Vật tư & Tính năng Cảnh báo tự động thuộc gói PRO!</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed max-w-xs mx-auto font-sans">
                    Nâng tầm quản trị quán ăn sòng phẳng hoàn hảo: tự động trừ số lượng thịt tái dải, bánh phở ra mộc và tính ra COGS/giá vốn lãi thô cực kỳ chặt chẽ!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpgradeTier('Pro')}
                  className="bg-orange-500 hover:bg-orange-400 text-white font-extrabold tracking-wide px-5 py-2.5 rounded-xl text-xs shadow-lg cursor-pointer transition-all select-none pr-6 pl-6"
                >
                  🚀 KÍCH HOẠT NHANH GÓI PRO MIỄN PHÍ
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                
                {/* INGREDIENT COST IN DISH FORMULAS */}
                <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-2xs space-y-3.5">
                  <div className="flex items-center gap-1.5 border-b pb-2 select-none">
                    <Scale className="w-4 h-4 text-orange-600" />
                    <h3 className="text-xs font-black text-zinc-800">Cơ chế định lượng công thức phơi vốn</h3>
                  </div>
                  <p className="text-xs text-zinc-550 leading-relaxed font-sans">
                    Để hệ thống tính toán giá thô của bát đĩa một cách linh nghiệm vĩ mô, anh chị vui lòng kéo gán mức hao hụt vật liệu tương ứng cho một phần phục vụ.
                  </p>

                  <div className="space-y-3 text-xs">
                    {menuItems.map(item => {
                      const dishRecipe = dishRecipes.find(r => r.menuId === item.id);
                      const isEditing = editingRecipeId === item.id;
                      const rawCost = calculateDishCost(item.id);
                      const marginVal = item.price - rawCost;
                      const marginPct = item.price > 0 ? (marginVal / item.price) * 100 : 0;

                      return (
                        <div key={item.id} className="bg-zinc-50 border border-zinc-200/90 rounded-2xl p-3 space-y-2.5">
                          <div className="flex justify-between items-start">
                            <div className="space-y-0.5">
                              <span className="font-extrabold text-sm leading-tight block">{item.name}</span>
                              <span className="text-[9px] text-[#2ebd59] font-black ">
                                Lãi gộp {Math.round(marginPct)}%
                              </span>
                            </div>

                            <div className="text-right">
                              <span className="text-sm text-zinc-500">Giá: {item.price.toLocaleString()}đ</span>
                              <span className="text-[9.5px] font-black text-orange-600 block mt-0.5 ">Vốn thô: {rawCost.toLocaleString()}đ</span>
                            </div>
                          </div>

                          {/* Quick trigger editor link */}
                          <div className="flex gap-2 justify-end pt-1 select-none">
                            <button
                              type="button"
                              onClick={() => setEditingRecipeId(isEditing ? null : item.id)}
                              className="bg-white border border-zinc-250 p-1.5 px-3 rounded-lg text-[9.5px] font-bold text-zinc-700 hover:bg-zinc-100 flex items-center gap-1 cursor-pointer"
                            >
                              <Calculator className="w-3.5 h-3.5 text-zinc-500" /> 
                              {isEditing ? 'Đóng bộ định lượng' : 'Chỉnh định lượng định mức'}
                            </button>
                          </div>

                          {/* INLINE PORTION EDITOR BOX */}
                          {isEditing && (
                            <div className="bg-white p-3 rounded-xl border border-zinc-200 mt-2 space-y-3.5 animate-fadeIn">
                              <span className="text-[9px] font-black text-zinc-400 block">Thiết lập Portion (Định mức mộc thô)</span>
                              
                              <div className="space-y-3">
                                {ingredients.map(ing => {
                                  const recipeItem = dishRecipe?.recipes.find(r => r.ingredientId === ing.id);
                                  const qty = recipeItem?.quantity || 0;

                                  return (
                                    <div key={ing.id} className="flex justify-between items-center text-[10.5px] border-b pb-2 last:border-b-0 last:pb-0">
                                      <div className="w-1/3 truncate">
                                        <p className="font-extrabold text-zinc-800 leading-tight truncate">{ing.name}</p>
                                        <span className="text-[8px] text-zinc-400 block ">đơn vị: {ing.unit}</span>
                                      </div>

                                      <div className="flex-1 px-4 text-center space-y-1">
                                        <span className="font-black text-zinc-900 text-sm block">{qty} {ing.unit}</span>
                                        
                                        <div className="flex items-center gap-2 select-none">
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateRecipeFormula(item.id, ing.id, Math.max(0, qty - (ing.unit === 'g' || ing.unit === 'ml' ? 10 : 1)))}
                                            className="w-5 h-5 bg-zinc-100 border border-zinc-250 hover:bg-zinc-200 rounded font-bold flex items-center justify-center text-xs text-zinc-750 cursor-pointer"
                                          >
                                            -
                                          </button>
                                          
                                          <input
                                            type="range"
                                            min="0"
                                            max={ing.unit === 'g' || ing.unit === 'ml' ? "350" : "10"}
                                            step={ing.unit === 'g' || ing.unit === 'ml' ? "5" : "1"}
                                            className="w-full h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
                                            value={qty}
                                            onChange={(e) => handleUpdateRecipeFormula(item.id, ing.id, parseInt(e.target.value) || 0)}
                                          />

                                          <button
                                            type="button"
                                            onClick={() => handleUpdateRecipeFormula(item.id, ing.id, qty + (ing.unit === 'g' || ing.unit === 'ml' ? 10 : 1))}
                                            className="w-5 h-5 bg-zinc-100 border border-zinc-250 hover:bg-zinc-200 rounded font-bold flex items-center justify-center text-xs text-zinc-750 cursor-pointer"
                                          >
                                            +
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="text-right select-none">
                                <button
                                  type="button"
                                  onClick={() => { setEditingRecipeId(null); triggerPulseText(`Ghi nhận công thức cho: ${item.name}`); }}
                                  className="bg-zinc-950 text-white font-extrabold text-[9px] py-1.5 px-3 rounded-lg shadow-sm cursor-pointer border-none"
                                >
                                  Xác nhận hoàn thành✓
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* HIGH-VALUE COGS REPORTS */}
                <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3.5 shadow-xs">
                  <div className="flex items-center gap-1.5 border-b pb-2 select-none">
                    <TrendingUp className="w-4 h-4 text-orange-600" />
                    <h4 className="text-xs font-black text-zinc-805">Phân tích giá thành vốn gộp hôm nay</h4>
                  </div>

                  <div className="space-y-3.5 text-xs">
                    {/* Top revenue */}
                    <div className="space-y-1.5">
                      <span className="text-[9.5px] font-bold text-zinc-400 block">Top món chiếm đoạt doanh thu lớn</span>
                      <div className="space-y-1">
                        {topRevenueDishes.slice(0, 3).map((dish, i) => (
                          <div key={dish.menuId} className="flex justify-between items-center bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/50">
                            <span className="font-bold text-zinc-850 text-[10.5px]">{i+1}. {dish.name}</span>
                            <span className="text-xs font-black text-zinc-950">{(dish.revenue).toLocaleString('vi-VN')}đ ({dish.qty} phần)</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Margins */}
                    <div className="space-y-1.5">
                      <span className="text-[9.5px] font-bold text-zinc-400 block">Mực biên lợi nhuận thô cao nhất %</span>
                      <div className="grid grid-cols-2 gap-2">
                        {calculatedMargins.slice(0, 4).map((dish) => (
                          <div key={dish.id} className="bg-emerald-50 border border-emerald-150 p-2.5 rounded-xl text-[10.5px] space-y-1">
                            <p className="font-extrabold text-zinc-900 truncate leading-tight">{dish.name}</p>
                            <div className="flex justify-between items-baseline pt-1">
                              <span className="text-emerald-850 font-black">Lãi {dish.percent}%</span>
                              <span className="text-zinc-500 text-[8.5px]">vốn {dish.cogs.toLocaleString()}đ</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

        {/* VIEW 4: SYSTEM PACKAGE TIER & CUSTOMER LOYALTY & REVENUE CO-CHEF AI */}
        {activeTab === 'gói' && (
          <div className="space-y-4 animate-fadeIn">
            
            {/* PRICING PLANS OPTION SELECTION */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-4.5 space-y-3.5 shadow-2xs">
              <div className="flex items-center gap-1.5 border-b pb-2 select-none">
                <Shield className="w-4 h-4 text-orange-600" />
                <h3 className="text-xs font-black text-zinc-800">Chọn hạng gói vận hành của cửa tiệm</h3>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed font-sans">
                Thay đổi nhanh gói dịch vụ ngay tại đây để mở khóa và trải nghiệm sự phân tầng tính năng chuyên nghiệp:
              </p>

              <div className="grid grid-cols-3 gap-1.5 select-none text-center">
                <button
                  type="button"
                  onClick={() => handleUpgradeTier('Lite')}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                    tenantConfig.pricingTier === 'Lite'
                      ? 'bg-zinc-900 text-white border-zinc-950 shadow-sm'
                      : 'bg-zinc-50 border-zinc-250 text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  <span className="text-sm font-black block">LITE</span>
                  <span className="text-[8px] text-zinc-455 block mt-1">Cơ bản tối giản</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleUpgradeTier('Pro')}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                    tenantConfig.pricingTier === 'Pro'
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm animate-pulse'
                      : 'bg-zinc-50 border-zinc-250 text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  <span className="text-sm font-black block">PRO</span>
                  <span className="text-[8px] text-emerald-150 block mt-1">✓ Tích Điểm</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleUpgradeTier('Enterprise')}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                    tenantConfig.pricingTier === 'Enterprise'
                      ? 'bg-orange-600 text-white border-orange-700 shadow-sm'
                      : 'bg-zinc-50 border-zinc-250 text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  <span className="text-sm font-black block">ENTERPRISE</span>
                  <span className="text-[8px] text-orange-100 block mt-1">🔥 Portion + Cogs</span>
                </button>
              </div>
            </div>

            {/* SYNCED LOYALTY CARD DATABASE INTEGRATION */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-2xs space-y-3.5">
              <div className="flex items-center gap-1.5 border-b pb-2 select-none">
                <Gift className="w-4 h-4 text-orange-600" />
                <h3 className="text-xs font-black text-zinc-800">Đồng bộ tích điểm khách hàng (Loyalty)</h3>
              </div>

              {tenantConfig.pricingTier === 'Lite' ? (
                <div className="py-6 text-center space-y-3.5">
                  <p className="text-xs text-zinc-450 leading-relaxed max-w-xs mx-auto font-sans">
                    Hệ thống tích thưởng hội viên hiện đang bị khóa ở bản Lite. Vui lòng nâng hạng gói lên PRO hoặc ENTERPRISE phía trên để tự động mở khóa tính năng này!
                  </p>
                  <button
                    type="button"
                    onClick={() => handleUpgradeTier('Pro')}
                    className="bg-emerald-605 text-white font-extrabold py-2 px-4 rounded-xl text-[9px] shadow-sm cursor-pointer"
                  >
                    Kích hoạt gói PRO để đồng bộ tắp lự
                  </button>
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  <p className="text-xs text-zinc-550 leading-relaxed font-sans">
                    Khi khách đặt đơn qua QR bằng App khách có rải Sđt hội viên, hệ thống sẽ tự động cộng tích lũy <strong>1 điểm cho mỗi 10.000đ hóa đơn</strong>.
                  </p>

                  {/* Add member inside Solo View */}
                  <form onSubmit={handleCreateMember} className="bg-zinc-50 p-3 rounded-xl border border-zinc-200 space-y-2.5">
                    <span className="text-[8.5px] font-black text-zinc-400 block ">Đăng ký Hội viên mới rảnh tay</span>
                    
                    {loyaltyMessage && <p className="text-xs text-emerald-700 font-bold bg-emerald-50 p-2 rounded-lg border border-emerald-200">{loyaltyMessage}</p>}

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        required
                        placeholder="Số Đthoại..."
                        value={newMemberPhone}
                        onChange={(e) => setNewMemberPhone(e.target.value.replace(/\D/g, ''))}
                        className="bg-white border p-1.5 rounded text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 input-sms"
                      />
                      <input
                        type="text"
                        placeholder="Họ tên Khách..."
                        value={newMemberName}
                        onChange={(e) => setNewMemberName(e.target.value)}
                        className="bg-white border p-1.5 rounded text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 input-sms"
                      />
                    </div>
                    
                    <button
                      type="submit"
                      className="w-full bg-zinc-900 hover:bg-zinc-800 text-white py-1.5 rounded-lg text-[9.5px] font-black flex items-center justify-center gap-1.5 shadow-sm cursor-pointer border-none transition-colors"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Ghi nhận Đăng ký
                    </button>
                  </form>

                  {/* Search and list loyal members */}
                  <div className="relative pt-1">
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-3.5" />
                    <input
                      type="text"
                      placeholder="Tìm kiếm hội viên theo số điện thoại / tên..."
                      value={searchLoyaltyQuery}
                      onChange={(e) => setSearchLoyaltyQuery(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 pl-8 pr-3 text-[10.5px] focus:ring-1 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>

                  <div className="max-h-44 overflow-y-auto divide-y divide-zinc-150 border rounded-xl overflow-hidden bg-white">
                    {filteredLoyaltyMembers.map((member) => (
                      <div key={member.phone} className="p-2.5 hover:bg-zinc-50 flex justify-between items-center text-[10.5px]">
                        <div>
                          <p className="font-extrabold text-zinc-900">{member.name}</p>
                          <span className="text-zinc-400 text-[9px] block">SĐT: {member.phone} • ghé chơi {member.visits} ca</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[11.5px] font-black text-orange-600 block">{member.points} pt</span>
                          <span className="text-[8.5px] text-zinc-450 italic block">Tiêu: {(member.totalSpent).toLocaleString()}đ</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* VIEW 4: DEEP INSIGHTFUL CO-CHEF AI REVENUE ANALYSIS (Rich analysis as requested) */}
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 text-white rounded-2xl p-4.5 space-y-3.5 border border-zinc-800 shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 select-none">
                  <Cpu className="w-5 h-5 text-orange-400 fill-orange-400/20" />
                  <span className="text-[9.5px] font-extrabold text-zinc-400 ">ScanGo Co-Chef AI Engine</span>
                </div>
                <span className="text-[8.5px] bg-orange-505/20 border border-orange-500/50 text-orange-400 font-black px-2 py-0.5 rounded ">Gemini.v2</span>
              </div>

              <div className="space-y-3 pt-1 border-t border-white/5 text-sm leading-relaxed select-none">
                
                {/* 1. Dynamic profitable dish */}
                <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-1">
                  <span className="text-[8.5px] font-extrabold text-orange-300 block">🎯 Món sinh lời tốt nhất quán (Lãi thô %)</span>
                  <p className="font-extrabold text-white text-[11.5px]">{calculatedMargins[0]?.name || "Đang phân tích..."}</p>
                  <p className="text-zinc-300 text-xs ">
                    Giá thô gốc chỉ tốn <strong className="text-white">{(calculatedMargins[0]?.cogs || 2700).toLocaleString('vi-VN')}đ</strong> (bán ra {(calculatedMargins[0]?.price || 15000).toLocaleString('vi-VN')}đ). Biên lãi gộp dồi dào đạt <strong className="text-emerald-400">{calculatedMargins[0]?.percent || 82}%</strong>. Anh chị nên ưu tiên đặt món này góc chính diện QR để kích cầu!
                  </p>
                </div>

                {/* 2. Slow items strategy */}
                <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-1">
                  <span className="text-[8.5px] font-extrabold text-amber-400 block">📊 Kích cầu tiêu thụ món bán chậm</span>
                  <p className="font-extrabold text-zinc-200 text-[10.5px]">Món bán chậm gần đây: {slowMovingDishes[0]?.name}</p>
                  <p className="text-zinc-300 text-xs ">
                    Hôm nay chỉ tiêu thụ được vỏn vẹn <strong className="text-amber-300">{slowMovingDishes[0]?.salesQty} suất</strong> bán ra. Mẹo vặt: Nên tung combo ghép cặp ăn kèm một cốc sâm dứa để dọn lò cực sạch, thúc đẩy dòng tiền!
                  </p>
                </div>

                {/* 3. Raw Materials Stock warning alerts */}
                {ingredients.filter(ing => ing.stockAmount < 1550).length > 0 ? (
                  <div className="bg-red-950/40 rounded-xl p-3 border border-red-900/40 space-y-1">
                    <span className="text-[8.5px] font-extrabold text-red-400 block">🚨 Khẩn cấp: Kho thô chạm đáy cảnh báo</span>
                    <p className="font-extrabold text-red-200 text-[10.5px]">
                      {ingredients.filter(ing => ing.stockAmount < 1550).map(ing => `${ing.name} còn lẻ tẻ ${ing.unit === 'g' ? `${ing.stockAmount}g` : `${ing.stockAmount} ${ing.unit}`}`).join(', ')}
                    </p>
                    <p className="text-zinc-350 text-xs ">
                      Sức dự phòng chỉ còn đủ gánh thêm tầm <strong>~5 bát ăn phục vụ nữa</strong>. Hãy tranh thủ gom thêm sớm kẻo đứt đơn dở lúc cao điểm trưa nay!
                    </p>
                  </div>
                ) : (
                  <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-1 text-zinc-300 text-xs ">
                    <span className="text-[8.5px] font-extrabold text-zinc-400 block">⚠️ Cảng kho thô</span>
                    Kho nguyên mộc thô hiện đang dồi dào, đáp ứng hoàn hảo dòng dọn phục vụ!
                  </div>
                )}

                {/* 4. Strategic Price Recommendation */}
                <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-1">
                  <span className="text-[8.5px] font-extrabold text-emerald-400 block">📈 Khuyên dùng giá vĩ mô tối ưu</span>
                  <p className="text-zinc-300 text-xs ">
                    Giá sỉ đầu nguồn thịt bắp tăng vọt 11%. Anh chị tránh điều chỉnh giá Phở tăng dồn dập khiến khách dội, hãy tung chương trình miễn phí sâm dứa hương lài cho bàn đặt QR trên 150.000đ để bù dòng vốn!
                  </p>
                </div>

              </div>

              <div className="flex justify-between items-center pt-2.5 border-t border-white/10 select-none text-[8.5px] text-zinc-500">
                <span>Cập nhật: Mới tức thì</span>
                <button
                  type="button"
                  onClick={() => { setAiTipRefreshes(prev => prev + 1); triggerPulseText('🤖 Gemini đang đo đếm live dữ liệu thô...'); }}
                  className="text-orange-400 hover:text-orange-300 flex items-center gap-1 transition-all font-bold cursor-pointer border-none bg-transparent"
                >
                  <RefreshCw className="w-3 h-3" /> Làm mới dữ liệu
                </button>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* FOOTER BAR NAVIGATION TABS (Perfect for 40-50yo users - Large targets, concise names) */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-zinc-200 grid grid-cols-4 py-1.5 select-none shadow-lg z-40 text-center">
        <button
          type="button"
          onClick={() => { setActiveTab('home'); setRevertingOrderId(null); setCancellingOrderId(null); }}
          className={`flex flex-col items-center justify-center gap-1 transition-all border-none bg-transparent cursor-pointer focus:outline-none ${
            activeTab === 'home' ? 'text-orange-600 font-bold font-black' : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <UtensilsCrossed className="w-4.5 h-4.5" />
          <span className="text-[9.5px]">Home & Đơn</span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('pantry'); setDeletingIngId(null); }}
          className={`flex flex-col items-center justify-center gap-1 transition-all border-none bg-transparent cursor-pointer focus:outline-none ${
            activeTab === 'pantry' ? 'text-orange-600 font-bold font-black' : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Package className="w-4.5 h-4.5" />
          <span className="text-[9.5px]">Đóng/Mở Kho</span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('cogs'); setEditingRecipeId(null); }}
          className={`flex flex-col items-center justify-center gap-1 transition-all border-none bg-transparent cursor-pointer focus:outline-none ${
            activeTab === 'cogs' ? 'text-orange-600 font-bold font-black' : 'text-zinc-500 hover:text-zinc-801'
          }`}
        >
          <Scale className="w-4.5 h-4.5" />
          <span className="text-[9.5px]">Định Lượng</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('gói')}
          className={`flex flex-col items-center justify-center gap-1 transition-all border-none bg-transparent cursor-pointer focus:outline-none ${
            activeTab === 'gói' ? 'text-orange-600 font-bold font-black' : 'text-zinc-500 hover:text-zinc-801'
          }`}
        >
          <Cpu className="w-4.5 h-4.5" />
          <span className="text-[9.5px]">Hạng Gói & AI</span>
        </button>
      </div>

    </div>
  );
}


