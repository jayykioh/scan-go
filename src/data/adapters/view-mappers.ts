import type {
  CatalogMenuItem,
  PublicMenuItem,
} from '@contracts/catalog.contract';
import type { Ingredient as ContractIngredient } from '@contracts/inventory.contract';
import type { LoyaltyMemberView } from '@contracts/loyalty.contract';
import type { OrderSnapshot } from '@contracts/order.contract';
import type { PublicOrderTracking } from '@contracts/order.contract';
import type { TenantTable } from './table.adapter';
import type {
  Ingredient,
  LoyaltyMember,
  MenuItem,
  Order,
  OrderItem,
  OrderStatus,
  TableConfig,
} from '../../types';

/**
 * Bridge helpers that map server contract shapes onto the existing view
 * models. The views keep their current layout and styling; only the data
 * source changes from browser state to server results (docs/RULES_FIREBASE.md
 * §1 — the client never writes a business collection directly).
 */

const DRINK_WORDS = ['Giải nhiệt', 'Đồ uống', 'Trà', 'Cà phê', 'Trà sữa', 'Đá xay'];

function inferType(name: string, category: string, type: string | null): string {
  if (type) return type;
  return DRINK_WORDS.some((word) => category.includes(word) || name.includes(word))
    ? 'Đồ uống'
    : 'Đồ ăn';
}

function flattenModifiers(
  groups: CatalogMenuItem['modifierGroups'],
): { name: string; price: number; optionId: string }[] {
  return groups.flatMap((group) =>
    group.options.map((option) => ({
      optionId: option.optionId,
      name: option.name,
      price: option.priceDeltaVnd,
    })),
  );
}

/** Map one private Catalog item to the Owner menu view model. */
export function toOwnerMenuItem(item: CatalogMenuItem): MenuItem {
  return {
    id: item.menuItemId,
    name: item.name,
    price: item.priceVnd,
    costPrice: item.costPriceVnd ?? 0,
    category: item.category,
    type: inferType(item.name, item.category, item.type),
    image: item.imagePath ?? '',
    description: item.description ?? '',
    inStock: item.isAvailable,
    stockCount: item.stockCount ?? 999,
    toppings: flattenModifiers(item.modifierGroups),
  };
}

/** Map one public menu projection to the Customer menu view model. */
export function toPublicMenuItem(item: PublicMenuItem): MenuItem {
  return {
    id: item.menuItemId,
    name: item.name,
    price: item.priceVnd,
    costPrice: 0,
    category: item.category,
    type: inferType(item.name, item.category, item.type),
    image: item.imageUrl ?? '',
    description: item.description ?? '',
    inStock: item.isAvailable,
    stockCount: 999,
    toppings: flattenModifiers(item.modifierGroups),
  };
}

/** Map one server Order snapshot to the cross-view Order view model. */
export function toViewOrder(order: OrderSnapshot): Order {
  const items: OrderItem[] = order.items.map((line) => ({
    id: line.lineId,
    menuId: line.menuItemId,
    name: line.name,
    price: line.unitPriceVnd,
    quantity: line.quantity,
    selectedModifiers: line.modifiers.map((modifier) => modifier.name),
    selectedOptionIds: line.modifiers.map((modifier) => modifier.optionId),
  }));

  return {
    id: order.orderId,
    tableId: order.tableId,
    items,
    total: order.totalVnd,
    status: order.status as OrderStatus,
    timestamp: new Date(order.createdAt),
    paymentMode: order.paymentMode === 'payFirst' ? 'Pay-First' : 'Pay-Later',
    // The server tracks payment via Ordering; a Pay-First Order carries the
    // confirmed timestamp so Kitchen releases it only after settlement.
    paidAt: order.paymentMode === 'payFirst' ? order.updatedAt : undefined,
  };
}

/** Map one public tracking projection to the Customer tracking view model. */
export function toTrackingOrder(tracking: PublicOrderTracking): Order {
  return {
    id: tracking.orderId,
    tableId: tracking.tableName,
    items: [
      {
        id: `${tracking.orderId}-summary`,
        menuId: tracking.orderId,
        name: tracking.itemSummary,
        price: tracking.totalVnd,
        quantity: 1,
      },
    ],
    total: tracking.totalVnd,
    status: tracking.status as OrderStatus,
    timestamp: new Date(tracking.createdAt),
    paymentMode: 'Pay-Later',
  };
}

/** Map one server table row to the Table view model with its opaque link. */
export function toTableConfig(table: TenantTable): TableConfig {
  return {
    id: table.tableId,
    name: table.name,
    qrPayload: table.qrPayload ?? undefined,
    nfcWritten: table.nfcWritten,
  };
}

/** Map one server ingredient to the Owner stock view model. */
export function toViewIngredient(ingredient: ContractIngredient): Ingredient {
  return {
    id: ingredient.ingredientId,
    name: ingredient.name,
    costPrice: ingredient.unitCostVnd,
    unit: ingredient.baseUnit,
    stock: ingredient.stockQuantity,
  };
}

/**
 * Map one permission-filtered Loyalty member view to the Owner/Solo view model.
 * The server decides whether the phone survives; an omitted phone keeps the
 * member visible under its opaque member id (NFR-PRIV-001).
 */
export function toViewLoyaltyMember(member: LoyaltyMemberView): LoyaltyMember {
  return {
    phone: member.phone ?? member.memberId,
    name: member.displayName ?? undefined,
    points: member.pointBalance,
    totalSpent: member.paidTotalVnd,
    visits: member.visitCount,
    isVerified: member.isVerified,
  };
}

/**
 * UI base unit labels. The view uses short labels; the stored base unit stays
 * `g`/`ml`/`unit` (docs/module/inventory.md).
 */
export function toOwnerUnitInput(
  baseUnit: ContractIngredient['baseUnit'],
): 'g' | 'kg' | 'ml' | 'l' | 'unit' {
  return baseUnit;
}
