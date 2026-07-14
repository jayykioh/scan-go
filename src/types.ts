export type IndustryType = 'quan_an' | 'quan_cafe' | 'nha_hang' | 'tiem_banh' | 'tra_sua';

export interface ThemeTokens {
  primary: string;
  secondary: string;
  accent: string;
  bgDark: boolean;
}

export interface IndustryTemplate {
  category_type: IndustryType;
  menu_layout: 'list_don_gian' | 'grid_bien_the' | 'grouped_category';
  default_payment_mode: 'Pay-First' | 'Pay-Later';
  modifier_groups: {
    name: string;
    options: { name: string; price: number }[];
    required: boolean;
  }[];
  theme_tokens: ThemeTokens;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  costPrice: number; // For AI profitability
  category: string;
  type?: string; // Additional type classification adjusted by owner (e.g. Đồ ăn, Đồ uống, Tráng miệng, Ăn vặt)
  image: string;
  description: string;
  inStock: boolean;
  stockCount: number;
  toppings?: { name: string; price: number }[];
}

export interface OrderItem {
  id: string;
  menuId: string;
  name: string;
  price: number;
  quantity: number;
  selectedModifiers?: string[];
}

export type OrderStatus = 'pending' | 'cooking' | 'ready' | 'served' | 'paid';

export interface Order {
  id: string;
  tableId: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  timestamp: Date;
  customerPhone?: string;
  isLoyaltyApplied?: boolean;
  paymentMode: 'Pay-First' | 'Pay-Later';
  paymentMethod?: 'Cash' | 'QR_Transfer';
  nfcSecureToken?: string;
  splitCount?: number; // For splitting bills
  appliedDiscountCode?: string; // Track if manual discount code was successfully validated & applied
}

export interface LoyaltyMember {
  phone: string;
  name?: string;
  points: number;
  totalSpent: number;
  visits: number;
  isVerified: boolean;
}

export interface TableConfig {
  id: string;
  name: string;
  tableSecret?: string;
  qrPayload?: string;
  nfcWritten?: boolean;
}

export interface TenantConfig {
  shopName: string;
  industry: IndustryType;
  pricingTier: 'Free' | 'Lite' | 'Pro';
  paymentMode: 'Pay-First' | 'Pay-Later';
  loyaltyEnabled: boolean;
  loyaltyRate: number; // e.g., 1000đ = 1 point
  onboardingStep: number; // 0 = not started, 1 = details, 2 = pricing, 3 = menu config, 4 = completed
  discountCode?: string;
  discountMinItems?: number;
  discountMinAmount?: number;
  discountAmount?: number;
  discountEnabled?: boolean;
  discountTriggerType?: 'auto' | 'manual'; // 'auto' (automatic when qualified) or 'manual' (customer type code)
  discountConditionType?: 'amount' | 'quantity' | 'both'; // 3 choices: 'amount' (số tiền), 'quantity' (số món), 'both' (cả hai)
  discountTargetDishId?: string; // 'all' or specific menuItem id (chỉ món đó được áp dụng)
}

export interface StaffAccount {
  id: string;
  name: string;
  pin: string;
  roles: { isKitchen: boolean; isWaiter: boolean; isCashier: boolean; };
  isActive: boolean;
}
