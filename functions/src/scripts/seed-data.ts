/**
 * Static demo dataset for the seed script (local/dev convenience only).
 *
 * The dataset is intentionally small and deterministic: 20 ingredients feed
 * 10 menu items, so the Catalog, Inventory, Ordering, Reporting, and Workforce
 * screens all have consistent data. It is not product data and is never
 * imported into a production Tenant automatically.
 *
 * Ingredient prices are overlaid from the generated market survey
 * (`npm run market:survey`) where a comparable product was found, so the demo
 * carries sourced street prices instead of invented ones. Run the seed with
 * `--show-prices` to print which source each price came from.
 */
import type { CatalogModifierGroup } from '../../../shared/contracts/catalog.contract.js';
import type { UnitInput } from '../../../shared/contracts/inventory.contract.js';
import { resolveSeedPrice } from './market-prices/market-prices.js';

export const SEED_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** One demo ingredient. Stock and Cost are stored in base units. */
export interface SeedIngredient {
  id: string;
  name: string;
  purchaseUnit: UnitInput;
  /** Purchase price for one `purchaseUnit`; the server converts to base Cost. */
  purchasePriceVnd: number;
  /** Initial stock in base units (g, ml, or unit). */
  stockQuantity: number;
  lowStockThreshold: number;
  /** Free-text count unit name for a `unit` purchase unit (REQ-INV-012). */
  countUnitLabel?: string;
}

/** One recipe line in base units. Waste is added to the deduction. */
export interface SeedRecipeLine {
  ingredientId: string;
  quantityBaseUnits: number;
  wasteBaseUnits?: number;
}

/** One demo menu item with its recipe and a public image URL. */
export interface SeedMenuItem {
  id: string;
  name: string;
  description: string;
  category: string;
  type: string;
  priceVnd: number;
  imageUrl: string;
  modifierGroups: CatalogModifierGroup[];
  recipe: SeedRecipeLine[];
}

/** One demo Staff member stored as a Tenant membership. */
export interface SeedStaff {
  /** Synthetic uid fallback when Firebase Auth is unavailable (dry-run). */
  uid: string;
  displayName: string;
  email: string;
  password: string;
  roles: string[];
  permissions: string[];
  /** Six-digit PIN; the seed stores only the scrypt hash. */
  pin: string;
}

const TOPPING_GROUP: CatalogModifierGroup = {
  groupId: 'group-topping',
  name: 'Topping',
  selectionType: 'multiple',
  isRequired: false,
  minSelections: 0,
  maxSelections: 3,
  options: [
    { optionId: 'opt-trung', name: 'Trứng', priceDeltaVnd: 5000 },
    { optionId: 'opt-them-thit', name: 'Thêm thịt', priceDeltaVnd: 15000 },
    { optionId: 'opt-them-banh', name: 'Thêm bánh', priceDeltaVnd: 5000 },
  ],
};

const SIZE_GROUP: CatalogModifierGroup = {
  groupId: 'group-size',
  name: 'Chọn size',
  selectionType: 'single',
  isRequired: true,
  minSelections: 1,
  maxSelections: 1,
  options: [
    { optionId: 'opt-size-m', name: 'Size M', priceDeltaVnd: 0 },
    { optionId: 'opt-size-l', name: 'Size L', priceDeltaVnd: 6000 },
  ],
};

/**
 * Hand-written fallback prices. A value here is used only when the market
 * survey found no comparable product and no human override exists, so it stays
 * the last resort rather than the source of truth.
 */
const SEED_INGREDIENT_DEFAULTS: readonly SeedIngredient[] = [
  { id: 'seed-ing-banh-pho', name: 'Bánh phở', purchaseUnit: 'kg', purchasePriceVnd: 40000, stockQuantity: 12000, lowStockThreshold: 1000 },
  { id: 'seed-ing-bun-tuoi', name: 'Bún tươi', purchaseUnit: 'kg', purchasePriceVnd: 30000, stockQuantity: 10000, lowStockThreshold: 1000 },
  { id: 'seed-ing-gao-te', name: 'Gạo tẻ', purchaseUnit: 'kg', purchasePriceVnd: 20000, stockQuantity: 20000, lowStockThreshold: 2000 },
  { id: 'seed-ing-thit-bo', name: 'Thịt bò', purchaseUnit: 'kg', purchasePriceVnd: 300000, stockQuantity: 8000, lowStockThreshold: 1000 },
  { id: 'seed-ing-thit-heo', name: 'Thịt heo', purchaseUnit: 'kg', purchasePriceVnd: 150000, stockQuantity: 8000, lowStockThreshold: 1000 },
  { id: 'seed-ing-ga-ta', name: 'Gà ta', purchaseUnit: 'kg', purchasePriceVnd: 120000, stockQuantity: 8000, lowStockThreshold: 1000 },
  { id: 'seed-ing-ca-loc', name: 'Cá lóc', purchaseUnit: 'kg', purchasePriceVnd: 140000, stockQuantity: 6000, lowStockThreshold: 800 },
  { id: 'seed-ing-tom-su', name: 'Tôm sú', purchaseUnit: 'kg', purchasePriceVnd: 280000, stockQuantity: 4000, lowStockThreshold: 500 },
  { id: 'seed-ing-trung-ga', name: 'Trứng gà', purchaseUnit: 'unit', countUnitLabel: 'quả', purchasePriceVnd: 4000, stockQuantity: 200, lowStockThreshold: 30 },
  { id: 'seed-ing-dau-hu', name: 'Đậu hũ', purchaseUnit: 'unit', countUnitLabel: 'miếng', purchasePriceVnd: 5000, stockQuantity: 120, lowStockThreshold: 20 },
  { id: 'seed-ing-rau-song', name: 'Rau sống', purchaseUnit: 'kg', purchasePriceVnd: 30000, stockQuantity: 5000, lowStockThreshold: 500 },
  { id: 'seed-ing-gia-do', name: 'Giá đỗ', purchaseUnit: 'kg', purchasePriceVnd: 20000, stockQuantity: 4000, lowStockThreshold: 500 },
  { id: 'seed-ing-ca-chua', name: 'Cà chua', purchaseUnit: 'kg', purchasePriceVnd: 25000, stockQuantity: 5000, lowStockThreshold: 500 },
  { id: 'seed-ing-dua', name: 'Dứa (thơm)', purchaseUnit: 'kg', purchasePriceVnd: 15000, stockQuantity: 5000, lowStockThreshold: 500 },
  { id: 'seed-ing-me-que', name: 'Me chua', purchaseUnit: 'kg', purchasePriceVnd: 60000, stockQuantity: 2000, lowStockThreshold: 200 },
  { id: 'seed-ing-sa', name: 'Sả', purchaseUnit: 'kg', purchasePriceVnd: 40000, stockQuantity: 2000, lowStockThreshold: 200 },
  { id: 'seed-ing-toi', name: 'Tỏi', purchaseUnit: 'kg', purchasePriceVnd: 80000, stockQuantity: 2000, lowStockThreshold: 200 },
  { id: 'seed-ing-hanh-tim', name: 'Hành tím', purchaseUnit: 'kg', purchasePriceVnd: 50000, stockQuantity: 2000, lowStockThreshold: 200 },
  { id: 'seed-ing-nuoc-dua', name: 'Nước dừa', purchaseUnit: 'l', purchasePriceVnd: 30000, stockQuantity: 10000, lowStockThreshold: 1000 },
  { id: 'seed-ing-tra-dao', name: 'Nước cốt trà đào', purchaseUnit: 'l', purchasePriceVnd: 80000, stockQuantity: 5000, lowStockThreshold: 500 },
] as const;

/**
 * The Seed ingredients with the market survey applied.
 *
 * Each price is resolved independently: a human override wins, then an observed
 * retail price, then the hand-written fallback above. Retail is not wholesale,
 * so treat these as sourced demo values to be replaced by real invoices
 * (ADR 0014).
 */
export const SEED_INGREDIENTS: readonly SeedIngredient[] =
  SEED_INGREDIENT_DEFAULTS.map((ingredient) => ({
    ...ingredient,
    purchasePriceVnd: resolveSeedPrice(
      ingredient.id,
      ingredient.purchasePriceVnd,
      ingredient.purchaseUnit,
    ).purchasePriceVnd,
  }));

/** Per-ingredient provenance, so the seed can report where a price came from. */
export const SEED_INGREDIENT_PRICE_SOURCES = SEED_INGREDIENT_DEFAULTS.map(
  (ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    defaultPurchasePriceVnd: ingredient.purchasePriceVnd,
    ...resolveSeedPrice(
      ingredient.id,
      ingredient.purchasePriceVnd,
      ingredient.purchaseUnit,
    ),
  }),
);

const IMAGE_BASE = 'https://images.unsplash.com';

export const SEED_MENU_ITEMS: readonly SeedMenuItem[] = [
  {
    id: 'seed-item-pho-bo',
    name: 'Phở bò',
    description: 'Phở bò gia truyền, nước dùng xương ống',
    category: 'Món nước',
    type: 'Đồ ăn',
    priceVnd: 45000,
    imageUrl: `${IMAGE_BASE}/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&q=80&w=600`,
    modifierGroups: [TOPPING_GROUP],
    recipe: [
      { ingredientId: 'seed-ing-banh-pho', quantityBaseUnits: 200 },
      { ingredientId: 'seed-ing-thit-bo', quantityBaseUnits: 100 },
      { ingredientId: 'seed-ing-hanh-tim', quantityBaseUnits: 10 },
      { ingredientId: 'seed-ing-sa', quantityBaseUnits: 5 },
      { ingredientId: 'seed-ing-rau-song', quantityBaseUnits: 30 },
    ],
  },
  {
    id: 'seed-item-bun-cha',
    name: 'Bún chả',
    description: 'Bún chả nướng than hoa, nước mắm chua ngọt',
    category: 'Khô & Bún',
    type: 'Đồ ăn',
    priceVnd: 40000,
    imageUrl: `${IMAGE_BASE}/photo-1625398407796-82650a8c135f?auto=format&fit=crop&q=80&w=600`,
    modifierGroups: [TOPPING_GROUP],
    recipe: [
      { ingredientId: 'seed-ing-bun-tuoi', quantityBaseUnits: 200 },
      { ingredientId: 'seed-ing-thit-heo', quantityBaseUnits: 120 },
      { ingredientId: 'seed-ing-hanh-tim', quantityBaseUnits: 10 },
      { ingredientId: 'seed-ing-toi', quantityBaseUnits: 5 },
      { ingredientId: 'seed-ing-rau-song', quantityBaseUnits: 40 },
    ],
  },
  {
    id: 'seed-item-com-chien-hai-san',
    name: 'Cơm chiên hải sản',
    description: 'Cơm chiên hải sản thập cẩm',
    category: 'Món chính',
    type: 'Đồ ăn',
    priceVnd: 65000,
    imageUrl: `${IMAGE_BASE}/photo-1596797038530-2c107229654b?auto=format&fit=crop&q=80&w=600`,
    modifierGroups: [TOPPING_GROUP],
    recipe: [
      { ingredientId: 'seed-ing-gao-te', quantityBaseUnits: 200 },
      { ingredientId: 'seed-ing-tom-su', quantityBaseUnits: 80 },
      { ingredientId: 'seed-ing-trung-ga', quantityBaseUnits: 1 },
      { ingredientId: 'seed-ing-ca-chua', quantityBaseUnits: 20 },
      { ingredientId: 'seed-ing-toi', quantityBaseUnits: 5 },
      { ingredientId: 'seed-ing-hanh-tim', quantityBaseUnits: 10 },
    ],
  },
  {
    id: 'seed-item-goi-cuon',
    name: 'Gỏi cuốn tôm thịt',
    description: 'Gỏi cuốn tôm thịt, bánh tráng mềm',
    category: 'Khai vị',
    type: 'Đồ ăn',
    priceVnd: 35000,
    imageUrl: `${IMAGE_BASE}/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=600`,
    modifierGroups: [TOPPING_GROUP],
    recipe: [
      { ingredientId: 'seed-ing-bun-tuoi', quantityBaseUnits: 80 },
      { ingredientId: 'seed-ing-tom-su', quantityBaseUnits: 40 },
      { ingredientId: 'seed-ing-thit-heo', quantityBaseUnits: 40 },
      { ingredientId: 'seed-ing-rau-song', quantityBaseUnits: 50 },
      { ingredientId: 'seed-ing-gia-do', quantityBaseUnits: 30 },
    ],
  },
  {
    id: 'seed-item-bo-luc-lac',
    name: 'Bò lúc lắc',
    description: 'Bò lúc lắc khoai tây chiên',
    category: 'Món chính',
    type: 'Đồ ăn',
    priceVnd: 89000,
    imageUrl: `${IMAGE_BASE}/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&q=80&w=600`,
    modifierGroups: [TOPPING_GROUP],
    recipe: [
      { ingredientId: 'seed-ing-thit-bo', quantityBaseUnits: 180 },
      { ingredientId: 'seed-ing-toi', quantityBaseUnits: 10 },
      { ingredientId: 'seed-ing-hanh-tim', quantityBaseUnits: 15 },
      { ingredientId: 'seed-ing-ca-chua', quantityBaseUnits: 30 },
      { ingredientId: 'seed-ing-rau-song', quantityBaseUnits: 40 },
    ],
  },
  {
    id: 'seed-item-ga-nuong-mat-ong',
    name: 'Gà nướng mật ong',
    description: 'Gà ta nướng mật ong, sả thơm',
    category: 'Món chính',
    type: 'Đồ ăn',
    priceVnd: 75000,
    imageUrl: `${IMAGE_BASE}/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&q=80&w=600`,
    modifierGroups: [TOPPING_GROUP],
    recipe: [
      { ingredientId: 'seed-ing-ga-ta', quantityBaseUnits: 200 },
      { ingredientId: 'seed-ing-toi', quantityBaseUnits: 8 },
      { ingredientId: 'seed-ing-sa', quantityBaseUnits: 10 },
      { ingredientId: 'seed-ing-hanh-tim', quantityBaseUnits: 10 },
    ],
  },
  {
    id: 'seed-item-canh-chua-ca-loc',
    name: 'Canh chua cá lóc',
    description: 'Canh chua cá lóc miền Tây',
    category: 'Món nước',
    type: 'Đồ ăn',
    priceVnd: 55000,
    imageUrl: `${IMAGE_BASE}/photo-1547592180-85f173990554?auto=format&fit=crop&q=80&w=600`,
    modifierGroups: [TOPPING_GROUP],
    recipe: [
      { ingredientId: 'seed-ing-ca-loc', quantityBaseUnits: 150 },
      { ingredientId: 'seed-ing-ca-chua', quantityBaseUnits: 40 },
      { ingredientId: 'seed-ing-dua', quantityBaseUnits: 80 },
      { ingredientId: 'seed-ing-me-que', quantityBaseUnits: 10 },
      { ingredientId: 'seed-ing-gia-do', quantityBaseUnits: 30 },
      { ingredientId: 'seed-ing-nuoc-dua', quantityBaseUnits: 300 },
      { ingredientId: 'seed-ing-rau-song', quantityBaseUnits: 20 },
    ],
  },
  {
    id: 'seed-item-dau-hu-chien-sa',
    name: 'Đậu hũ chiên sả',
    description: 'Đậu hũ chiên sả ớt, món chay',
    category: 'Món chay',
    type: 'Đồ ăn',
    priceVnd: 30000,
    imageUrl: `${IMAGE_BASE}/photo-1541658016709-82535e94bc69?auto=format&fit=crop&q=80&w=600`,
    modifierGroups: [TOPPING_GROUP],
    recipe: [
      { ingredientId: 'seed-ing-dau-hu', quantityBaseUnits: 3 },
      { ingredientId: 'seed-ing-sa', quantityBaseUnits: 10 },
      { ingredientId: 'seed-ing-toi', quantityBaseUnits: 5 },
      { ingredientId: 'seed-ing-hanh-tim', quantityBaseUnits: 10 },
    ],
  },
  {
    id: 'seed-item-che-ba-mau',
    name: 'Chè ba màu',
    description: 'Chè ba màu nước cốt dừa',
    category: 'Tráng miệng',
    type: 'Đồ ăn',
    priceVnd: 20000,
    imageUrl: `${IMAGE_BASE}/photo-1555507036-ab1f4038808a?auto=format&fit=crop&q=80&w=600`,
    modifierGroups: [],
    recipe: [
      { ingredientId: 'seed-ing-nuoc-dua', quantityBaseUnits: 200 },
      { ingredientId: 'seed-ing-gao-te', quantityBaseUnits: 50 },
      { ingredientId: 'seed-ing-trung-ga', quantityBaseUnits: 1 },
    ],
  },
  {
    id: 'seed-item-tra-dao-cam-sa',
    name: 'Trà đào cam sả',
    description: 'Trà đào cam sả mát lạnh',
    category: 'Đồ uống',
    type: 'Đồ uống',
    priceVnd: 30000,
    imageUrl: `${IMAGE_BASE}/photo-1544787219-7f47ccb76574?auto=format&fit=crop&q=80&w=600`,
    modifierGroups: [SIZE_GROUP],
    recipe: [
      { ingredientId: 'seed-ing-tra-dao', quantityBaseUnits: 150 },
      { ingredientId: 'seed-ing-sa', quantityBaseUnits: 5 },
    ],
  },
] as const;

export const SEED_STAFF: readonly SeedStaff[] = [
  { uid: 'seed-staff-kitchen', displayName: 'Bếp trưởng Minh', email: 'bep@demo.scango.vn', password: 'scango123', roles: ['kitchen'], permissions: ['order.read'], pin: '111111' },
  { uid: 'seed-staff-waiter', displayName: 'Phục vụ Lan', email: 'phucvu@demo.scango.vn', password: 'scango123', roles: ['waiter'], permissions: ['order.read'], pin: '222222' },
  { uid: 'seed-staff-cashier', displayName: 'Thu ngân Hoa', email: 'thungan@demo.scango.vn', password: 'scango123', roles: ['cashier'], permissions: ['order.read', 'order.settle'], pin: '333333' },
  { uid: 'seed-staff-manager', displayName: 'Quản lý ca Tuấn', email: 'quanly@demo.scango.vn', password: 'scango123', roles: ['cashier', 'kitchen'], permissions: ['order.read', 'order.settle', 'payment.correct'], pin: '444444' },
] as const;

export const SEED_TABLE_COUNT = 10;

/** Deterministic table id, name, and public link token for one table index. */
export function seedTable(index: number): {
  tableId: string;
  name: string;
  token: string;
} {
  const ordinal = String(index).padStart(2, '0');
  return {
    tableId: `seed-table-${ordinal}`,
    name: `Bàn ${index}`,
    token: `seed-table-token-${ordinal}`,
  };
}
