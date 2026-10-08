/**
 * Pack-size parsing for a market price survey.
 *
 * Retail listings mix two kinds of unit: a true measure (`KG`, or `300g` in the
 * name) and a container (`HOP`, `G1`, `ZBO` — box, pack, basket). A container
 * only becomes comparable once the size inside it is known, and that size lives
 * in the product name.
 *
 * The parser is deliberately conservative. A wrong conversion silently corrupts
 * `unitCostVnd` and therefore gross profit (ADR 0014), so an ambiguous name
 * returns `confidence: 'low'` and the collector keeps it out of the seed rather
 * than guessing.
 */

/** Base unit a parsed size converts to. `unit` means a countable piece. */
export type PackBaseUnit = 'g' | 'ml' | 'unit';

export interface ParsedPackSize {
  /** Size of one sellable pack, expressed in `baseUnit`. */
  quantity: number;
  baseUnit: PackBaseUnit;
  /** The matched text, kept so a reviewer can audit the conversion. */
  matchedText: string;
  /**
   * `high` when exactly one size could be read and no container multiplier is
   * involved. `low` when the name is ambiguous, so the value must not be used
   * for Cost without a human decision.
   */
  confidence: 'high' | 'low';
}

interface UnitRule {
  readonly pattern: string;
  readonly baseUnit: PackBaseUnit;
  readonly multiplier: number;
}

/** Longest alternatives first so `kg` never matches as `g`. */
const UNIT_RULES: readonly UnitRule[] = [
  { pattern: 'kg|kí|ki-lô-gam|kilogram', baseUnit: 'g', multiplier: 1000 },
  { pattern: 'g|gam|gram|gr', baseUnit: 'g', multiplier: 1 },
  { pattern: 'ml|mililit|mililít', baseUnit: 'ml', multiplier: 1 },
  { pattern: 'l|lit|lít|liter', baseUnit: 'ml', multiplier: 1000 },
  { pattern: 'quả|trứng|miếng|cái|bó|nhánh|củ|con|phần|ly|cốc', baseUnit: 'unit', multiplier: 1 },
];

const NUMBER = '(\\d+(?:[.,]\\d+)?)';

/** Container words that can carry a leading count, e.g. `48 túi`, `hộp 10 quả`. */
const CONTAINER = 'túi|gói|hộp|khay|giỏ|bịch|thùng|lốc|vỉ|combo';

interface RawMatch {
  index: number;
  quantity: number;
  baseUnit: PackBaseUnit;
  matchedText: string;
}

function toNumber(raw: string): number {
  return Number.parseFloat(raw.replace(',', '.'));
}

function collectMatches(text: string): RawMatch[] {
  const lower = text.toLowerCase();
  const found: RawMatch[] = [];

  for (const rule of UNIT_RULES) {
    // A unit must not be glued to a preceding letter (`gam` inside `...gam`),
    // so require a non-letter or start before the number.
    const regex = new RegExp(`(?:^|[^\\p{L}])${NUMBER}\\s*(?:${rule.pattern})(?![\\p{L}])`, 'gu');
    for (const match of lower.matchAll(regex)) {
      const quantity = toNumber(match[1] ?? '');
      if (!Number.isFinite(quantity) || quantity <= 0) {
        continue;
      }
      found.push({
        index: match.index ?? 0,
        quantity: quantity * rule.multiplier,
        baseUnit: rule.baseUnit,
        matchedText: match[0].trim(),
      });
    }
  }

  return found.sort((a, b) => a.index - b.index);
}

/**
 * Read the pack size from a product name.
 *
 * Returns `null` when the name carries no size at all, which is the common case
 * for goods already priced per kilogram.
 */
export function parsePackSize(name: string): ParsedPackSize | null {
  const matches = collectMatches(name);
  if (matches.length === 0) {
    return null;
  }

  const last = matches[matches.length - 1];
  if (!last) {
    return null;
  }

  // Two size readings in one name cannot be resolved without a human, so the
  // value is reported but marked unusable for Cost.
  if (matches.length > 1) {
    return {
      quantity: last.quantity,
      baseUnit: last.baseUnit,
      matchedText: last.matchedText,
      confidence: 'low',
    };
  }

  if (isMultipack(name, last.quantity)) {
    return {
      quantity: last.quantity,
      baseUnit: last.baseUnit,
      matchedText: last.matchedText,
      confidence: 'low',
    };
  }

  return {
    quantity: last.quantity,
    baseUnit: last.baseUnit,
    matchedText: last.matchedText,
    confidence: 'high',
  };
}

/**
 * True when a container carries its own count that differs from the size.
 *
 * `gói 300g` is one 300g pack: the container word and the size share a number,
 * so it is not a multipack. `Thùng 48 túi ... 180ml` is 48 units of 180ml: the
 * container count (48) is a different number from the size (180), so the listed
 * price buys 48 packs and dividing by 180ml alone would understate Cost by 48x.
 */
function isMultipack(name: string, sizeQuantity: number): boolean {
  const lower = name.toLowerCase();
  const containerRegex = new RegExp(
    `${NUMBER}\\s*(?:${CONTAINER})|(?:${CONTAINER})\\s*${NUMBER}`,
    'gu',
  );

  for (const match of lower.matchAll(containerRegex)) {
    const numbers = match.slice(1).filter((value) => value !== undefined);
    for (const raw of numbers) {
      const value = toNumber(raw);
      // The same number as the size means the container word merely labels the
      // single pack, so it does not multiply anything.
      if (Number.isFinite(value) && value !== sizeQuantity) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Convert a pack price into a price per base unit.
 *
 * Returns `null` when the pack size is missing or ambiguous, so the caller has
 * to make an explicit decision instead of inheriting a silent guess.
 */
export function pricePerBaseUnit(
  packPriceVnd: number,
  packSize: ParsedPackSize | null,
): { unitCostVnd: number; baseUnit: PackBaseUnit } | null {
  if (!packSize || packSize.confidence !== 'high' || packSize.quantity <= 0) {
    return null;
  }
  return {
    unitCostVnd: Math.round(packPriceVnd / packSize.quantity),
    baseUnit: packSize.baseUnit,
  };
}
