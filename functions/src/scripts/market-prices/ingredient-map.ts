import type { PackBaseUnit } from './pack-size.js';
import { COOP_SOURCE_ID } from './coop.js';
import { KAMEREO_SOURCE_ID } from './kamereo.js';
import { WINMART_SOURCE_ID } from './winmart.js';

/**
 * Which listing to survey for one Seed ingredient, per seller.
 *
 * A second seller is not redundancy for its own sake: the two chains disagree
 * by a wide margin on several fresh items, and a single listing's "cheapest"
 * can be an outlier. Recording both lets a reviewer see the spread.
 */
export interface SurveySourceTarget {
  readonly sourceId: string;
  /** Category slugs to read on that seller. */
  readonly categories: readonly string[];
  /**
   * Keywords to search on that seller, read in addition to the categories.
   *
   * Category browsing alone is not enough: neither chain's produce category
   * carried a common tomato or a pineapple, yet both sell them. Search reaches
   * a named ingredient directly, which is what makes full coverage possible.
   */
  readonly searchKeywords?: readonly string[];
}

/**
 * Which retail listings to survey for one Seed ingredient.
 *
 * `baseUnit` is the base unit the Seed stores for that ingredient (g, ml, or
 * unit). A surveyed price is only usable when the parsed pack converts to the
 * same base unit; a mismatch means the two are not comparable and the collector
 * drops the observation instead of rescaling it silently.
 */
export interface IngredientSurveyTarget {
  readonly ingredientId: string;
  readonly seedName: string;
  readonly baseUnit: PackBaseUnit;
  readonly sources: readonly SurveySourceTarget[];
  /** A product name must match one of these to be a candidate. */
  readonly include: readonly RegExp[];
  /** A product name matching one of these is never a candidate. */
  readonly exclude: readonly RegExp[];
  /**
   * When set, a search hit is only a candidate if the seller's category path
   * matches. Category browsing is already scoped, but a keyword search is not:
   * searching `sả` returned a floor cleaner and searching `thịt bò` returned
   * instant noodles, so the department has to be checked explicitly.
   */
  readonly searchCategoryInclude?: RegExp;
}

/**
 * The seller's fresh-food department. Instant food, household goods, and
 * cosmetics all sit outside it, which is what makes a keyword search usable.
 *
 * This is the default department for a search hit, because most Seed
 * ingredients are fresh food.
 */
export const FRESH_DEPARTMENT = /Tươi sống/i;

/** The seller's beverage department, used by the drink ingredients. */
export const BEVERAGE_DEPARTMENT = /Đồ uống/i;

/**
 * Fresh noodles sit in the dry and prepared department rather than the fresh
 * one, so they need a wider allowance than the default.
 */
export const NOODLE_DEPARTMENT = /Tươi sống|Thực phẩm khô|Chế biến/i;

/**
 * Processed and prepared goods are excluded everywhere: a marinaded or fried
 * product carries labour and additives, so its price is not the ingredient
 * Cost a kitchen would book (ADR 0014).
 *
 * `khô` needs a negative lookahead because it is a substring of `không`, which
 * appears in ordinary names like `Cá lóc làm sạch không đầu`; without it the
 * survey silently dropped a valid fish.
 */
const PROCESSED =
  /xúc xích|viên|chà bông|pate|nem|giò|chả|xông khói|marinad|ướp|tẩm|chiên|quay|nướng|khô(?!ng)|sấy|đóng hộp|ăn liền|sốt|kho\b|rim/i;

/** Seasoning and ready-to-drink goods are not the raw ingredient either. */
const READY_MADE = /nước chấm|gia vị|bột nêm|hạt nêm|nước mắm|tương|sốt|siro|bột pha|hòa tan/i;

/**
 * Bones, offal, and trim are sold under the same animal name but are not the
 * cut a recipe books. Leaving them in produced a `Thịt heo` cost taken from
 * pork tail bone, which is why they are excluded explicitly.
 *
 * The short tokens carry `\b` because they are substrings of ordinary words —
 * `tim` sits inside `tím`, `da` inside `dai`, `gan` inside `ngan`.
 */
const NOT_A_CUT =
  /xương|sườn|gân|mỡ|bì|\bda\b|chân|giò|móng|tai|mũi|đầu|lưỡi|óc|tuỷ|tủy|\btim\b|cật|\bgan\b|phổi|ruột|huyết|dồi|tràng|phao câu|sụn|lòng|bao tử|dạ dày|thực quản|mề|đuôi/i;

/**
 * Prepared dishes that merely carry the ingredient in their name. A search for
 * `thịt bò` returned `Bánh mì tươi tròn xẻ nhân thịt bò`, whose price is a
 * sandwich, not beef. Applied to the meat, seafood, and egg targets only —
 * `bánh` would wrongly exclude `bánh phở` and `bánh ướt`.
 */
const PREPARED_DISH =
  /bánh mì|sandwich|burger|pizza|\bmì\b|\bphở\b|\bbún\b|cháo|súp|gỏi|nem nướng|xiên que|\bque\b|chả giò|hoành thánh|mì xào|miến/i;

const WINMART = WINMART_SOURCE_ID;
const COOP = COOP_SOURCE_ID;
const KAMEREO = KAMEREO_SOURCE_ID;

export const SURVEY_TARGETS: readonly IngredientSurveyTarget[] = [
  {
    ingredientId: 'seed-ing-banh-pho',
    seedName: 'Bánh phở',
    baseUnit: 'g',
    sources: [
      { sourceId: WINMART, categories: [], searchKeywords: ['bánh phở tươi'] },
      { sourceId: COOP, categories: [], searchKeywords: ['bánh phở'] },
      { sourceId: KAMEREO, categories: ['124'] },
    ],
    include: [/bánh phở|phở tươi|bánh ướt/i],
    // Neither seller stocks plain fresh rice noodle. Every `phở` hit is an
    // instant kit or a dried sheet, so prepared dishes are excluded and the
    // survey reports no match rather than pricing a kit as the ingredient.
    exclude: [
      PROCESSED,
      /phở trộn|phở bò|phở gà|thịt bò|thịt gà|hầm|hương vị|ăn liền|lc ?food|đệ nhất|vifon|gói|hộp/i,
    ],
    searchCategoryInclude: NOODLE_DEPARTMENT,
  },
  {
    ingredientId: 'seed-ing-bun-tuoi',
    seedName: 'Bún tươi',
    baseUnit: 'g',
    sources: [
      { sourceId: WINMART, categories: [], searchKeywords: ['bún tươi'] },
      { sourceId: COOP, categories: [], searchKeywords: ['bún tươi'] },
      { sourceId: KAMEREO, categories: ['124'] },
    ],
    include: [/bún/i],
    exclude: [PROCESSED, /bún bò|bún chả|ăn liền|bún gạo lứt|nêm/i],
    searchCategoryInclude: NOODLE_DEPARTMENT,
  },
  {
    ingredientId: 'seed-ing-gao-te',
    seedName: 'Gạo tẻ',
    baseUnit: 'g',
    sources: [
      {
        sourceId: WINMART,
        categories: ['gao-nong-san-kho--c0120'],
        searchKeywords: ['gạo tẻ'],
      },
      { sourceId: COOP, categories: ['gao'], searchKeywords: ['gạo'] },
      { sourceId: KAMEREO, categories: ['124'] },
    ],
    include: [/gạo/i],
    // ST25, Tám, and Séng Cù are all non-glutinous table rice, so they are the
    // right product even though they are premium. Glutinous (`nếp`), unmilled
    // (`lứt`), and milled (`bột`) rice are different ingredients — the Hanoi
    // catalogue priced `Bột Gạo Tài Ký` as the cheapest "rice".
    exclude: [/nếp|lứt|bột|\bbánh\b|\bmì\b|nui|hủ tiếu/i],
  },
  {
    ingredientId: 'seed-ing-thit-bo',
    seedName: 'Thịt bò',
    baseUnit: 'g',
    sources: [
      {
        sourceId: WINMART,
        categories: ['thit--c0111'],
        searchKeywords: ['thịt bò'],
      },
      {
        sourceId: COOP,
        categories: ['bo-va-thit-cac-loai'],
        searchKeywords: ['thịt bò'],
      },
      { sourceId: KAMEREO, categories: ['120'] },
    ],
    include: [/bò/i],
    exclude: [PREPARED_DISH, PROCESSED, NOT_A_CUT],
  },
  {
    ingredientId: 'seed-ing-thit-heo',
    seedName: 'Thịt heo',
    baseUnit: 'g',
    sources: [
      {
        sourceId: WINMART,
        categories: ['thit--c0111'],
        searchKeywords: ['thịt heo'],
      },
      {
        sourceId: COOP,
        categories: ['bo-va-thit-cac-loai'],
        searchKeywords: ['thịt heo'],
      },
      { sourceId: KAMEREO, categories: ['120'] },
    ],
    include: [/heo/i],
    exclude: [PREPARED_DISH, PROCESSED, NOT_A_CUT],
  },
  {
    ingredientId: 'seed-ing-ga-ta',
    seedName: 'Gà ta',
    baseUnit: 'g',
    sources: [
      { sourceId: WINMART, categories: ['thit--c0111'], searchKeywords: ['gà ta'] },
      {
        sourceId: COOP,
        categories: ['bo-va-thit-cac-loai'],
        searchKeywords: ['gà ta'],
      },
      { sourceId: KAMEREO, categories: ['120'] },
    ],
    include: [/gà/i],
    // A cut (thigh, wing, breast) is still chicken meat and is priced per kg,
    // so cuts are accepted; only offal and non-chicken names are excluded.
    exclude: [PREPARED_DISH, PROCESSED, NOT_A_CUT, /trứng|phở|bún|miến|tỏi/i],
  },
  {
    ingredientId: 'seed-ing-ca-loc',
    seedName: 'Cá lóc',
    baseUnit: 'g',
    sources: [
      {
        sourceId: WINMART,
        categories: ['hai-san--c0113', 'thit-hai-san-tuoi--c03'],
        searchKeywords: ['cá lóc'],
      },
      {
        sourceId: COOP,
        categories: ['hai-san'],
        searchKeywords: ['cá lóc'],
      },
      { sourceId: KAMEREO, categories: ['121'] },
    ],
    include: [/lóc/i],
    exclude: [PREPARED_DISH, PROCESSED, READY_MADE],
  },
  {
    ingredientId: 'seed-ing-tom-su',
    seedName: 'Tôm sú',
    baseUnit: 'g',
    sources: [
      {
        sourceId: WINMART,
        categories: ['hai-san--c0113'],
        searchKeywords: ['tôm sú'],
      },
      { sourceId: COOP, categories: ['hai-san'], searchKeywords: ['tôm sú'] },
      { sourceId: KAMEREO, categories: ['121'] },
    ],
    // `tôm` alone matched `Tôm thẻ nõn`, a different species at a different
    // price. The survey reports no match rather than substitute one for the
    // other, because the Seed Cost would then describe the wrong product.
    include: [/tôm\s*sú|tôm\s*càng/i],
    exclude: [PREPARED_DISH, PROCESSED, READY_MADE, /khô|sấy|mắm|tép|thẻ|nõn|sushi/i],
  },
  {
    ingredientId: 'seed-ing-trung-ga',
    seedName: 'Trứng gà',
    baseUnit: 'unit',
    sources: [
      {
        sourceId: WINMART,
        categories: ['trung--c01165'],
        searchKeywords: ['trứng gà'],
      },
      {
        sourceId: COOP,
        categories: ['thit-trung-hai-san'],
        searchKeywords: ['trứng gà'],
      },
      { sourceId: KAMEREO, categories: ['120'] },
    ],
    include: [/trứng gà/i],
    exclude: [PREPARED_DISH, /vịt|cút|ngỗng|muối|bắc thảo|lộn|non|gà ác|gà so|gà ta/i],
  },
  {
    ingredientId: 'seed-ing-dau-hu',
    seedName: 'Đậu hũ',
    baseUnit: 'g',
    sources: [
      {
        sourceId: WINMART,
        categories: ['dau-hu--c01138'],
        searchKeywords: ['đậu hũ'],
      },
      {
        sourceId: COOP,
        categories: ['dau-goi-nam'],
        searchKeywords: ['đậu hũ'],
      },
      { sourceId: KAMEREO, categories: ['122'] },
    ],
    include: [/đậu hũ|đậu phụ|tàu hũ/i],
    exclude: [PROCESSED, /chiên|non|trứng/i],
  },
  {
    ingredientId: 'seed-ing-rau-song',
    seedName: 'Rau sống',
    baseUnit: 'g',
    sources: [
      {
        sourceId: WINMART,
        categories: ['rau-la--c01167'],
        searchKeywords: ['xà lách'],
      },
      {
        sourceId: COOP,
        categories: ['rau-cu'],
        searchKeywords: ['xà lách'],
      },
      { sourceId: KAMEREO, categories: ['122'] },
    ],
    include: [/xà lách|rau sống|rau thơm|húng/i],
    exclude: [READY_MADE, /trộn|salad|mầm/i],
  },
  {
    ingredientId: 'seed-ing-gia-do',
    seedName: 'Giá đỗ',
    baseUnit: 'g',
    sources: [
      {
        sourceId: WINMART,
        categories: ['rau-la--c01167'],
        searchKeywords: ['giá đỗ'],
      },
      { sourceId: COOP, categories: ['rau-cu'], searchKeywords: ['giá đỗ'] },
      { sourceId: KAMEREO, categories: ['122'] },
    ],
    include: [/giá đỗ|giá/i],
    exclude: [READY_MADE, /hẹ|tỏi|đậu nành/i],
  },
  {
    ingredientId: 'seed-ing-ca-chua',
    seedName: 'Cà chua',
    baseUnit: 'g',
    sources: [
      {
        sourceId: WINMART,
        categories: ['cu-qua--c01168'],
        searchKeywords: ['cà chua'],
      },
      {
        sourceId: COOP,
        categories: ['rau-cu'],
        searchKeywords: ['cà chua'],
      },
      { sourceId: KAMEREO, categories: ['122'] },
    ],
    // `Cà chua chocolate` is a specialty variety that cost more than three
    // times a common tomato, so variety names are excluded.
    include: [/cà chua/i],
    exclude: [
      PROCESSED,
      READY_MADE,
      /bi|cherry|chocolate|baby|mini|khô|muối|đóng hộp|nước ép|sốt|cá ngừ|mì|bánh/i,
    ],
  },
  {
    ingredientId: 'seed-ing-dua',
    seedName: 'Dứa (thơm)',
    baseUnit: 'g',
    sources: [
      {
        sourceId: WINMART,
        categories: ['trai-cay-tuoi--c01173'],
        searchKeywords: ['dứa'],
      },
      {
        sourceId: COOP,
        categories: ['rau-cu-trai-cay'],
        searchKeywords: ['dứa'],
      },
      { sourceId: KAMEREO, categories: ['122'] },
    ],
    include: [/dứa|thơm/i],
    exclude: [
      READY_MADE,
      /khô|sấy|mứt|nước|gạo|trà|kẹo|bánh|sữa|kem|mật ong/i,
    ],
  },
  {
    ingredientId: 'seed-ing-me-que',
    seedName: 'Me chua',
    baseUnit: 'g',
    sources: [
      { sourceId: WINMART, categories: [], searchKeywords: ['me chua'] },
      { sourceId: COOP, categories: [], searchKeywords: ['me chua'] },
      { sourceId: KAMEREO, categories: ['122'] },
    ],
    include: [/\bme\b|me chua|quả me|tamarind/i],
    exclude: [READY_MADE, /me xanh|me ngọt|kẹo|mứt|nước|siro|gia vị|me đen/i],
  },
  {
    ingredientId: 'seed-ing-sa',
    seedName: 'Sả',
    baseUnit: 'g',
    sources: [
      {
        sourceId: WINMART,
        categories: ['rau-la--c01167', 'cu-qua--c01168'],
        searchKeywords: ['sả'],
      },
      { sourceId: COOP, categories: ['rau-cu'], searchKeywords: ['sả'] },
      { sourceId: KAMEREO, categories: ['122'] },
    ],
    include: [/sả/i],
    exclude: [READY_MADE, /sa tế|sả ớt|ớt/i],
  },
  {
    ingredientId: 'seed-ing-toi',
    seedName: 'Tỏi',
    baseUnit: 'g',
    sources: [
      {
        sourceId: WINMART,
        categories: ['cu-qua--c01168'],
        searchKeywords: ['tỏi'],
      },
      { sourceId: COOP, categories: ['rau-cu'], searchKeywords: ['tỏi'] },
      { sourceId: KAMEREO, categories: ['122'] },
    ],
    include: [/tỏi/i],
    exclude: [READY_MADE, /phi|bột|muối|ngâm|tương|tỏi tây|hành/i],
  },
  {
    ingredientId: 'seed-ing-hanh-tim',
    seedName: 'Hành tím',
    baseUnit: 'g',
    sources: [
      {
        sourceId: WINMART,
        categories: ['cu-qua--c01168'],
        searchKeywords: ['hành tím'],
      },
      { sourceId: COOP, categories: ['rau-cu'], searchKeywords: ['hành tím'] },
      { sourceId: KAMEREO, categories: ['122'] },
    ],
    // The listings carry shallot as `Hành củ Hải Dương`, the common Vietnamese
    // retail name for it. `hành tây` (onion) and `hành baro` are different
    // ingredients and stay excluded, and the reviewer sees the product name in
    // the diff before it reaches the Seed.
    include: [/hành củ|hành tím|hành hương|shallot/i],
    exclude: [READY_MADE, /phi|bột|lá|tây|baro|khô/i],
  },
  {
    ingredientId: 'seed-ing-nuoc-dua',
    seedName: 'Nước dừa',
    baseUnit: 'ml',
    sources: [
      {
        sourceId: WINMART,
        categories: ['do-uong-giai-khat--c09'],
        searchKeywords: ['nước dừa'],
      },
      {
        sourceId: COOP,
        categories: ['nuoc-trai-cay'],
        searchKeywords: ['nước dừa'],
      },
      { sourceId: KAMEREO, categories: ['127'] },
    ],
    include: [/nước dừa|dừa tươi/i],
    exclude: [/cốt|kem|sữa|đóng hộp|lon|thạch|nước ngọt/i],
    searchCategoryInclude: BEVERAGE_DEPARTMENT,
  },
  {
    ingredientId: 'seed-ing-tra-dao',
    seedName: 'Nước cốt trà đào',
    baseUnit: 'ml',
    sources: [
      {
        sourceId: WINMART,
        categories: ['tra-cac-loai-khac--c0141'],
        searchKeywords: ['trà đào'],
      },
      {
        sourceId: COOP,
        categories: ['nuoc-trai-cay'],
        searchKeywords: ['đào'],
      },
      { sourceId: KAMEREO, categories: ['127'] },
    ],
    // A shop buys a concentrate it dilutes, not a ready-to-drink bottle. Only
    // concentrate wording is accepted; if neither seller stocks one, the survey
    // reports no match, which is the honest answer.
    include: [/nước cốt trà đào|siro đào|syrup đào|đào đậm đặc|nước cốt đào/i],
    exclude: [
      /túi lọc|khô|đóng chai|chai|lon|hộp giấy|trà xanh|trà sen|trà ô long|nước ép|juice|vfresh|có đường|nectar|hạt chia|fuzetea/i,
    ],
    searchCategoryInclude: BEVERAGE_DEPARTMENT,
  },
] as const;
