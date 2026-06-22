import { MenuItem, IndustryTemplate, LoyaltyMember } from './types';

export const INDUSTRY_TEMPLATES: Record<string, IndustryTemplate> = {
  quan_an: {
    category_type: 'quan_an',
    menu_layout: 'list_don_gian',
    default_payment_mode: 'Pay-Later',
    modifier_groups: [
      {
        name: 'Thêm Đồ',
        required: false,
        options: [
          { name: 'Thêm thịt', price: 15000 },
          { name: 'Thêm quẩy (3 chiếc)', price: 10000 },
          { name: 'Thêm trứng chần', price: 5000 },
        ],
      },
    ],
    theme_tokens: {
      primary: '#f97316', // Bright soft orange
      secondary: '#fff7ed', // Cream background
      accent: '#fdba74', // Soft peach
      bgDark: false,
    },
  },
  quan_cafe: {
    category_type: 'quan_cafe',
    menu_layout: 'grid_bien_the',
    default_payment_mode: 'Pay-First',
    modifier_groups: [
      {
        name: 'Chọn Size',
        required: true,
        options: [
          { name: 'Size M (Vừa)', price: 0 },
          { name: 'Size L (Lớn)', price: 6000 },
        ],
      },
      {
        name: 'Đường & Đá',
        required: false,
        options: [
          { name: 'Ít Đường (70%)', price: 0 },
          { name: 'Ít Đá', price: 0 },
          { name: 'Thêm Trân Châu Trắng', price: 8000 },
        ],
      },
    ],
    theme_tokens: {
      primary: '#ca8a04', // Rich honey yellow
      secondary: '#fefbeb', // Cream honey
      accent: '#facc15', // Soft yellow
      bgDark: false,
    },
  },
  nha_hang: {
    category_type: 'nha_hang',
    menu_layout: 'grouped_category',
    default_payment_mode: 'Pay-Later',
    modifier_groups: [
      {
        name: 'Lựa Chọn Vị',
        required: true,
        options: [
          { name: 'Cay vừa', price: 0 },
          { name: 'Cay tê Trung Hoa', price: 5000 },
          { name: 'Không cay', price: 0 },
        ],
      },
    ],
    theme_tokens: {
      primary: '#ea580c', // Dark orange/peach
      secondary: '#fff8f2', // Peach warm white
      accent: '#fb923c', // Soft light orange
      bgDark: false,
    },
  },
  tiem_banh: {
    category_type: 'tiem_banh',
    menu_layout: 'list_don_gian',
    default_payment_mode: 'Pay-First',
    modifier_groups: [
      {
        name: 'Chọn Topping/Nhân',
        required: false,
        options: [
          { name: 'Thêm Kem Phô Mai Tươi', price: 8000 },
          { name: 'Gấp đôi bơ tỏi Pháp', price: 6000 },
          { name: 'Thêm Chà Bông Sợi Nhuyễn', price: 10000 },
        ],
      },
    ],
    theme_tokens: {
      primary: '#d97706', // Baked bread caramel orange
      secondary: '#fffdf5', // Warm milk foam cream
      accent: '#f59e0b', // Custard amber
      bgDark: false,
    },
  },
  tra_sua: {
    category_type: 'tra_sua',
    menu_layout: 'grid_bien_the',
    default_payment_mode: 'Pay-First',
    modifier_groups: [
      {
        name: 'Topping Boba',
        required: false,
        options: [
          { name: 'Trân châu đường hổ dẻo', price: 8000 },
          { name: 'Thạch trái cây cầu vồng', price: 7000 },
          { name: 'Kem Cheese mặn sủi bọt', price: 12000 },
        ],
      },
    ],
    theme_tokens: {
      primary: '#db2777', // Sweet pastel berry pink
      secondary: '#fff1f2', // Soft rose cream
      accent: '#f472b6', // Cozy bubblegum pink
      bgDark: false,
    },
  },
};

export const MOCK_MENU_ITEMS: Record<string, MenuItem[]> = {
  quan_an: [
    {
      id: 'qa1',
      name: 'Phở Bò Tái Lăn Kinh Kỳ',
      price: 65000,
      costPrice: 28000,
      category: 'Món nước',
      image: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&q=80&w=600',
      description: 'Thịt bò xào tái chín thơm mùi tỏi gừng, nước dùng đậm béo chuẩn vị truyền thống Hà Nội.',
      inStock: true,
      stockCount: 45,
    },
    {
      id: 'qa2',
      name: 'Phở Gà Thảo Mộc Sợi Nhỏ',
      price: 55000,
      costPrice: 22000,
      category: 'Món nước',
      image: 'https://images.unsplash.com/photo-1625398407796-82650a8c135f?auto=format&fit=crop&q=80&w=600',
      description: 'Lũ gà ta chạy đồi dai ngon ngọt thịt, ninh cùng thảo quả đem lại vị thanh tao dồi dào sức khỏe.',
      inStock: true,
      stockCount: 30,
    },
    {
      id: 'qa3',
      name: 'Bún Chả Tre Thạch Thất',
      price: 50000,
      costPrice: 20000,
      category: 'Khô & Bún',
      image: 'https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&q=80&w=600',
      description: 'Nướng than hoa đượm vị mật mía hương sả, ăn kèm nước mắm ấm nóng sực mùi đu đủ giòn sần sật.',
      inStock: true,
      stockCount: 25,
    },
    {
      id: 'qa4',
      name: 'Nem Rán Tôm Lụa (4 chiếc)',
      price: 35000,
      costPrice: 12000,
      category: 'Món ăn kèm',
      image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=600',
      description: 'Vỏ bánh tráng giòn rụm bên ngoài, nhân tôm xay nhuyễn cùng mộc nhĩ nấm hương béo bùi.',
      inStock: true,
      stockCount: 5, // Low stock, perfect for auto-alerts!
    },
    {
      id: 'qa5',
      name: 'Quẩy Khô Siêu Giòn',
      price: 10000,
      costPrice: 3000,
      category: 'Món ăn kèm',
      image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=600',
      description: 'Chiên vàng giòn đúng điệu ăn kèm phở.',
      inStock: true,
      stockCount: 150,
    },
    {
      id: 'qa6',
      name: 'Trà Sâm Dứa Hương Lài',
      price: 5000,
      costPrice: 800,
      category: 'Giải nhiệt',
      image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&q=80&w=600',
      description: 'Nước đá lạnh mát thơm mùi đặc trưng lá dứa.',
      inStock: true,
      stockCount: 200,
    },
  ],
  quan_cafe: [
    {
      id: 'qc1',
      name: 'Cà Phê Muối Kinh Kỳ',
      price: 35000,
      costPrice: 10000,
      category: 'Cà phê truyền thống',
      image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&q=80&w=600',
      description: 'Sự cân bằng hoàn hảo giữa đắng đậm Phin espresso Việt Nam và lớp kem muối mịn béo ngậy.',
      inStock: true,
      stockCount: 80,
    },
    {
      id: 'qc2',
      name: 'Bạc Xỉu Sài Gòn Cốt Dừa',
      price: 28000,
      costPrice: 8000,
      category: 'Cà phê truyền thống',
      image: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&q=80&w=600',
      description: 'Nhiều sữa ít cà phê, béo ngậy vị dừa tươi ép tay, thích hợp cho ngày dịu mát.',
      inStock: true,
      stockCount: 60,
    },
    {
      id: 'qc3',
      name: 'Trà Mãng Cầu Đắk Lắk Gia Lai',
      price: 40000,
      costPrice: 12000,
      category: 'Trà trái cây',
      image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=600',
      description: 'Mứt mãng cầu dẻo chua chua ngọt ngọt nhai đã miệng, giải nhiệt sảng khoái tức thì.',
      inStock: true,
      stockCount: 40,
    },
    {
      id: 'qc4',
      name: 'Trà Sữa Trân Châu Hoàng Kim',
      price: 45000,
      costPrice: 15000,
      category: 'Trà sữa đặc biệt',
      image: 'https://images.unsplash.com/photo-1541658016709-82535e94bc69?auto=format&fit=crop&q=80&w=600',
      description: 'Trà đen đậm đà phối sáp ong, trân châu phủ mật ong dẻo dai sần sật.',
      inStock: true,
      stockCount: 22,
    },
    {
      id: 'qc5',
      name: 'Croissant Sốt Bơ Tỏi Nướng Trứng',
      price: 32000,
      costPrice: 12000,
      category: 'Bánh ngọt',
      image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&q=80&w=600',
      description: 'Nướng giòn ngập ngụa sốt bơ tỏi và trứng muối xốp dẻo.',
      inStock: true,
      stockCount: 8, // Low stock!
    },
  ],
  tiem_banh: [
    {
      id: 'tb1',
      name: 'Bánh Ngọt Croissant Phô Mai Chảy',
      price: 35000,
      costPrice: 12000,
      category: 'Bánh nướng',
      image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&q=80&w=600',
      description: 'Bánh sừng bò Pháp nhiều lớp bơ thơm ngát, sốt phô mai tươi béo thơm dồi dào hảo hạng.',
      inStock: true,
      stockCount: 15,
    },
    {
      id: 'tb2',
      name: 'Bánh Garlic Butter Cream Cheese',
      price: 39000,
      costPrice: 15000,
      category: 'Bánh nướng',
      image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=600',
      description: 'Sốt bơ tỏi thơm lừng chính gốc Hàn Quốc nhồi đẫm phô mai ngọt chua mịn màng.',
      inStock: true,
      stockCount: 20,
    },
    {
      id: 'tb3',
      name: 'Bánh Mì Kẹp Thịt Xá Xíu Hội An',
      price: 32000,
      costPrice: 10000,
      category: 'Bánh mì',
      image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=600',
      description: 'Vỏ giòn rụm bên ngoài, ngập vị pate béo ngậy, dưa chuột tươi mát, rau thơm ngọt lành.',
      inStock: true,
      stockCount: 30,
    },
  ],
  tra_sua: [
    {
      id: 'ts1',
      name: 'Hồng Trà Sữa Boba Hoàng Gia',
      price: 45000,
      costPrice: 12000,
      category: 'Trà sữa',
      image: 'https://images.unsplash.com/photo-1541658016709-82535e94bc69?auto=format&fit=crop&q=80&w=600',
      description: 'Trà đen Ceylon hảo hạng đun liu riu cùng sữa đặc cao cấp, kèm boba đen mút dẻo mịn.',
      inStock: true,
      stockCount: 50,
    },
    {
      id: 'ts2',
      name: 'Trà Sữa Ô Long Lài Nướng',
      price: 48000,
      costPrice: 14000,
      category: 'Trà sữa',
      image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&q=80&w=600',
      description: 'Cốt trà Ô Long mộc mạc thơm khói phối cùng bọt béo ngọt mát tinh khiết.',
      inStock: true,
      stockCount: 35,
    },
    {
      id: 'ts3',
      name: 'Trà Xoài Chanh Leo Đá Tuyết',
      price: 40000,
      costPrice: 11000,
      category: 'Đặc sản nhiệt đới',
      image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=600',
      description: 'Mãng cầu tươi xay nhuyễn cùng bơ xoài cát hòa quyện chua cay dịu dàng.',
      inStock: true,
      stockCount: 22,
    },
  ],
  nha_hang: [
    {
      id: 'nh1',
      name: 'Lẩu Thái Cá Thác Lác Chua Cay',
      price: 299000,
      costPrice: 120000,
      category: 'Món chính / Lẩu',
      image: 'https://images.unsplash.com/photo-1627308595229-7830a5c91f9f?auto=format&fit=crop&q=80&w=600',
      description: 'Nước dùng chua ngọt chưng ớt sa tế xiêm, cá thác lác dẻo quánh tự quết tại bàn dai ngon sần sật.',
      inStock: true,
      stockCount: 15,
    },
    {
      id: 'nh2',
      name: 'Bò Tơ Tây Ninh Nướng Bản Gang',
      price: 189000,
      costPrice: 80000,
      category: 'Món lai rai',
      image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=600',
      description: 'Bò tơ nuôi cỏ ngọt mềm, nướng xèo xèo cùng bơ thực vật, hành tây, chấm mắm nêm chuẩn vùng vĩ.',
      inStock: true,
      stockCount: 20,
    },
    {
      id: 'nh3',
      name: 'Ếch Đồng Ủ Rơm Chiên Nước Mắm',
      price: 115000,
      costPrice: 45000,
      category: 'Món lai rai',
      image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&q=80&w=600',
      description: 'Đùi ếch mập ú chiên da rụm, dậy mùi nước mắm cốt nhĩ đun sệt cùng rơm giòn muối nổ.',
      inStock: true,
      stockCount: 12,
    },
    {
      id: 'nh4',
      name: 'Kim Chi Hải Sản Phố Hàn',
      price: 49000,
      costPrice: 15000,
      category: 'Khai vị',
      image: 'https://images.unsplash.com/photo-1582450871972-ab5ca641643d?auto=format&fit=crop&q=80&w=600',
      description: 'Kim chi chính hiệu muối dưa giòn chua cay bắt vị.',
      inStock: true,
      stockCount: 40,
    },
    {
      id: 'nh5',
      name: 'Chai Ken Bạc Lạnh (Thùng đá)',
      price: 24000,
      costPrice: 14000,
      category: 'Đồ uống',
      image: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?auto=format&fit=crop&q=80&w=600',
      description: 'Heineken Silver đóng chai ướp đá tuyệt đỉnh sảng khoái.',
      inStock: true,
      stockCount: 120,
    },
  ],
};

export const MOCK_LOYALTY_MEMBERS: LoyaltyMember[] = [
  { phone: '0987654321', name: 'Nguyễn Văn Hùng', points: 340, totalSpent: 3400000, visits: 12, isVerified: true },
  { phone: '0901234567', name: 'Trần Thị Mai', points: 120, totalSpent: 1200000, visits: 5, isVerified: true },
  { phone: '0933344455', name: 'Lê Hoàng Minh', points: 55, totalSpent: 550000, visits: 2, isVerified: false },
  { phone: '0977888999', name: 'Phạm Thanh Thảo', points: 0, totalSpent: 0, visits: 0, isVerified: false },
];
