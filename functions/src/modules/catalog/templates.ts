import type { CatalogModifierGroup } from '../../../../shared/contracts/catalog.contract.js';

/**
 * One editable seed item for an approved industry template (REQ-CAT-002).
 * Templates never carry Cost, recipe, or private Tenant metadata.
 */
export interface CatalogTemplateItem {
  name: string;
  description: string;
  category: string;
  type: string;
  priceVnd: number;
  costPriceVnd: number | null;
  modifierGroups?: CatalogModifierGroup[];
}

export interface CatalogTemplate {
  templateId: string;
  label: string;
  categories: readonly string[];
  items: readonly CatalogTemplateItem[];
}

/**
 * The five approved industry templates. Applying one seeds editable categories
 * and items into exactly one Tenant.
 */
export const CATALOG_TEMPLATES: Record<string, CatalogTemplate> = {
  quan_an: {
    templateId: 'quan_an',
    label: 'Quán ăn',
    categories: ['Món nước', 'Khô & Bún', 'Món ăn kèm', 'Đồ uống'],
    items: [
      {
        name: 'Phở bò',
        description: 'Phở bò gia truyền',
        category: 'Món nước',
        type: 'Đồ ăn',
        priceVnd: 45000,
        costPriceVnd: 22000,
      },
      {
        name: 'Bún chả',
        description: 'Bún chả nướng than hoa',
        category: 'Khô & Bún',
        type: 'Đồ ăn',
        priceVnd: 40000,
        costPriceVnd: 18000,
      },
      {
        name: 'Trà đá',
        description: 'Trà đá miễn phí',
        category: 'Đồ uống',
        type: 'Đồ uống',
        priceVnd: 0,
        costPriceVnd: 0,
      },
    ],
  },
  quan_cafe: {
    templateId: 'quan_cafe',
    label: 'Quán cà phê',
    categories: ['Cà phê', 'Trà', 'Bánh ngọt'],
    items: [
      {
        name: 'Cà phê sữa đá',
        description: 'Cà phê sữa đá truyền thống',
        category: 'Cà phê',
        type: 'Đồ uống',
        priceVnd: 29000,
        costPriceVnd: 12000,
        modifierGroups: [
          {
            groupId: 'group-size',
            name: 'Chọn Size',
            selectionType: 'single',
            isRequired: true,
            minSelections: 1,
            maxSelections: 1,
            options: [
              { optionId: 'opt-m', name: 'Size M', priceDeltaVnd: 0 },
              { optionId: 'opt-l', name: 'Size L', priceDeltaVnd: 6000 },
            ],
          },
        ],
      },
      {
        name: 'Bánh mì que',
        description: 'Bánh mì que giòn',
        category: 'Bánh ngọt',
        type: 'Đồ ăn',
        priceVnd: 15000,
        costPriceVnd: 6000,
      },
    ],
  },
  nha_hang: {
    templateId: 'nha_hang',
    label: 'Nhà hàng',
    categories: ['Khai vị', 'Món chính', 'Tráng miệng'],
    items: [
      {
        name: 'Gỏi cuốn',
        description: 'Gỏi cuốn tôm thịt',
        category: 'Khai vị',
        type: 'Đồ ăn',
        priceVnd: 35000,
        costPriceVnd: 15000,
      },
      {
        name: 'Cơm chiên hải sản',
        description: 'Cơm chiên hải sản thập cẩm',
        category: 'Món chính',
        type: 'Đồ ăn',
        priceVnd: 65000,
        costPriceVnd: 30000,
      },
    ],
  },
  tiem_banh: {
    templateId: 'tiem_banh',
    label: 'Tiệm bánh',
    categories: ['Bánh mặn', 'Bánh ngọt', 'Đồ uống'],
    items: [
      {
        name: 'Bánh mì bơ tỏi',
        description: 'Bánh mì bơ tỏi nướng',
        category: 'Bánh mặn',
        type: 'Đồ ăn',
        priceVnd: 25000,
        costPriceVnd: 10000,
      },
      {
        name: 'Bánh kem phô mai',
        description: 'Bánh kem phô mai tươi',
        category: 'Bánh ngọt',
        type: 'Đồ ăn',
        priceVnd: 45000,
        costPriceVnd: 20000,
      },
    ],
  },
  tra_sua: {
    templateId: 'tra_sua',
    label: 'Trà sữa',
    categories: ['Trà sữa', 'Trà trái cây', 'Topping'],
    items: [
      {
        name: 'Trà sữa trân châu',
        description: 'Trà sữa trân châu đường đen',
        category: 'Trà sữa',
        type: 'Đồ uống',
        priceVnd: 35000,
        costPriceVnd: 15000,
        modifierGroups: [
          {
            groupId: 'group-topping',
            name: 'Topping',
            selectionType: 'multiple',
            isRequired: false,
            minSelections: 0,
            maxSelections: 3,
            options: [
              { optionId: 'opt-boba', name: 'Trân châu', priceDeltaVnd: 8000 },
              { optionId: 'opt-thach', name: 'Thạch trái cây', priceDeltaVnd: 7000 },
            ],
          },
        ],
      },
    ],
  },
};

export function getCatalogTemplate(
  templateId: string,
): CatalogTemplate | undefined {
  return CATALOG_TEMPLATES[templateId];
}
