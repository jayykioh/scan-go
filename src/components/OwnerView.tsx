import React, { useCallback, useEffect, useState } from 'react';
import {
  onboardingStepIds,
  type OnboardingChecklist,
  type OnboardingStepId,
} from '@contracts/onboarding.contract';
import {
  completeOnboardingStep,
  getOnboardingChecklist,
} from '../data/adapters/onboarding.adapter';
import {
  archiveMenuItem,
  createMenuItem,
  setMenuAvailability,
  subscribeOwnerMenu,
  updateMenuItem,
  type CatalogItemCommandFields,
} from '../data/adapters/catalog.adapter';
import {
  archiveTenantTable,
  createTenantTable,
  regenerateTableToken,
  renameTenantTable,
  subscribeTenantTables,
} from '../data/adapters/table.adapter';
import {
  createIngredient,
  subscribeIngredients,
  updateIngredient,
} from '../data/adapters/inventory.adapter';
import {
  toOwnerMenuItem,
  toTableConfig,
  toViewIngredient,
} from '../data/adapters/view-mappers';
import { TenantConfig, MenuItem, Order, LoyaltyMember, TableConfig, StaffAccount, Ingredient, RecipeItem } from '../types';
import { useActiveTenantId } from '../hooks/useActiveTenantId';
import { resolveInterfaceLocale, translate } from '../data/adapters/i18n.adapter';
import type { I18nMessageKey } from '@contracts/i18n.contract';
import { 
  Building2, 
  Sparkles, 
  TrendingUp, 
  Package, 
  MessageSquare, 
  SmartphoneNfc, 
  Check, 
  DollarSign, 
  AlertCircle, 
  ArrowRight, 
  ChevronRight, 
  Users, 
  Layers,
  ShoppingBag,
  RefreshCw,
  Plus,
  QrCode,
  Edit2,
  Trash2,
  Flame,
  Ticket,
  Star,
  Gift,
  PlusCircle,
  Save,
  Trash,
  Coffee,
  Receipt,
  UtensilsCrossed,
  CreditCard
} from 'lucide-react';

/** i18n keys for the approved onboarding steps (REQ-ONB-001, REQ-I18N-001). */
const ONBOARDING_STEP_LABEL_KEYS: Record<OnboardingStepId, I18nMessageKey> = {
  shopName: 'onboarding.step.shopName',
  industry: 'onboarding.step.industry',
  plan: 'onboarding.step.plan',
  paymentMode: 'onboarding.step.paymentMode',
  tables: 'onboarding.step.tables',
  menu: 'onboarding.step.menu',
};

/** Fill `{placeholder}` slots in a translated template (owner AI copy). */
function fillTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return Object.entries(vars).reduce(
    (text, [name, value]) =>
      text.split(`{${name}}`).join(String(value)),
    template,
  );
}

interface OwnerProps {
  tenantConfig: TenantConfig;
  setTenantConfig: React.Dispatch<React.SetStateAction<TenantConfig>>;
  orders: Order[];
  loyaltyMembers: LoyaltyMember[];
  onTriggerNfcTag: (tableId: string) => void;
  onboardCompleted: boolean;
  setOnboardCompleted: (val: boolean) => void;
  setViewMode: React.Dispatch<React.SetStateAction<'login' | 'grid' | 'owner' | 'cashier' | 'kitchen' | 'customer' | 'solo' | 'staff'>>;
  setSimulationTableId: (val: string) => void;
  staffAccounts: StaffAccount[];
  setStaffAccounts: React.Dispatch<React.SetStateAction<StaffAccount[]>>;
}

export default function OwnerView({
  tenantConfig,
  setTenantConfig,
  orders,
  loyaltyMembers,
  onTriggerNfcTag,
  onboardCompleted,
  setOnboardCompleted,
  setViewMode,
  setSimulationTableId,
  staffAccounts,
  setStaffAccounts,
}: OwnerProps) {
  const [locale] = useState(() => resolveInterfaceLocale());
  const t = (key: I18nMessageKey) => translate(locale, key);
  const [activeTab, setActiveTab] = useState<'kpi' | 'menu' | 'nfc' | 'ai' | 'staff' | 'kho'>('kpi');
  const [onboardingChecklist, setOnboardingChecklist] = useState<OnboardingChecklist | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<TableConfig[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const activeTenantId = useActiveTenantId();

  const activeTenantIdOrThrow = useCallback((): string => {
    if (!activeTenantId) {
      throw new Error('Chưa chọn cửa hàng.');
    }
    return activeTenantId;
  }, [activeTenantId]);

  // The server owns the onboarding checklist. Load it on mount and mark each
  // step complete through the Tenant callable (REQ-ONB-001).
  const refreshOnboarding = useCallback(async () => {
    try {
      setOnboardingChecklist(await getOnboardingChecklist());
    } catch {
      // A missing backend keeps the local UI usable.
    }
  }, []);

  const markOnboardingStep = useCallback(
    async (step: OnboardingStepId) => {
      try {
        setOnboardingChecklist(await completeOnboardingStep(step));
      } catch {
        // Ignore a transient server failure; the next action retries.
      }
    },
    [],
  );

  // Owner business state comes from bounded realtime listeners. The browser
  // never writes these collections directly (docs/RULES_FIREBASE.md §1).
  useEffect(() => {
    const unsubscribe = subscribeOwnerMenu(
      (items) => setMenuItems(items.map(toOwnerMenuItem)),
      (error) => setDataError(error.message),
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeTenantTables(
      (rows) => setTables(rows.map(toTableConfig)),
      (error) => setDataError(error.message),
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeIngredients(
      (rows) => setIngredients(rows.map(toViewIngredient)),
      (error) => setDataError(error.message),
    );
    return () => unsubscribe();
  }, []);


  useEffect(() => {
    void refreshOnboarding();
  }, [refreshOnboarding]);

  // Onboarding parameters
  const [tempShopName, setTempShopName] = useState('Phở Kinh Kỳ');
  const [tempIndustry, setTempIndustry] = useState<'quan_an' | 'quan_cafe' | 'nha_hang' | 'tiem_banh' | 'tra_sua'>('quan_an');
  const [tempTier, setTempTier] = useState<'Lite' | 'Pro' | 'Enterprise'>('Pro');
  const [tempPayMode, setTempPayMode] = useState<'Pay-First' | 'Pay-Later'>('Pay-Later');
  const [onboardStep, setOnboardStep] = useState(1);

  // Dish Management parameters
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState(30000);
  const [formCostPrice, setFormCostPrice] = useState(12000);
  const [formCategory, setFormCategory] = useState('Món nước');
  const [formType, setFormType] = useState('Đồ ăn');
  const [formDescription, setFormDescription] = useState('');
  const [formImage, setFormImage] = useState('');
  const [formStockCount, setFormStockCount] = useState(50);
  const [formToppings, setFormToppings] = useState<{ name: string; price: number }[]>([]);
  const [newToppingName, setNewToppingName] = useState('');
  const [newToppingPrice, setNewToppingPrice] = useState(0);
  
  // Recipe form
  const [formRecipe, setFormRecipe] = useState<RecipeItem[]>([]);
  const [newRecipeIngId, setNewRecipeIngId] = useState('');
  const [newRecipeQty, setNewRecipeQty] = useState(0);

  // Ingredient Management
  const [showAddIngForm, setShowAddIngForm] = useState(false);
  const [editingIng, setEditingIng] = useState<Ingredient | null>(null);
  const [ingFormName, setIngFormName] = useState('');
  const [ingFormCost, setIngFormCost] = useState(0);
  const [ingFormUnit, setIngFormUnit] = useState('kg');
  const [ingFormStock, setIngFormStock] = useState(0);

  // Promos
  const [promoCode, setPromoCode] = useState(tenantConfig.discountCode || 'MUANHIEU15K');
  const [promoMinItems, setPromoMinItems] = useState(tenantConfig.discountMinItems || 3);
  const [promoMinAmount, setPromoMinAmount] = useState(tenantConfig.discountMinAmount || 150000);
  const [promoAmount, setPromoAmount] = useState(tenantConfig.discountAmount || 15000);
  const [promoEnabled, setPromoEnabled] = useState(tenantConfig.discountEnabled !== false);
  const [promoTriggerType, setPromoTriggerType] = useState<'auto' | 'manual'>(tenantConfig.discountTriggerType || 'auto');
  const [promoConditionType, setPromoConditionType] = useState<'amount' | 'quantity' | 'both'>(tenantConfig.discountConditionType || 'quantity');
  const [promoTargetDishId, setPromoTargetDishId] = useState<string>(tenantConfig.discountTargetDishId || 'all');

  // Tables
  const [newTableName, setNewTableName] = useState('');
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [editingTableOriginalName, setEditingTableOriginalName] = useState('');

  // Staff management
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPin, setNewStaffPin] = useState('');
  const [newStaffRoles, setNewStaffRoles] = useState({ isKitchen: false, isWaiter: false, isCashier: false });
  const [showAddStaff, setShowAddStaff] = useState(false);

  const handleAddStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim() || newStaffPin.length < 3) return;
    if (!newStaffRoles.isKitchen && !newStaffRoles.isWaiter && !newStaffRoles.isCashier) return;
    setStaffAccounts(prev => [...prev, {
      id: String(Date.now()),
      name: newStaffName.trim(),
      pin: newStaffPin,
      roles: { ...newStaffRoles },
      isActive: true,
    }]);
    setNewStaffName('');
    setNewStaffPin('');
    setNewStaffRoles({ isKitchen: false, isWaiter: false, isCashier: false });
    setShowAddStaff(false);
  };

  const handleToggleStaffActive = (id: string) => {
    setStaffAccounts(prev => prev.map(a => a.id === id ? { ...a, isActive: !a.isActive } : a));
  };

  const handleDeleteStaff = (id: string) => {
    setStaffAccounts(prev => prev.filter(a => a.id !== id));
  };

  const resetIngForm = () => {
    setIngFormName('');
    setIngFormCost(0);
    setIngFormUnit('kg');
    setIngFormStock(0);
  };

  const handleStartAddIng = () => {
    resetIngForm();
    setEditingIng(null);
    setShowAddIngForm(true);
  };

  const handleStartEditIng = (ing: Ingredient) => {
    setEditingIng(ing);
    setShowAddIngForm(false);
    setIngFormName(ing.name);
    setIngFormCost(ing.costPrice);
    setIngFormUnit(ing.unit);
    setIngFormStock(ing.stock);
  };

  const handleIngSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingFormName.trim()) return;

    void (async () => {
      try {
        const unit = (['g', 'kg', 'ml', 'l', 'unit'].includes(ingFormUnit)
          ? ingFormUnit
          : 'unit') as 'g' | 'kg' | 'ml' | 'l' | 'unit';
        const baseUnit = unit === 'kg' ? 'g' : unit === 'l' ? 'ml' : unit;
        if (showAddIngForm) {
          await createIngredient({
            name: ingFormName.trim(),
            baseUnit,
            unitCostVnd: Math.max(0, Math.round(Number(ingFormCost) || 0)),
            lowStockThreshold: 0,
            isActive: true,
            stockInput:
              Number(ingFormStock) > 0
                ? { unit, quantity: Number(ingFormStock) }
                : null,
          });
          setShowAddIngForm(false);
        } else if (editingIng) {
          await updateIngredient(editingIng.id, {
            name: ingFormName.trim(),
            baseUnit,
            unitCostVnd: Math.max(0, Math.round(Number(ingFormCost) || 0)),
            lowStockThreshold: 0,
            isActive: true,
          });
          setEditingIng(null);
        }
        resetIngForm();
      } catch (error) {
        setDataError(
          error instanceof Error ? error.message : 'Không lưu được nguyên liệu.',
        );
      }
    })();
  };

  const handleDeleteIng = (_id: string) => {
    // Inventory archive is a P1 command; M1 keeps the visible list read-only.
    setDataError('Lưu trữ nguyên liệu chưa hỗ trợ ở M1.');
  };

  const handleAddTableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableName.trim()) return;
    void (async () => {
      try {
        await createTenantTable(activeTenantIdOrThrow(), newTableName.trim());
        setNewTableName('');
        void markOnboardingStep('tables');
      } catch (error) {
        setDataError(error instanceof Error ? error.message : 'Không thêm được bàn.');
      }
    })();
  };

  const handleStartEditingTable = (id: string, name: string) => {
    setEditingTableId(id);
    setEditingTableOriginalName(name);
  };

  const handleSaveTableName = (id: string) => {
    if (!editingTableOriginalName.trim()) return;
    void (async () => {
      try {
        await renameTenantTable(activeTenantIdOrThrow(), id, editingTableOriginalName.trim());
        setEditingTableId(null);
        setEditingTableOriginalName('');
      } catch (error) {
        setDataError(error instanceof Error ? error.message : 'Không sửa được bàn.');
      }
    })();
  };

  const handleDeleteTable = (id: string) => {
    if (tables.length <= 1) {
      return;
    }
    void (async () => {
      try {
        await archiveTenantTable(activeTenantIdOrThrow(), id, null);
      } catch (error) {
        setDataError(error instanceof Error ? error.message : 'Không lưu trữ được bàn.');
      }
    })();
  };

  // Chatbot parameters
  const [chatInput, setChatInput] = useState('');
  const [aiChatLogs, setAiChatLogs] = useState<Array<{ sender: 'user' | 'assistant'; text: string }>>([
    { sender: 'assistant', text: t('owner.ai.seed') }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  // QR Modal table selected
  const [selectedQrTableId, setSelectedQrTableId] = useState<string | null>(null);

  // Statistical calculations from paid orders
  const totalRevenue = orders.reduce((sum, order) => sum + (order.status === 'paid' ? order.total : 0), 0);
  const totalOrdersCount = orders.length;
  
  const totalCost = orders.reduce((sum, order) => {
    if (order.status !== 'paid') return sum;
    return sum + order.items.reduce((itemSum, item) => {
      const originalItem = menuItems.find(m => m.id === item.menuId);
      
      let itemCost = 0;
      if (originalItem && originalItem.recipe && originalItem.recipe.length > 0) {
        itemCost = originalItem.recipe.reduce((rSum, rItem) => {
          const ing = ingredients.find(i => i.id === rItem.ingredientId);
          return rSum + (ing ? ing.costPrice * rItem.quantity : 0);
        }, 0);
      } else {
        itemCost = originalItem ? originalItem.costPrice : (item.price * 0.4); 
      }
      
      return itemSum + (itemCost * item.quantity);
    }, 0);
  }, 0);

  const netProfit = totalRevenue - totalCost;

  // Unsplash Quick presets
  const PRESET_IMAGES = [
    { label: t('owner.preset.noodles'), url: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&q=80&w=600' },
    { label: t('owner.preset.cafe'), url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=600' },
    { label: t('owner.preset.bakery'), url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=600' },
    { label: t('owner.preset.drink'), url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&q=80&w=600' },
  ];

  // Best seller metrics
  const itemSalesMap: Record<string, { id: string; name: string; category: string; quantity: number, price: number, image: string }> = {};
  
  menuItems.forEach(m => {
    let baselineQty = 12;
    if (m.id === 'qa1') baselineQty = 48;
    if (m.id === 'qa3') baselineQty = 35;
    if (m.id === 'qa2') baselineQty = 24;
    if (m.id === 'qc1') baselineQty = 39;
    if (m.id === 'qc3') baselineQty = 31;

    itemSalesMap[m.id] = {
      id: m.id,
      name: m.name,
      category: m.category,
      quantity: baselineQty,
      price: m.price,
      image: m.image
    };
  });

  orders.forEach(order => {
    order.items.forEach(it => {
      if (itemSalesMap[it.menuId]) {
        itemSalesMap[it.menuId].quantity += it.quantity;
      } else {
        itemSalesMap[it.menuId] = {
          id: it.menuId,
          name: it.name,
          category: 'Món ăn',
          quantity: it.quantity,
          price: it.price,
          image: menuItems.find(m => m.id === it.menuId)?.image || 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&q=80&w=600'
        };
      }
    });
  });

  const topFavoriteDishes = Object.values(itemSalesMap)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 3);

  const maxPopularity = topFavoriteDishes.length > 0 ? topFavoriteDishes[0].quantity : 1;

  const handleStartOnboarding = () => {
    setOnboardStep(1);
    setOnboardCompleted(false);
  };

  const nextStep = () => {
    if (onboardStep === 1) {
      setOnboardStep(2);
    } else if (onboardStep === 2) {
      setOnboardStep(3);
    } else if (onboardStep === 3) {
      setTenantConfig({
        ...tenantConfig,
        shopName: tempShopName,
        industry: tempIndustry,
        pricingTier: tempTier,
        paymentMode: tempPayMode,
        loyaltyEnabled: tempTier !== 'Lite',
      });
      // Step 1 captures shop name and industry; step 2 captures plan; step 3
      // captures payment mode. Each maps to one approved checklist item.
      void markOnboardingStep('shopName');
      void markOnboardingStep('industry');
      void markOnboardingStep('plan');
      void markOnboardingStep('paymentMode');
      setOnboardStep(4);
    } else if (onboardStep === 4) {
      setOnboardCompleted(true);
    }
  };

  // Map the Owner form onto the frozen Catalog command fields. Money stays
  // integer VND and the server owns the public projection (REQ-CAT-001).
  const catalogFieldsFromForm = (): CatalogItemCommandFields => ({
    name: formName.trim(),
    description: formDescription.trim() || null,
    category: formCategory || 'Món nước',
    type: formType || 'Đồ ăn',
    priceVnd: Math.max(0, Math.round(Number(formPrice) || 0)),
    costPriceVnd: Math.max(0, Math.round(Number(formCostPrice) || 0)),
    imagePath: formImage.trim() || null,
    modifierGroups:
      formToppings.length > 0
        ? [
            {
              groupId: `topping_${Date.now()}`,
              name: 'Topping',
              selectionType: 'multiple' as const,
              isRequired: false,
              minSelections: 0,
              maxSelections: null,
              options: formToppings.map((topping, index) => ({
                optionId: `topping_${index}_${Date.now()}`,
                name: topping.name,
                priceDeltaVnd: Math.max(0, Math.round(topping.price)),
              })),
            },
          ]
        : [],
    recipeId: null,
    isAvailable: Number(formStockCount) > 0,
    stockCount: Math.max(0, Math.round(Number(formStockCount) || 0)),
  });

  const handleToggleStock = (id: string) => {
    const current = menuItems.find((item) => item.id === id);
    if (!current) return;
    void (async () => {
      try {
        await setMenuAvailability(id, !current.inStock);
      } catch (error) {
        setDataError(
          error instanceof Error ? error.message : 'Không đổi được tình trạng món.',
        );
      }
    })();
  };

  const resetForm = () => {
    setFormName('');
    setFormPrice(30000);
    setFormCostPrice(12000);
    setFormCategory('Món nước');
    setFormType('Đồ ăn');
    setFormDescription('');
    setFormImage('');
    setFormStockCount(50);
    setFormToppings([]);
    setNewToppingName('');
    setNewToppingPrice(0);
    setFormRecipe([]);
    setNewRecipeIngId('');
    setNewRecipeQty(0);
  };

  const handleStartAddForm = () => {
    resetForm();
    setEditingItem(null);
    setShowAddForm(true);
  };

  const handleAddDishSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    void (async () => {
      try {
        await createMenuItem(catalogFieldsFromForm());
        setShowAddForm(false);
        resetForm();
        void markOnboardingStep('menu');
      } catch (error) {
        setDataError(error instanceof Error ? error.message : 'Không thêm được món.');
      }
    })();
  };

  const handleStartEdit = (item: MenuItem) => {
    setEditingItem(item);
    setShowAddForm(false);
    setFormName(item.name);
    setFormPrice(item.price);
    setFormCostPrice(item.costPrice || Math.round(item.price * 0.4));
    setFormCategory(item.category);
    setFormType(item.type || 'Đồ ăn');
    setFormDescription(item.description || '');
    setFormImage(item.image);
    setFormStockCount(item.stockCount ?? 50);
    setFormToppings(item.toppings ? [...item.toppings] : []);
    setFormRecipe(item.recipe ? [...item.recipe] : []);
    setNewToppingName('');
    setNewToppingPrice(0);
    setNewRecipeIngId('');
    setNewRecipeQty(0);
  };

  const handleEditDishSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !formName.trim()) return;

    void (async () => {
      try {
        await updateMenuItem(editingItem.id, catalogFieldsFromForm());
        setEditingItem(null);
        resetForm();
      } catch (error) {
        setDataError(error instanceof Error ? error.message : 'Không sửa được món.');
      }
    })();
  };

  const handleArchiveDish = (id: string) => {
    void (async () => {
      try {
        await archiveMenuItem(id, null);
      } catch (error) {
        setDataError(error instanceof Error ? error.message : 'Không lưu trữ được món.');
      }
    })();
  };

  const handleUpdatePromoSettings = () => {
    setTenantConfig(prev => ({
      ...prev,
      discountCode: promoCode.trim().toUpperCase(),
      discountMinItems: Number(promoMinItems) || 1,
      discountMinAmount: Number(promoMinAmount) || 0,
      discountAmount: Number(promoAmount) || 0,
      discountEnabled: promoEnabled,
      discountTriggerType: promoTriggerType,
      discountConditionType: promoConditionType,
      discountTargetDishId: promoTargetDishId,
    }));
  };

  const handleAiQuestion = (question: string) => {
    setAiChatLogs(prev => [...prev, { sender: 'user', text: question }]);
    setIsTyping(true);

    setTimeout(() => {
      let answer = '';
      const qLower = question.toLowerCase();
      if (qLower.includes('lãi') || qLower.includes('lợi nhuận') || qLower.includes('doanh thu')) {
        answer = fillTemplate(t('owner.ai.answerProfit'), {
          revenue: totalRevenue.toLocaleString(),
          cost: totalCost.toLocaleString(),
          profit: netProfit.toLocaleString(),
          topDish: topFavoriteDishes[0]?.name || 'Phở',
        });
      } else if (qLower.includes('món ăn') || qLower.includes('bán chạy') || qLower.includes('yêu thích')) {
        answer = fillTemplate(t('owner.ai.answerTop'), {
          first: topFavoriteDishes[0]?.name || 'Phở',
          firstQty: topFavoriteDishes[0]?.quantity || 0,
          second: topFavoriteDishes[1]?.name || 'Đồ uống',
          secondQty: topFavoriteDishes[1]?.quantity || 0,
          third: topFavoriteDishes[2]?.name || 'Món phụ',
          thirdQty: topFavoriteDishes[2]?.quantity || 0,
        });
      } else if (qLower.includes('giảm giá') || qLower.includes('khuyến mãi') || qLower.includes('ưu đãi')) {
        answer = fillTemplate(t('owner.ai.answerPromo'), {
          code: tenantConfig.discountCode || 'MUANHIEU15K',
          minItems: tenantConfig.discountMinItems ?? 0,
          minAmount: tenantConfig.discountMinAmount?.toLocaleString() ?? '0',
          amount: tenantConfig.discountAmount?.toLocaleString() ?? '0',
        });
      } else if (qLower.includes('vận hành') || qLower.includes('nfc') || qLower.includes('qr')) {
        answer = t('owner.ai.answerNfc');
      } else {
        answer = fillTemplate(t('owner.ai.answerDefault'), {
          topDish: topFavoriteDishes[0]?.name || 'Phở Bò',
          code: promoCode,
        });
      }
      setAiChatLogs(prev => [...prev, { sender: 'assistant', text: answer }]);
      setIsTyping(false);
    }, 1000);
  };

  const submitCustomAiChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const q = chatInput;
    setChatInput('');
    handleAiQuestion(q);
  };

  const handleSimulateQrScan = (tableId: string) => {
    setSimulationTableId(tableId);
    setViewMode('customer');
    setSelectedQrTableId(null);
  };

  // STEP 1: ONBOARDING SETUP VIEW
  if (!onboardCompleted) {
    return (
      <div className="flex-grow flex flex-col bg-white p-[34px] font-sans justify-between text-[#2D2B30] h-full" id="owner-onboarding">
        <div>
          <div className="w-[50px] h-[50px] rounded-[21px] bg-[#F5F5F7] border border-[#B5C7D8] flex items-center justify-center mb-[13px]">
            <Building2 className="w-[24px] h-[24px] text-zinc-900" />
          </div>
          <h2 className="text-[24px] font-bold text-[#2D2B30] tracking-tight leading-tight">
            {t('owner.onboarding.title')}
          </h2>
          <p className="text-sm text-[#808080] mt-1 text-pretty font-medium">
            {t('owner.onboarding.subtitle')}
          </p>

          <div className="flex gap-1.5 mt-[13px]">
            {[1, 2, 3, 4].map(idx => (
              <div 
                key={idx} 
                className={`h-1 rounded-[21px] flex-1 transition-all duration-350 ${
                  idx <= onboardStep ? 'bg-zinc-900' : 'bg-[#E5E5EA]'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="my-[13px] flex-grow flex flex-col justify-center bg-white border border-[#B5C7D8] rounded-[21px] p-[13px] shadow-sm">
          {onboardStep === 1 && (
            <div className="space-y-[13px]">
              <span className="text-xs text-zinc-900 font-bold ">{t('owner.onboarding.step1')}</span>
              <h3 className="text-[16px] font-bold text-[#2D2B30]">{t('owner.onboarding.brandLabel')}</h3>
              
              <div className="space-y-[4px]">
                <label className="block text-xs text-[#7E7E7E] font-semibold ">{t('owner.onboarding.brandLabel')}</label>
                <input 
                  type="text" 
                  value={tempShopName} 
                  required
                  onChange={(e) => setTempShopName(e.target.value)}
                  className="w-full bg-[#F5F5F7] border border-[#B5C7D8] rounded-[21px] px-[13px] py-2.5 text-[14px] text-[#2D2B30] focus:outline-2 focus:outline-zinc-900 focus:outline-offset-2 font-semibold shadow-inner"
                  placeholder={t('owner.onboarding.brandPlaceholder')}
                />
              </div>

              <div className="space-y-[4px]">
                <label className="block text-xs text-[#7E7E7E] font-semibold mb-1.5">{t('owner.onboarding.modelLabel')}</label>
                <div className="grid grid-cols-2 gap-[13px]">
                  <button 
                    onClick={() => { setTempIndustry('quan_an'); setTempShopName('Phở Truyền Thuyết Kinh Kỳ'); }}
                    className={`p-[13px] rounded-[21px] border text-center flex flex-col items-center gap-1.5 transition-all shadow-sm ${
                      tempIndustry === 'quan_an' 
                        ? 'bg-zinc-900 text-white border-zinc-900' 
                        : 'bg-white border-[#B5C7D8] text-[#2D2B30] hover:bg-[#F5F5F7]'
                    }`}
                  >
                    <UtensilsCrossed className="w-5 h-5" />
                    <span className="text-xs font-semibold ">{t('owner.onboarding.modelRestaurant')}</span>
                  </button>
                  <button 
                    onClick={() => { setTempIndustry('quan_cafe'); setTempShopName('Cà Phê Rang Muối Cổ Đô'); }}
                    className={`p-[13px] rounded-[21px] border text-center flex flex-col items-center gap-1.5 transition-all shadow-sm ${
                      tempIndustry === 'quan_cafe' 
                        ? 'bg-zinc-900 text-white border-zinc-900' 
                        : 'bg-white border-[#B5C7D8] text-[#2D2B30] hover:bg-[#F5F5F7]'
                    }`}
                  >
                    <Coffee className="w-5 h-5" />
                    <span className="text-xs font-semibold ">{t('owner.onboarding.modelCafe')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {onboardStep === 2 && (
            <div className="space-y-[13px]">
              <span className="text-xs text-zinc-900 font-bold ">{t('owner.onboarding.step2')}</span>
              <h3 className="text-[16px] font-bold text-[#2D2B30]">{t('owner.onboarding.choosePlan')}</h3>
              
              <div className="space-y-[4px]">
                <button 
                  onClick={() => setTempTier('Pro')}
                  className={`w-full p-[13px] rounded-[21px] border text-left transition-all flex items-center justify-between shadow-xs ${
                    tempTier === 'Pro' ? 'bg-zinc-900/5 text-[#2D2B30] border-zinc-900' : 'bg-white text-gray-700 border-[#B5C7D8]'
                  }`}
                >
                  <div className="space-y-0.5 max-w-[80%]">
                    <div className="text-sm font-bold flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" /> PRO AI
                    </div>
                    <p className="text-xs text-[#707070]">{t('owner.onboarding.proDesc')}</p>
                  </div>
                  <span className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-250 px-2 py-0.5 rounded-[21px] font-bold">{t('owner.onboarding.free')}</span>
                </button>
              </div>
            </div>
          )}

          {onboardStep === 3 && (
            <div className="space-y-[13px]">
              <span className="text-xs text-zinc-900 font-bold ">{t('owner.onboarding.step3')}</span>
              <h3 className="text-[16px] font-bold text-[#2D2B30]">{t('owner.onboarding.cashierFlow')}</h3>
              
              <div className="grid grid-cols-2 gap-[13px]">
                <button 
                  onClick={() => setTempPayMode('Pay-Later')}
                  className={`p-[13px] rounded-[21px] border text-center flex flex-col items-center gap-[4px] transition-all shadow-xs ${
                    tempPayMode === 'Pay-Later' ? 'bg-zinc-900/5 text-[#2D2B30] border-zinc-900' : 'bg-white border-[#B5C7D8] text-[#2D2B30]'
                  }`}
                >
                  <Receipt className="w-5 h-5 text-zinc-900" />
                  <div className="text-xs font-bold leading-tight">{t('owner.onboarding.payLater')}<br/><span className="text-[8px] font-medium">{t('owner.onboarding.payLaterHint')}</span></div>
                </button>
                <button 
                  onClick={() => setTempPayMode('Pay-First')}
                  className={`p-[13px] rounded-[21px] border text-center flex flex-col items-center gap-[4px] transition-all shadow-xs ${
                    tempPayMode === 'Pay-First' ? 'bg-zinc-900/5 text-[#2D2B30] border-zinc-900' : 'bg-white border-[#B5C7D8] text-[#2D2B30]'
                  }`}
                >
                  <CreditCard className="w-5 h-5 text-zinc-900" />
                  <div className="text-xs font-bold leading-tight">{t('owner.onboarding.payFirst')}<br/><span className="text-[8px] font-medium">{t('owner.onboarding.payFirstHint')}</span></div>
                </button>
              </div>
            </div>
          )}

          {onboardStep === 4 && (
            <div className="space-y-[13px] text-[#2D2B30]">
              <div className="w-[40px] h-[40px] rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-2">
                <Check className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="text-[16px] font-bold text-[#2D2B30] text-center">{t('owner.onboarding.doneTitle')}</h3>
              <p className="text-sm text-[#707070] text-center">
                {t('owner.onboarding.doneBody')}
              </p>
            </div>
          )}
        </div>

        <button 
          onClick={nextStep}
          className="w-full bg-zinc-900 hover:bg-zinc-900/90 active:translate-y-0.5 text-white py-3.5 rounded-[21px] font-semibold text-[14px] flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
        >
          {onboardStep === 4 ? t('owner.onboarding.activate') : t('owner.onboarding.next')}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // STEP 2: FULL OWNER LIVE DASHBOARD
  return (
    <div className="flex-grow flex flex-col bg-white font-sans text-[#2D2B30] h-full" id="owner-workspace">
      
      <div className="flex-grow overflow-y-auto p-[13px] space-y-[13px] bg-white">
        {dataError && (
          <p role="alert" className="rounded-[21px] border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700">
            {dataError}
          </p>
        )}
        
        {/* Branch Info Ribbon */}
        <div className="bg-[#F5F5F7] p-[13px] rounded-[21px] border border-[#B5C7D8]/60 shadow-xs relative overflow-hidden select-none">
          <div className="flex justify-between items-start">
            <div className="space-y-[2px]">
              <span className="text-[9px] font-bold text-[#808080] block">{t('owner.dashboard.livePlatform')}</span>
              <h3 className="text-[16px] font-bold text-[#2D2B30]">{tenantConfig.shopName}</h3>
              <p className="text-sm text-[#454547] font-medium">{t('owner.dashboard.modelLabel')} {
                tenantConfig.industry === 'quan_an' ? t('owner.onboarding.modelRestaurant') : 
                t('owner.onboarding.modelCafe')
              }</p>
            </div>
            <div className="text-right flex flex-col items-end gap-1 select-none">
              <span className="inline-block text-xs font-bold text-zinc-900 bg-zinc-900/10 border border-zinc-900/20 px-2 py-0.5 rounded-[21px]">
                {t('owner.dashboard.plan')} {tenantConfig.pricingTier.toUpperCase()}
              </span>
              <p className="text-[9px] text-[#808080] font-semibold ">{t('owner.dashboard.workspaceOwner')}</p>
            </div>
          </div>

          <div className="flex gap-1.5 mt-2.5">
            <button 
              onClick={handleStartOnboarding}
              className="flex items-center gap-1 text-xs text-[#2D2B30] hover:bg-gray-100 bg-white px-2.5 py-1 rounded-[21px] border border-[#B5C7D8] font-semibold transition-all cursor-pointer focus:outline-2 focus:outline-zinc-900"
            >
              <RefreshCw className="w-3 h-3 text-zinc-900" /> {t('owner.dashboard.resetModel')}
            </button>
          </div>

          {/* Server-owned onboarding checklist (REQ-ONB-001) */}
          {onboardingChecklist && (
            <div className="mt-3 rounded-[21px] border border-[#B5C7D8] bg-white p-2.5" data-testid="onboarding-checklist">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[#2D2B30] uppercase tracking-wider">
                  {t('owner.dashboard.setup')}
                </span>
                <span className="text-[10px] font-bold text-[#155BD0]">
                  {onboardingChecklist.completedCount}/{onboardingChecklist.totalCount}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#F5F5F7]">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${onboardingChecklist.completionPercent}%` }}
                />
              </div>
              {onboardingChecklist.isComplete ? (
                <p className="mt-2 text-[10px] font-semibold text-emerald-700">{t('owner.dashboard.setupComplete')}</p>
              ) : (
                <p className="mt-2 text-[10px] font-semibold text-[#707070]">
                  {t('owner.dashboard.nextStep')}{' '}
                  {t(ONBOARDING_STEP_LABEL_KEYS[onboardingChecklist.nextIncompleteStep ?? 'shopName'])}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {onboardingStepIds.map(stepId => {
                  const step = onboardingChecklist.steps.find(s => s.step === stepId);
                  return (
                    <span
                      key={stepId}
                      className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${
                        step?.isComplete
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-[#B5C7D8] bg-[#F5F5F7] text-[#808080]'
                      }`}
                    >
                      {step?.isComplete ? '✓ ' : ''}{t(ONBOARDING_STEP_LABEL_KEYS[stepId])}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Tab Selection Row adhering to minimalist Claude design */}
        <div className="grid grid-cols-7 bg-[#F5F5F7] p-1 rounded-[21px] border border-[#B5C7D8]/50 text-[11px] font-semibold select-none overflow-x-auto whitespace-nowrap scrollbar-none">
          <button 
            onClick={() => { setActiveTab('kpi'); setShowAddForm(false); setEditingItem(null); setShowAddStaff(false); setShowAddIngForm(false); setEditingIng(null); }}
            className={`py-1.5 px-3 rounded-[21px] transition-all flex justify-center items-center ${
              activeTab === 'kpi' ? 'bg-white text-[#2D2B30] font-bold border border-[#B5C7D8] shadow-sm' : 'text-[#808080] hover:text-[#2D2B30]'
            }`}
          >
            {t('owner.tab.report')}
          </button>
          <button 
            onClick={() => { setActiveTab('menu'); setShowAddStaff(false); setShowAddIngForm(false); setEditingIng(null); }}
            className={`py-1.5 px-3 rounded-[21px] transition-all flex justify-center items-center ${
              activeTab === 'menu' ? 'bg-white text-[#2D2B30] font-bold border border-[#B5C7D8] shadow-sm' : 'text-[#808080] hover:text-[#2D2B30]'
            }`}
          >
            {t('owner.tab.menu')}
          </button>
          <button 
            onClick={() => { setActiveTab('kho'); setShowAddForm(false); setEditingItem(null); setShowAddStaff(false); }}
            className={`py-1.5 px-3 rounded-[21px] transition-all flex justify-center items-center ${
              activeTab === 'kho' ? 'bg-white text-[#2D2B30] font-bold border border-[#B5C7D8] shadow-sm' : 'text-[#808080] hover:text-[#2D2B30]'
            }`}
          >
            {t('owner.tab.inventory')}
          </button>
          <button 
            onClick={() => { setActiveTab('nfc'); setShowAddForm(false); setEditingItem(null); setShowAddStaff(false); setShowAddIngForm(false); setEditingIng(null); }}
            className={`py-1.5 px-3 rounded-[21px] transition-all flex justify-center items-center ${
              activeTab === 'nfc' ? 'bg-white text-[#2D2B30] font-bold border border-[#B5C7D8] shadow-sm' : 'text-[#808080] hover:text-[#2D2B30]'
            }`}
          >
            {t('owner.tab.tables')}
          </button>
          <button 
            onClick={() => { setActiveTab('staff'); setShowAddForm(false); setEditingItem(null); setShowAddIngForm(false); setEditingIng(null); }}
            className={`py-1.5 px-3 rounded-[21px] transition-all flex justify-center items-center ${
              activeTab === 'staff' ? 'bg-white text-[#2D2B30] font-bold border border-[#B5C7D8] shadow-sm' : 'text-[#808080] hover:text-[#2D2B30]'
            }`}
          >
            {t('owner.tab.staff')}
          </button>

          <button 
            onClick={() => { setActiveTab('ai'); setShowAddForm(false); setEditingItem(null); setShowAddStaff(false); setShowAddIngForm(false); setEditingIng(null); }}
            className={`py-1.5 px-3 rounded-[21px] transition-all flex justify-center items-center relative ${
              activeTab === 'ai' ? 'bg-white text-[#2D2B30] font-bold border border-[#B5C7D8] shadow-sm' : 'text-[#808080] hover:text-[#2D2B30]'
            }`}
          >
            {t('owner.tab.ai')}
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
          </button>
        </div>

        {/* REPORT KPI VIEW */}
        {activeTab === 'kpi' && (
          <div className="space-y-[13px] animate-fadeIn">
            <div className="grid grid-cols-2 gap-[13px]">
              <div className="bg-white p-[13px] rounded-[21px] border border-[#B5C7D8] shadow-xs">
                <span className="text-xs text-[#808080] block font-bold ">{t('owner.kpi.revenue')}</span>
                <span className="text-[21px] font-bold text-[#2D2B30] mt-0.5 block ">
                  {totalRevenue.toLocaleString()}đ
                </span>
                <span className="text-xs text-emerald-800 font-semibold block mt-0.5">{t('owner.kpi.realtimePos')}</span>
              </div>

              <div className="bg-white p-[13px] rounded-[21px] border border-[#B5C7D8] shadow-xs">
                <span className="text-xs text-[#808080] block font-bold ">{t('owner.kpi.profit')}</span>
                <span className="text-[21px] font-bold text-zinc-900 mt-0.5 block ">
                  {netProfit.toLocaleString()}đ
                </span>
                <span className="text-xs text-[#808080] block mt-0.5 font-sans leading-none">{t('owner.kpi.costPrefix')} {totalCost.toLocaleString()}đ</span>
              </div>
            </div>

            {/* Top seller analysis block */}
            <div className="bg-white p-[13px] rounded-[21px] border border-[#B5C7D8] shadow-xs space-y-[13px]">
              <div className="flex justify-between items-center border-b border-[#B5C7D8]/30 pb-2">
                <span className="text-sm font-bold text-[#2D2B30] flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-zinc-900" /> {t('owner.kpi.topDishes')}
                </span>
                <span className="text-xs bg-[#F5F5F7] border border-[#B5C7D8] text-[#454547] px-2 py-0.5 rounded-[21px] font-bold leading-none select-none">{t('owner.kpi.liveChart')}</span>
              </div>

              <div className="space-y-[13px] pt-1">
                {topFavoriteDishes.map((dish, i) => {
                  const percent = Math.max(15, Math.min(100, Math.round((dish.quantity / maxPopularity) * 100)));
                  return (
                    <div key={dish.id} className="space-y-[4px]">
                      <div className="flex justify-between items-center text-sm ">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
                            i === 0 ? 'bg-zinc-900' : i === 1 ? 'bg-slate-500' : 'bg-slate-400'
                          }`}>
                            {i + 1}
                          </span>
                          <span className="font-semibold text-[#2D2B30] truncate">{dish.name}</span>
                          <span className="text-xs text-[#808080] flex-shrink-0">({dish.category})</span>
                        </div>
                        <span className="font-semibold text-[#2D2B30] flex-shrink-0 ">{dish.quantity} {t('owner.kpi.ordersSuffix')}</span>
                      </div>
                      
                      <div className="w-full bg-[#F5F5F7] rounded-full h-2 overflow-hidden border border-[#B5C7D8]/30">
                        <div 
                          className="h-full rounded-full transition-all duration-500 bg-zinc-900"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Core Loyalty members stats */}
            {tenantConfig.loyaltyEnabled && (
              <div className="bg-white p-[13px] rounded-[21px] border border-[#B5C7D8] shadow-xs">
                <div className="flex justify-between items-center border-b border-[#B5C7D8]/30 pb-2">
                  <span className="text-sm font-bold text-[#2D2B30] flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-zinc-900" /> {t('owner.kpi.loyalty')} ({loyaltyMembers.length} {t('owner.kpi.peopleSuffix')})
                  </span>
                  <span className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-250 px-2 py-0.5 rounded-[21px] font-semibold select-none">{t('owner.kpi.growth')}</span>
                </div>
                
                <div className="mt-2.5 space-y-1.5 max-h-[120px] overflow-y-auto">
                  {loyaltyMembers.map((member) => (
                    <div key={member.phone} className="flex justify-between text-sm bg-[#F5F5F7] p-2 rounded-[21px] border border-[#B5C7D8] tracking-tight">
                      <div>
                        <div className="font-semibold text-[#2D2B30]">{member.name || t('owner.kpi.newMember')}</div>
                        <div className="text-[#808080] text-xs ">{t('owner.kpi.phonePrefix')} {member.phone} • {t('owner.kpi.visitsPrefix')} {member.visits} {t('owner.kpi.timesSuffix')}</div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-zinc-900 ">{member.points} {t('owner.kpi.pointsSuffix')}</span>
                        <div className="text-[#808080] text-xs font-light">{member.isVerified ? t('owner.kpi.verified') : t('owner.kpi.pending')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* MENU SETTINGS VIEW */}
        {activeTab === 'menu' && (
          <div className="space-y-[13px] animate-fadeIn">
            
            <div className="flex justify-between items-center select-none">
              <div>
                <span className="text-sm font-bold text-[#2D2B30]">{t('owner.menu.heading')}</span>
                <p className="text-xs text-[#808080] leading-none mt-0.5">{t('owner.menu.headingHint')}</p>
              </div>
              
              <button 
                onClick={handleStartAddForm}
                className="bg-zinc-900 hover:bg-zinc-900/90 text-white text-sm px-[13px] py-2 rounded-[21px] flex items-center gap-1 transition-all cursor-pointer font-semibold shadow-xs focus:outline-2 focus:outline-zinc-900"
              >
                <Plus className="w-3.5 h-3.5" /> {t('owner.menu.addDish')}
              </button>
            </div>

            {/* Campaign coupon manager inside menu settings */}
            <div className="bg-[#F5F5F7] p-[13px] rounded-[21px] border border-[#B5C7D8] space-y-3 relative overflow-hidden text-[#2D2B30]">
              <div className="flex items-center gap-1.5 border-b border-[#B5C7D8]/60 pb-2">
                <Gift className="w-4 h-4 text-zinc-900" />
                <span className="text-sm font-bold text-[#2D2B30] ">{t('owner.menu.promoHeading')}</span>
                <span className="text-xs bg-white border border-[#B5C7D8] text-zinc-900 px-2 py-0.5 rounded-[21px] font-bold ml-auto ">{t('owner.menu.couponCode')}</span>
              </div>

              <div className="grid grid-cols-2 gap-[13px] text-sm ">
                <div className="space-y-[4px]">
                  <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.menu.promoCode')}</label>
                  <input 
                    type="text" 
                    value={promoCode} 
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 text-sm text-[#2D2B30] font-bold focus:outline-none focus:border-zinc-900"
                    placeholder={t('owner.menu.promoCodePlaceholder')}
                  />
                </div>
                
                <div className="space-y-[4px]">
                  <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.menu.discountAmount')}</label>
                  <input 
                    type="number" 
                    value={promoAmount} 
                    onChange={(e) => setPromoAmount(Number(e.target.value))}
                    className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 text-sm text-[#2D2B30] font-bold focus:outline-none focus:border-zinc-900 "
                  />
                </div>

                <div className="space-y-[4px]">
                  <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.menu.trigger')}</label>
                  <select
                    value={promoTriggerType}
                    onChange={(e) => setPromoTriggerType(e.target.value as 'auto' | 'manual')}
                    className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 text-xs font-semibold text-[#2D2B30] focus:outline-none"
                  >
                    <option value="auto">{t('owner.menu.triggerAuto')}</option>
                    <option value="manual">{t('owner.menu.triggerManual')}</option>
                  </select>
                </div>

                <div className="space-y-[4px]">
                  <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.menu.condition')}</label>
                  <select
                    value={promoConditionType}
                    onChange={(e) => setPromoConditionType(e.target.value as 'amount' | 'quantity' | 'both')}
                    className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 text-xs font-semibold text-[#2D2B30] focus:outline-none"
                  >
                    <option value="amount">{t('owner.menu.conditionAmount')}</option>
                    <option value="quantity">{t('owner.menu.conditionQuantity')}</option>
                    <option value="both">{t('owner.menu.conditionBoth')}</option>
                  </select>
                </div>

                <div className="space-y-[4px]">
                  <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.menu.minItems')}</label>
                  <input 
                    type="number" 
                    disabled={promoConditionType === 'amount'}
                    value={promoMinItems} 
                    onChange={(e) => setPromoMinItems(Number(e.target.value))}
                    className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 text-sm text-[#2D2B30] font-bold focus:outline-none disabled:opacity-40 "
                  />
                </div>

                <div className="space-y-[4px]">
                  <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.menu.minAmount')}</label>
                  <input 
                    type="number" 
                    disabled={promoConditionType === 'quantity'}
                    value={promoMinAmount} 
                    onChange={(e) => setPromoMinAmount(Number(e.target.value))}
                    className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 text-sm text-[#2D2B30] font-bold focus:outline-none disabled:opacity-40 "
                  />
                </div>

                <div className="space-y-[4px] col-span-2">
                  <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.menu.targetDish')}</label>
                  <select
                    value={promoTargetDishId}
                    onChange={(e) => setPromoTargetDishId(e.target.value)}
                    className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 text-xs font-semibold text-[#2D2B30] focus:outline-none"
                  >
                    <option value="all">{t('owner.menu.targetAll')}</option>
                    {menuItems.map(m => (
                      <option key={m.id} value={m.id}>{t('owner.menu.targetItem')} {m.name} ({m.price.toLocaleString()}đ)</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#B5C7D8]/45">
                <label className="flex items-center gap-1.5 text-sm text-[#2D2B30] selection:bg-transparent font-medium cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={promoEnabled}
                    onChange={(e) => setPromoEnabled(e.target.checked)}
                    className="rounded text-zinc-900 focus:ring-zinc-900 w-3.5 h-3.5"
                  />
                  <span>{t('owner.menu.applyCampaign')}</span>
                </label>

                <button 
                  onClick={handleUpdatePromoSettings}
                  className="bg-zinc-900 hover:bg-zinc-900/90 text-white text-sm font-semibold px-4 py-1.5 rounded-[21px] cursor-pointer shadow-xs focus:outline-2 focus:outline-zinc-900"
                >
                  {t('owner.menu.applyChanges')}
                </button>
              </div>

              <p className="text-xs text-[#707070] italic leading-relaxed bg-white p-2.5 rounded-[21px] border border-[#B5C7D8]">
                {t('owner.menu.campaignSummary').split('{code}')[0]}<strong>{promoCode}</strong>{t('owner.menu.campaignSummary').split('{code}')[1].split('{amount}')[0]}<strong>{promoAmount.toLocaleString()}đ</strong>{t('owner.menu.campaignSummary').split('{amount}')[1].split('{timing}')[0]}{promoTriggerType === 'auto' ? t('owner.menu.campaignAuto') : t('owner.menu.campaignManual')}
              </p>
            </div>

            {/* Menu item setup Form */}
            {(showAddForm || editingItem) && (
              <form 
                onSubmit={showAddForm ? handleAddDishSubmit : handleEditDishSubmit}
                className="bg-white border border-zinc-900 p-[13px] rounded-[21px] space-y-3 shadow-md text-sm text-[#2D2B30]"
              >
                <div className="flex justify-between items-center border-b border-[#B5C7D8]/30 pb-2">
                  <span className="font-bold text-[#2D2B30] ">
                    {showAddForm ? t('owner.menu.addDishTitle') : t('owner.menu.editDishTitle')}
                  </span>
                  <button 
                    type="button" 
                    onClick={() => { setShowAddForm(false); setEditingItem(null); }}
                    className="text-[#808080] font-bold hover:text-red-500 font-sans"
                  >
                    {t('owner.menu.cancelTitle')}
                  </button>
                </div>

                <div className="space-y-[13px]">
                  <div className="space-y-[4px]">
                    <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.menu.productName')}</label>
                    <input 
                      type="text" 
                      required
                      value={formName} 
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 focus:outline-2 focus:outline-zinc-900 font-semibold text-sm "
                      placeholder={t('owner.menu.productNamePlaceholder')}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-[13px]">
                    <div className="space-y-[4px]">
                      <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.menu.sellPrice')}</label>
                      <input 
                        type="number" 
                        required
                        value={formPrice} 
                        onChange={(e) => setFormPrice(Number(e.target.value))}
                        className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 focus:outline-2 focus:outline-zinc-900 font-semibold text-sm "
                      />
                    </div>
                    <div className="space-y-[4px]">
                      <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.menu.costPrice')}</label>
                      <input 
                        type="number" 
                        required
                        value={formCostPrice} 
                        onChange={(e) => setFormCostPrice(Number(e.target.value))}
                        className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 focus:outline-2 focus:outline-zinc-900 font-semibold text-sm "
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-[13px]">
                    <div className="space-y-[4px]">
                      <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.menu.category')}</label>
                      <select 
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-1.5 py-1.5 font-semibold text-sm "
                      >
                        <option value="Món nước">{t('owner.category.noodles')}</option>
                        <option value="Khô & Bún">{t('owner.category.dry')}</option>
                        <option value="Ăn kèm">{t('owner.category.side')}</option>
                        <option value="Đồ uống">{t('owner.category.drink')}</option>
                        <option value="Tráng miệng">{t('owner.category.dessert')}</option>
                      </select>
                    </div>
                    <div className="space-y-[4px]">
                      <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.menu.type')}</label>
                      <input 
                        type="text"
                        required
                        value={formType}
                        onChange={(e) => setFormType(e.target.value)}
                        className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-2.5 py-1.5 font-semibold text-sm "
                        placeholder={t('owner.menu.typePlaceholder')}
                      />
                    </div>
                    <div className="space-y-[4px]">
                      <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.menu.stock')}</label>
                      <input 
                        type="number" 
                        required
                        value={formStockCount} 
                        onChange={(e) => setFormStockCount(Number(e.target.value))}
                        className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-2 py-1.5 font-semibold text-sm "
                      />
                    </div>
                  </div>

                  <div className="space-y-[4px]">
                    <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.menu.description')}</label>
                    <textarea 
                      value={formDescription} 
                      onChange={(e) => setFormDescription(e.target.value)}
                      className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 h-12"
                      placeholder={t('owner.menu.descriptionPlaceholder')}
                    />
                  </div>

                  <div className="space-y-[4px]">
                    <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.menu.imageUrl')}</label>
                    <input 
                      type="text" 
                      value={formImage} 
                      onChange={(e) => setFormImage(e.target.value)}
                      className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 text-sm "
                      placeholder={t('owner.menu.imagePlaceholder')}
                    />
                    
                    <div className="flex gap-1.5 pt-1 overflow-x-auto whitespace-nowrap scrollbar-none">
                      {PRESET_IMAGES.map(preset => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setFormImage(preset.url)}
                          className={`text-xs font-semibold px-2.5 py-1.5 rounded-[21px] border transition-all ${
                            formImage === preset.url ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-[#F5F5F7] border-[#B5C7D8] text-[#2D2B30]'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-[4px]">
                    <label className="block text-[10px] uppercase text-[#808080] font-bold select-none">{t('owner.menu.toppings')}</label>
                    {formToppings.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {formToppings.map((t, i) => (
                          <span key={i} className="inline-flex items-center gap-1 bg-[#F5F5F7] border border-[#B5C7D8] rounded-[21px] px-2 py-0.5 text-[10px] font-semibold">
                            {t.name} <span className="font-mono text-[#155BD0]">+{t.price.toLocaleString()}đ</span>
                            <button type="button" onClick={() => setFormToppings(prev => prev.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700 font-bold ml-0.5">&times;</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <input type="text" value={newToppingName} onChange={(e) => setNewToppingName(e.target.value)} placeholder={t('owner.menu.toppingName')} className="flex-1 bg-white border border-[#B5C7D8] rounded-[21px] px-2.5 py-1.5 text-[11px] focus:outline-2 focus:outline-[#155BD0]" />
                      <input type="number" min={0} value={newToppingPrice} onChange={(e) => setNewToppingPrice(Number(e.target.value))} placeholder={t('owner.menu.toppingPrice')} className="w-20 bg-white border border-[#B5C7D8] rounded-[21px] px-2 py-1.5 text-[11px] tabular-nums focus:outline-2 focus:outline-[#155BD0]" />
                      <button type="button" onClick={() => { if (newToppingName.trim() && newToppingPrice >= 0) { setFormToppings(prev => [...prev, { name: newToppingName.trim(), price: newToppingPrice }]); setNewToppingName(''); setNewToppingPrice(0); } }} className="bg-[#155BD0] hover:bg-[#155BD0]/90 text-white text-[10px] font-bold px-3 rounded-[21px] cursor-pointer">{t('owner.menu.add')}</button>
                    </div>
                  </div>

                  {/* Recipe selection */}
                  <div className="space-y-[4px]">
                    <label className="block text-[10px] uppercase text-[#808080] font-bold select-none">{t('owner.menu.recipe')}</label>
                    {formRecipe.length > 0 && (
                      <div className="flex flex-col gap-1.5 mb-2">
                        {formRecipe.map((r, i) => {
                          const ing = ingredients.find(x => x.id === r.ingredientId);
                          return (
                            <div key={i} className="flex justify-between items-center bg-[#F5F5F7] border border-[#B5C7D8] rounded-[21px] px-2.5 py-1.5 text-[11px] font-semibold">
                              <span>{ing?.name || t('owner.menu.ingredient')} <span className="text-[#808080] font-normal">({r.quantity} {ing?.unit})</span></span>
                              <button type="button" onClick={() => setFormRecipe(prev => prev.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <select value={newRecipeIngId} onChange={(e) => setNewRecipeIngId(e.target.value)} className="flex-1 bg-white border border-[#B5C7D8] rounded-[21px] px-2.5 py-1.5 text-[11px] font-semibold focus:outline-2 focus:outline-zinc-900">
                        <option value="">{t('owner.menu.chooseIngredient')}</option>
                        {ingredients.map(ing => (
                          <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                        ))}
                      </select>
                      <input type="number" min={0} step="0.01" value={newRecipeQty} onChange={(e) => setNewRecipeQty(Number(e.target.value))} placeholder="SL" className="w-16 bg-white border border-[#B5C7D8] rounded-[21px] px-2 py-1.5 text-[11px] tabular-nums focus:outline-2 focus:outline-zinc-900" />
                      <button type="button" onClick={() => { if (newRecipeIngId && newRecipeQty > 0) { setFormRecipe(prev => [...prev, { ingredientId: newRecipeIngId, quantity: newRecipeQty }]); setNewRecipeIngId(''); setNewRecipeQty(0); } }} className="bg-zinc-900 hover:bg-zinc-900/90 text-white text-[10px] font-bold px-3 rounded-[21px] cursor-pointer">{t('owner.menu.add')}</button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2 border-t border-[#B5C7D8]/30">
                  <button 
                    type="submit"
                    className="flex-1 bg-zinc-900 hover:bg-zinc-900/95 text-white font-semibold py-2.5 rounded-[21px]"
                  >
                    {showAddForm ? t('owner.menu.confirmAdd') : t('owner.menu.confirmEdit')}
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setShowAddForm(false); setEditingItem(null); }}
                    className="bg-transparent text-[#808080] px-4 hover:underline py-2 rounded-[21px] font-semibold"
                  >
                    {t('owner.menu.skip')}
                  </button>
                </div>
              </form>
            )}

            {/* Main Menu Management Listings */}
            <div className="space-y-[4px] max-h-[300px] overflow-y-auto pr-1">
              {menuItems.map(item => (
                <div 
                  key={item.id} 
                  className={`p-3 rounded-2xl flex gap-3 border transition-all shadow-sm ${
                    item.inStock ? 'bg-white border-zinc-200 hover:border-zinc-300' : 'bg-zinc-50 border-zinc-200 opacity-60'
                  }`}
                >
                  <img src={item.image} alt={item.name} className="w-14 h-14 rounded-xl object-cover border border-zinc-200 flex-shrink-0" referrerPolicy="no-referrer" />
                  
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-zinc-900 truncate">{item.name}</h4>
                        <div className="text-sm font-bold text-zinc-900 mt-0.5">{item.price.toLocaleString()}đ</div>
                      </div>
                      
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button 
                          type="button"
                          onClick={() => handleStartEdit(item)}
                          className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          type="button"
                          onClick={() => handleArchiveDish(item.id)}
                          className="p-1.5 text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-zinc-100">
                      <div className="flex items-center gap-2 text-[9px] text-zinc-500 tracking-tight flex-wrap">
                        <span>{t('owner.menu.costLabel')} {(item.costPrice || Math.round(item.price*0.4)).toLocaleString()}đ</span>
                        <span>{t('owner.menu.stockLabel')} {item.stockCount}</span>
                      </div>
                      
                      <button 
                        type="button"
                        onClick={() => handleToggleStock(item.id)}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold transition-colors flex-shrink-0 ${
                          item.inStock 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : 'bg-zinc-200 text-zinc-600'
                        }`}
                      >
                        {item.inStock ? t('owner.menu.onSale') : t('owner.menu.hidden')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* KHO / NGUYEN LIEU VIEW */}
        {activeTab === 'kho' && (
          <div className="space-y-[13px] animate-fadeIn">
            <div className="flex justify-between items-center">
              <div className="space-y-[4px]">
                <h4 className="text-sm font-bold text-[#2D2B30]">{t('owner.inventory.heading')}</h4>
                <p className="text-[11px] text-[#707070] font-medium leading-relaxed">
                  {t('owner.inventory.hint')}
                </p>
              </div>
              {!showAddIngForm && (
                <button 
                  onClick={handleStartAddIng}
                  className="bg-zinc-900 hover:bg-zinc-900/90 text-white text-sm px-[13px] py-1.5 rounded-[21px] flex items-center gap-1 shadow-sm font-semibold transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> {t('owner.inventory.add')}
                </button>
              )}
            </div>

            {(showAddIngForm || editingIng) && (
              <form onSubmit={handleIngSubmit} className="bg-[#F5F5F7] p-[13px] rounded-[21px] border border-[#B5C7D8] shadow-sm animate-fadeIn space-y-[13px]">
                <div className="space-y-[4px]">
                  <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.inventory.name')}</label>
                  <input 
                    type="text" 
                    required
                    value={ingFormName} 
                    onChange={(e) => setIngFormName(e.target.value)}
                    className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 focus:outline-2 focus:outline-zinc-900 font-semibold text-sm "
                    placeholder={t('owner.inventory.namePlaceholder')}
                  />
                </div>

                <div className="grid grid-cols-3 gap-[13px]">
                  <div className="space-y-[4px]">
                    <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.inventory.cost')}</label>
                    <input 
                      type="number" 
                      required
                      value={ingFormCost} 
                      onChange={(e) => setIngFormCost(Number(e.target.value))}
                      className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 focus:outline-2 focus:outline-zinc-900 font-semibold text-sm "
                    />
                  </div>
                  <div className="space-y-[4px]">
                    <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.inventory.unit')}</label>
                    <input 
                      type="text" 
                      required
                      value={ingFormUnit} 
                      onChange={(e) => setIngFormUnit(e.target.value)}
                      className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 focus:outline-2 focus:outline-zinc-900 font-semibold text-sm "
                      placeholder={t('owner.inventory.unitPlaceholder')}
                    />
                  </div>
                  <div className="space-y-[4px]">
                    <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.inventory.stock')}</label>
                    <input 
                      type="number" 
                      required
                      value={ingFormStock} 
                      onChange={(e) => setIngFormStock(Number(e.target.value))}
                      className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 focus:outline-2 focus:outline-zinc-900 font-semibold text-sm "
                    />
                  </div>
                </div>
                
                <div className="flex gap-2.5 pt-2 border-t border-[#B5C7D8]/30">
                  <button 
                    type="submit"
                    className="flex-1 bg-zinc-900 hover:bg-zinc-900/95 text-white font-semibold py-2.5 rounded-[21px]"
                  >
                    {showAddIngForm ? t('owner.inventory.save') : t('owner.inventory.update')}
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setShowAddIngForm(false); setEditingIng(null); }}
                    className="bg-transparent text-[#808080] px-4 hover:underline py-2 rounded-[21px] font-semibold"
                  >
                    {t('owner.inventory.cancel')}
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {ingredients.map(ing => (
                <div key={ing.id} className="bg-white p-3 rounded-[21px] border border-[#B5C7D8]/50 flex justify-between items-center shadow-sm">
                  <div>
                    <h4 className="text-sm font-bold text-[#2D2B30]">{ing.name}</h4>
                    <p className="text-[11px] font-medium text-[#808080] mt-0.5">
                      {t('owner.inventory.costPrefix')} {ing.costPrice.toLocaleString()}đ / {ing.unit} &bull; {t('owner.inventory.stockPrefix')} <span className={ing.stock <= 0 ? "text-red-500 font-bold" : "text-emerald-600 font-bold"}>{ing.stock} {ing.unit}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleStartEditIng(ing)}
                      className="p-1.5 text-[#808080] hover:text-[#2D2B30] bg-[#F5F5F7] rounded-lg transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteIng(ing.id)}
                      className="p-1.5 text-[#808080] hover:text-red-600 bg-[#F5F5F7] rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {ingredients.length === 0 && (
                <div className="text-center py-6 text-[#808080] text-sm italic border-2 border-dashed border-[#B5C7D8]/50 rounded-[21px]">
                  {t('owner.inventory.empty')}
                </div>
              )}
            </div>
          </div>
        )}



        {/* TABLES & QR MANAGER VIEW */}
        {activeTab === 'nfc' && (
          <div className="space-y-[13px] animate-fadeIn">
            <div className="space-y-[4px]">
              <h4 className="text-sm font-bold text-[#2D2B30]">{t('owner.tables.heading')}</h4>
              <p className="text-sm text-[#707070] leading-relaxed text-pretty">
                {t('owner.tables.hint')}
              </p>
            </div>

            <form onSubmit={handleAddTableSubmit} className="bg-[#F5F5F7] p-[13px] rounded-[21px] border border-[#B5C7D8] flex gap-[13px] items-end shadow-2xs">
              <div className="flex-1 space-y-[4px]">
                <label className="block text-xs text-[#808080] font-bold select-none">{t('owner.tables.newLabel')}</label>
                <input 
                  type="text"
                  required
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  placeholder={t('owner.tables.newPlaceholder')}
                  className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-[13px] py-1.5 text-sm text-[#2D2B30] font-semibold focus:outline-none focus:border-zinc-900 shadow-sm"
                />
              </div>
              <button 
                type="submit"
                className="bg-zinc-900 hover:bg-zinc-900/90 text-white text-sm px-[13px] py-2.5 rounded-[21px] flex items-center gap-1 shadow-sm h-[38px] transition-all font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> {t('owner.tables.add')}
              </button>
            </form>

            <div className="bg-white border border-[#B5C7D8] rounded-[21px] p-[13px] space-y-[13px] shadow-xs">
              <div className="text-sm font-bold text-[#2D2B30] border-b border-[#B5C7D8]/30 pb-2 flex items-center justify-between select-none">
                <span>{t('owner.tables.active')} ({tables.length})</span>
                <span className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-250 px-2 py-0.5 rounded-[21px] font-bold">{t('owner.tables.antiFraud')}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-[13px] max-h-[280px] overflow-y-auto pr-1">
                {tables.map((table) => {
                  const tableIdStr = table.id;
                  const isEditingThis = editingTableId === table.id;

                  return (
                    <div 
                      key={table.id} 
                      className="bg-white p-[13px] rounded-[21px] border border-[#B5C7D8] flex flex-col items-center justify-between shadow-2xs hover:border-zinc-900 transition-all text-center space-y-2.5 relative"
                    >
                      <button 
                        type="button"
                        onClick={() => handleDeleteTable(table.id)}
                        className="absolute top-2 right-2 p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-full border border-red-100 transition-colors cursor-pointer"
                        title={t('owner.tables.delete')}
                      >
                        <Trash className="w-3 h-3" />
                      </button>

                      {/* QR code logo */}
                      <div className="bg-[#F5F5F7] p-2 rounded-[21px] border border-[#B5C7D8]/45 flex items-center justify-center">
                        <QrCode className="w-7 h-7 text-[#2D2B30]" />
                      </div>

                      {isEditingThis ? (
                        <div className="space-y-1.5 w-full px-1">
                          <input 
                            type="text" 
                            value={editingTableOriginalName}
                            onChange={(e) => setEditingTableOriginalName(e.target.value)}
                            className="w-full bg-white border border-zinc-900 text-center text-sm font-bold py-1 px-1 rounded-[21px] focus:outline-none"
                            placeholder={t('owner.tables.namePlaceholder')}
                          />
                          <div className="flex gap-1 justify-center">
                            <button 
                              type="button"
                              onClick={() => handleSaveTableName(table.id)}
                              className="bg-emerald-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-[21px] flex items-center gap-0.5 cursor-pointer "
                            >
                              <Check className="w-2.5 h-2.5" /> {t('owner.tables.save')}
                            </button>
                            <button 
                              type="button"
                              onClick={() => setEditingTableId(null)}
                              className="bg-gray-100 text-[#2D2B30] text-[9px] font-bold px-2.5 py-0.5 rounded-[21px] cursor-pointer"
                            >
                              {t('owner.tables.cancel')}
                            </button>
                  </div>
                </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-1 justify-center select-none">
                            <span className="text-sm font-bold text-[#2D2B30]">{table.name}</span>
                            <button 
                              type="button"
                              onClick={() => handleStartEditingTable(table.id, table.name)}
                              title={t('owner.tables.rename')}
                              className="text-zinc-900 hover:text-[#0858DC] p-0.5 bg-gray-50 rounded cursor-pointer"
                            >
                              <Edit2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          <p className="text-[9px] text-[#808080] leading-none mt-1 select-none ">{t('owner.tables.idPrefix')} {table.id}</p>
                        </div>
                      )}

                      <div className="w-full space-y-1 pt-1 border-t border-[#B5C7D8]/30">
                        <button
                          type="button"
                          onClick={() => setSelectedQrTableId(tableIdStr)}
                          className="w-full bg-zinc-900 hover:bg-zinc-900/95 text-white text-[9px] py-1.5 rounded-[21px] font-semibold transition-colors cursor-pointer"
                        >
                          {t('owner.tables.showQr')}
                        </button>

                        <button 
                          type="button"
                          onClick={() => onTriggerNfcTag(tableIdStr)}
                          className="w-full bg-gray-100 hover:bg-gray-200 text-[#2D2B30] border border-[#B5C7D8] text-[9px] py-1.5 rounded-[21px] font-semibold shadow-2xs cursor-pointer"
                        >
                          {t('owner.tables.nfc')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Simulated Live QR Dialog modal */}
            {selectedQrTableId && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                <div className="bg-white p-[34px] rounded-[21px] border border-[#B5C7D8] max-w-xs w-full text-center space-y-[13px] shadow-2xl">
                  
                  <div className="flex justify-between items-center border-b border-[#B5C7D8]/30 pb-2.5 select-none">
                    <span className="text-sm font-bold text-[#2D2B30]">{t('owner.tables.qrTitle')}</span>
                    <button 
                      onClick={() => setSelectedQrTableId(null)}
                      className="text-[#808080] font-bold hover:text-red-500 font-sans cursor-pointer"
                    >
                      {t('owner.tables.close')}
                    </button>
                  </div>

                  {/* QR Image box layout */}
                  <div className="bg-[#F5F5F7] p-[13px] rounded-[21px] border border-[#B5C7D8] flex flex-col items-center justify-center space-y-2.5">
                    <div className="w-24 h-24 bg-white p-2 rounded-[21px] border border-[#B5C7D8] flex items-center justify-center">
                      <div className="w-20 h-20 bg-zinc-900 flex flex-wrap gap-0.5 justify-center items-center rounded overflow-hidden p-1 opacity-95">
                        {Array.from({ length: 64 }).map((_, i) => (
                          <div 
                            key={i} 
                            className={`w-1.5 h-1.5 rounded-sm ${
                              (i % 3 === 0 || i % 7 === 0 || (i > 10 && i < 18) || i === 0 || i === 7 || i === 56) 
                                ? 'bg-white' 
                                : 'bg-zinc-900'
                            }`} 
                          />
                        ))}
                      </div>
                    </div>

                    <span className="text-[14px] font-bold text-[#2D2B30] tracking-tight">
                      {tables.find(t => t.id === selectedQrTableId)?.name || `${t('customer.table.badge')} ${selectedQrTableId}`}
                    </span>
                    <p className="text-[9px] text-[#808080] font-semibold select-none leading-none">
                      {t('owner.tables.qrActive')}
                    </p>
                  </div>

                  <p className="text-sm text-[#707070] text-pretty leading-relaxed">
                    {t('owner.tables.qrBody').split('{table}')[0]}<strong>"{tables.find(t => t.id === selectedQrTableId)?.name}"</strong>{t('owner.tables.qrBody').split('{table}')[1]}
                  </p>

                  <div className="space-y-[4px]">
                    <button
                      onClick={() => handleSimulateQrScan(selectedQrTableId!)}
                      className="w-full bg-zinc-900 hover:bg-zinc-900/90 text-white py-2.5 rounded-[21px] text-sm font-bold shadow-sm cursor-pointer "
                    >
                      {t('owner.tables.simulateQr')}
                    </button>

                    <button
                      onClick={() => setSelectedQrTableId(null)}
                      className="w-full text-[#808080] hover:text-[#2D2B30] bg-transparent py-1 text-sm "
                    >
                      {t('owner.tables.backDashboard')}
                    </button>
                  </div>

                </div>
              </div>
            )}
          </div>
        )}

        {/* AI CHATBOT COPILOT VIEW */}
        {activeTab === 'ai' && (
          <div className="flex flex-col h-[290px] bg-white border border-[#B5C7D8] rounded-[21px] overflow-hidden p-[4px] shadow-sm text-[#2D2B30] animate-fadeIn">
            
            <div className="bg-[#F5F5F7] p-2 border-b border-[#B5C7D8]/45 flex items-center justify-between select-none">
              <div className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-[#2D2B30] ">{t('owner.ai.title')}</span>
              </div>
              <span className="text-[9px] bg-slate-200 border border-slate-350 text-slate-800 px-1.5 py-0.5 rounded-[21px] font-semibold ">{t('owner.ai.workspace')}</span>
            </div>

            <div className="flex-grow overflow-y-auto p-2 space-y-2 text-sm bg-[#F5F5F7]/30">
              {aiChatLogs.map((log, i) => (
                <div 
                  key={i} 
                  className={`p-2.5 rounded-[21px] max-w-[85%] shadow-2xs ${
                    log.sender === 'user' 
                      ? 'bg-gradient-to-r from-zinc-900/10 to-zinc-900/5 text-[#2D2B30] ml-auto border border-zinc-900/30 font-semibold' 
                      : 'bg-white text-[#454547] mr-auto border border-[#B5C7D8] leading-relaxed animate-fadeIn'
                  }`}
                >
                  {log.text}
                </div>
              ))}
              {isTyping && (
                <div className="bg-transparent text-[#808080] p-2 leading-none text-xs animate-pulse">
                  {t('owner.ai.typing')}
                </div>
              )}
            </div>

            {/* Quick Prompts buttons */}
            <div className="p-1 px-[13px] border-t border-[#B5C7D8]/30 flex gap-[4px] overflow-x-auto whitespace-nowrap bg-white select-none text-xs scrollbar-none">
              <button 
                onClick={() => handleAiQuestion(t('owner.ai.promptTop'))}
                className="bg-[#F5F5F7] text-[#2D2B30] hover:bg-gray-200 px-3 py-1.5 rounded-[21px] border border-[#B5C7D8] font-semibold shadow-2xs flex-shrink-0"
              >
                {t('owner.ai.promptTop')}
              </button>
              <button 
                onClick={() => handleAiQuestion(t('owner.ai.promptProfit'))}
                className="bg-[#F5F5F7] text-[#2D2B30] hover:bg-gray-200 px-3 py-1.5 rounded-[21px] border border-[#B5C7D8] font-semibold shadow-2xs flex-shrink-0"
              >
                {t('owner.ai.promptProfit')}
              </button>
              <button 
                onClick={() => handleAiQuestion(t('owner.ai.promptPromo'))}
                className="bg-[#F5F5F7] text-[#2D2B30] hover:bg-gray-200 px-3 py-1.5 rounded-[21px] border border-[#B5C7D8] font-semibold shadow-2xs flex-shrink-0"
              >
                {t('owner.ai.promptPromo')}
              </button>
            </div>

            {/* Send chat */}
            <form onSubmit={submitCustomAiChat} className="p-1.5 border-t border-[#B5C7D8]/30 flex gap-[4px] bg-white">
              <input 
                type="text" 
                value={chatInput} 
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={t('owner.ai.placeholder')}
                className="flex-grow bg-white border border-[#B5C7D8] rounded-[21px] px-[13px] py-1.5 text-sm text-[#2D2B30] font-sans focus:outline-none focus:border-zinc-900 shadow-sm font-medium"
              />
              <button 
                type="submit"
                className="bg-zinc-900 hover:bg-zinc-900/90 text-white text-sm px-4 rounded-[21px] font-bold shadow-sm cursor-pointer"
              >
                {t('owner.ai.send')}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'staff' && (
          <div className="space-y-[13px] animate-fadeIn">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-[#155BD0]" />
                {t('owner.staff.heading')}
              </h3>
              <button
                onClick={() => setShowAddStaff(!showAddStaff)}
                className="bg-[#155BD0] hover:bg-[#155BD0]/90 text-white text-[10px] px-3 py-1.5 rounded-[21px] font-semibold transition-all cursor-pointer"
              >
                {t('owner.staff.add')}
              </button>
            </div>

            {showAddStaff && (
              <form onSubmit={handleAddStaff} className="bg-[#F5F5F7] border border-[#B5C7D8] p-4 rounded-[21px] space-y-3">
                <input
                  value={newStaffName}
                  onChange={e => setNewStaffName(e.target.value)}
                  placeholder={t('owner.staff.namePlaceholder')}
                  className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-2 text-[12px] text-[#2D2B30] focus:outline-2 focus:outline-[#155BD0]"
                />
                <input
                  value={newStaffPin}
                  onChange={e => setNewStaffPin(e.target.value)}
                  placeholder={t('owner.staff.pinPlaceholder')}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-2 text-[12px] text-[#2D2B30] focus:outline-2 focus:outline-[#155BD0]"
                />
                <div className="flex gap-3 text-[11px]">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newStaffRoles.isKitchen}
                      onChange={e => setNewStaffRoles(p => ({ ...p, isKitchen: e.target.checked }))}
                      className="accent-[#155BD0]"
                    />
                    {t('owner.staff.roleKitchen')}
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newStaffRoles.isWaiter}
                      onChange={e => setNewStaffRoles(p => ({ ...p, isWaiter: e.target.checked }))}
                      className="accent-[#155BD0]"
                    />
                    {t('owner.staff.roleWaiter')}
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newStaffRoles.isCashier}
                      onChange={e => setNewStaffRoles(p => ({ ...p, isCashier: e.target.checked }))}
                      className="accent-[#155BD0]"
                    />
                    {t('owner.staff.roleCashier')}
                  </label>
                </div>
                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] py-2 rounded-[21px] font-semibold transition-colors cursor-pointer"
                >
                  {t('owner.staff.save')}
                </button>
              </form>
            )}

            <div className="space-y-[4px]">
              {staffAccounts.length === 0 && (
                <p className="text-[#8E8E93] text-xs text-center py-4">{t('owner.staff.empty')}</p>
              )}
              {staffAccounts.map(account => (
                <div key={account.id} className="flex items-center justify-between bg-white border border-[#B5C7D8] p-3 rounded-[21px] text-[12px]">
                  <div className="space-y-1">
                    <p className="font-semibold text-[#2D2B30]">{account.name}</p>
                    <div className="flex gap-1">
                      {account.roles.isKitchen && <span className="bg-[#155BD0]/10 text-[#155BD0] text-[9px] px-2 py-0.5 rounded-full font-semibold">{t('owner.staff.roleKitchen')}</span>}
                      {account.roles.isWaiter && <span className="bg-emerald-600/10 text-emerald-700 text-[9px] px-2 py-0.5 rounded-full font-semibold">{t('owner.staff.roleWaiter')}</span>}
                      {account.roles.isCashier && <span className="bg-amber-600/10 text-amber-700 text-[9px] px-2 py-0.5 rounded-full font-semibold">{t('owner.staff.roleCashier')}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleStaffActive(account.id)}
                      className={`text-[10px] px-2.5 py-1 rounded-[21px] font-semibold cursor-pointer transition-colors ${
                        account.isActive
                          ? 'bg-emerald-600/10 text-emerald-700'
                          : 'bg-gray-100 text-[#8E8E93]'
                      }`}
                    >
                      {account.isActive ? t('owner.staff.active') : t('owner.staff.inactive')}
                    </button>
                    <button
                      onClick={() => handleDeleteStaff(account.id)}
                      className="text-red-400 hover:text-red-600 transition-colors p-1 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

    </div>
  );
}


