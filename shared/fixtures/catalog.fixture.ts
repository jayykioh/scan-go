import type { PublicMenuItem } from '../contracts/catalog.contract'

export const publicMenuFixture: ReadonlyArray<PublicMenuItem> = [
  {
    id: 'menu-pho-bo',
    tenantId: 'tenant-demo',
    name: 'Phở bò tái',
    description: 'Phở bò dùng nước hầm trong ngày.',
    category: 'Món nước',
    imageUrl: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&q=80&w=600',
    unitPriceVnd: 65000,
    available: true,
    modifiers: [{ id: 'them-thit', name: 'Thêm thịt', priceDeltaVnd: 20000 }],
  },
  {
    id: 'menu-tra-da',
    tenantId: 'tenant-demo',
    name: 'Trà đá',
    description: 'Trà lạnh.',
    category: 'Đồ uống',
    imageUrl: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&q=80&w=600',
    unitPriceVnd: 5000,
    available: true,
    modifiers: [],
  },
]
