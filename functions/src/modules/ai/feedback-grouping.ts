import {
  AI_CONTRACT_VERSION,
  aiFeedbackGroupingResultSchema,
  type AiFeedbackGroupingResult,
  type AiInsightDepartment,
  type FeedbackTheme,
  type FeedbackThemeSentiment,
} from '../../../../shared/contracts/ai.contract.js';
import {
  containsPersonalData,
  maskPersonalData,
} from '../../shared/pii.js';
import { hasSecretMaterial } from './service.js';

export const MAX_FEEDBACK_SCAN = 200;
export const MAX_THEMES = 10;
export const MAX_EXAMPLE_LENGTH = 200;

/** Instruction-like or secret fragments are removed before display. */
const ADVERSARIAL_PATTERNS: RegExp[] = [
  /ignore (all )?(previous|prior) instructions?/gi,
  /disregard (all )?(previous|prior) instructions?/gi,
  /bỏ qua (mọi |tất cả )?hướng dẫn/gi,
  /\b(system|assistant|developer)\s*:/gi,
  /<\/?[a-z][^>]*>/gi,
];

/**
 * Treat feedback content as data, never as an instruction. Secret-like material,
 * markup, and prompt-injection phrases are redacted before any example can be
 * shown or used (REQ-FDB-002, NFR-PRIV-002, NFR-SEC-003).
 */
export function sanitizeFeedbackText(text: string): string {
  let result = text;
  for (const pattern of ADVERSARIAL_PATTERNS) {
    result = result.replace(pattern, '[redacted]');
  }
  result = maskPersonalData(result);
  if (hasSecretMaterial(result)) {
    result = result
      .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]')
      .replace(/sk-[A-Za-z0-9]{16,}/g, '[redacted]')
      .replace(
        /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*/g,
        '[redacted]',
      );
  }
  return result;
}

interface ThemeDefinition {
  themeId: string;
  label: string;
  department: AiInsightDepartment;
  keywords: string[];
}

const THEME_CATALOG: ThemeDefinition[] = [
  {
    themeId: 'food-quality',
    label: 'Chất lượng món ăn',
    department: 'menu',
    keywords: [
      'món',
      'ăn',
      'vị',
      'ngon',
      'dở',
      'nhạt',
      'mặn',
      'nguội',
      'tươi',
      'ôi',
      'hỏng',
      'chất lượng',
    ],
  },
  {
    themeId: 'service',
    label: 'Thái độ và tốc độ phục vụ',
    department: 'operations',
    keywords: [
      'phục vụ',
      'chờ',
      'lâu',
      'chậm',
      'nhanh',
      'thái độ',
      'nhân viên',
      'order',
    ],
  },
  {
    themeId: 'price',
    label: 'Giá cả và hóa đơn',
    department: 'finance',
    keywords: ['giá', 'đắt', 'rẻ', 'tiền', 'hóa đơn', 'phí', 'tính sai'],
  },
  {
    themeId: 'cleanliness',
    label: 'Vệ sinh và không gian',
    department: 'operations',
    keywords: ['vệ sinh', 'sạch', 'bẩn', 'bàn', 'ghế', 'không gian', 'mùi'],
  },
  {
    themeId: 'order-accuracy',
    label: 'Đúng món và đủ món',
    department: 'operations',
    keywords: ['sai món', 'thiếu', 'nhầm', 'đặt', 'đơn'],
  },
];

const POSITIVE_HINTS = [
  'ngon',
  'nhanh',
  'tốt',
  'hài lòng',
  'tuyệt',
  'thân thiện',
  'sạch',
  'rẻ',
  'ổn',
  'ok',
];
const NEGATIVE_HINTS = [
  'dở',
  'tệ',
  'chậm',
  'chờ',
  'nguội',
  'mặn',
  'nhạt',
  'ôi',
  'hỏng',
  'sai',
  'thiếu',
  'chưa',
  'phàn nàn',
  'đắt',
  'bẩn',
  'thái độ',
  'lâu',
];

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function matchTheme(text: string): ThemeDefinition {
  for (const theme of THEME_CATALOG) {
    if (includesAny(text, theme.keywords)) {
      return theme;
    }
  }
  return {
    themeId: 'other',
    label: 'Chủ đề khác',
    department: 'customer',
    keywords: [],
  };
}

export interface FeedbackAnalysisRow {
  feedbackId: string;
  rating: number | null;
  maskedMessage: string | null;
  message: string | null;
}

export interface GroupFeedbackThemesInput {
  tenantId: string;
  feedback: FeedbackAnalysisRow[];
  provider: string;
  model: string;
  now: string;
}

interface ThemeBucket {
  definition: ThemeDefinition;
  sourceIds: Set<string>;
  examples: string[];
  sentiments: FeedbackThemeSentiment[];
  maskedCount: number;
}

function sentimentFor(
  text: string,
  rating: number | null,
): FeedbackThemeSentiment {
  if (rating !== null) {
    if (rating >= 4) {
      return 'positive';
    }
    if (rating <= 2) {
      return 'negative';
    }
    return 'mixed';
  }
  const positive = includesAny(text, POSITIVE_HINTS);
  const negative = includesAny(text, NEGATIVE_HINTS);
  if (positive && !negative) {
    return 'positive';
  }
  if (negative && !positive) {
    return 'negative';
  }
  return 'mixed';
}

function majoritySentiment(
  sentiments: FeedbackThemeSentiment[],
): FeedbackThemeSentiment {
  const counts: Record<FeedbackThemeSentiment, number> = {
    positive: 0,
    negative: 0,
    mixed: 0,
  };
  for (const sentiment of sentiments) {
    counts[sentiment] += 1;
  }
  if (counts.positive > counts.negative && counts.positive >= counts.mixed) {
    return 'positive';
  }
  if (counts.negative > counts.positive && counts.negative >= counts.mixed) {
    return 'negative';
  }
  return 'mixed';
}

/**
 * Group repeated feedback into bounded themes. Every theme cites its source
 * feedback IDs, examples stay masked, and adversarial content cannot escape as
 * an instruction or a secret (REQ-FDB-002, NFR-PRIV-002, NFR-AI-001).
 */
export function groupFeedbackThemes(
  input: GroupFeedbackThemesInput,
): AiFeedbackGroupingResult {
  const buckets = new Map<string, ThemeBucket>();
  let maskedCount = 0;

  for (const row of input.feedback) {
    const raw = row.maskedMessage ?? row.message ?? '';
    const sanitized = sanitizeFeedbackText(raw);
    if (containsPersonalData(raw) || sanitized !== raw) {
      maskedCount += 1;
    }
    const definition = matchTheme(sanitized.toLowerCase());
    const bucket = buckets.get(definition.themeId) ?? {
      definition,
      sourceIds: new Set<string>(),
      examples: [],
      sentiments: [],
      maskedCount: 0,
    };
    bucket.sourceIds.add(row.feedbackId);
    bucket.sentiments.push(sentimentFor(sanitized.toLowerCase(), row.rating));
    if (
      bucket.examples.length < 3 &&
      sanitized.length > 0 &&
      !hasSecretMaterial(sanitized)
    ) {
      bucket.examples.push(sanitized.slice(0, MAX_EXAMPLE_LENGTH));
    }
    buckets.set(definition.themeId, bucket);
  }

  const themes: FeedbackTheme[] = [...buckets.values()]
    .map((bucket) => ({
      themeId: bucket.definition.themeId,
      label: bucket.definition.label,
      department: bucket.definition.department,
      sentiment: majoritySentiment(bucket.sentiments),
      feedbackCount: bucket.sourceIds.size,
      sourceFeedbackIds: [...bucket.sourceIds].slice(0, 50),
      maskedExamples: bucket.examples,
    }))
    .sort((a, b) => b.feedbackCount - a.feedbackCount || a.themeId.localeCompare(b.themeId))
    .slice(0, MAX_THEMES);

  return aiFeedbackGroupingResultSchema.parse({
    schemaVersion: AI_CONTRACT_VERSION,
    tenantId: input.tenantId,
    themes,
    processedCount: input.feedback.length,
    maskedCount,
    provider: input.provider,
    model: input.model,
    generatedAt: input.now,
  });
}
