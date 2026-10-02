import { z } from 'zod';
import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import {
  AI_CONTRACT_VERSION,
  aiAskResultSchema,
  aiSourceSchema,
  aiUsageRecordSchema,
  aiWarningSchema,
  type AiPurpose,
  type AiSource,
  type AiUsageRecord,
  type AiWarning,
} from '../../../../shared/contracts/ai.contract.js';
import {
  REPORTING_CONTRACT_VERSION,
  dailyItemStatsSchema,
  dailyStatsSchema,
  type DailyItemStats,
  type DailyStats,
} from '../../../../shared/contracts/reporting.contract.js';
import {
  nonNegativeIntSchema,
  vndSchema,
} from '../../../../shared/validation.js';
import type { AiProviderName } from '../../../../shared/contracts/config.contract.js';
import { nowIso } from '../reporting/service.js';

export const MAX_AI_MENU_ITEMS = 200;
export const MAX_AI_INGREDIENTS = 200;
export const MAX_AI_ITEM_STATS = 100;
export const AI_DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Convert a Firestore timestamp, Date, or ISO string into an ISO string. */
export function toIsoTimestamp(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (
    value &&
    typeof (value as { toDate?: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  throw new HttpsError('invalid-argument', AI_INVALID_MESSAGE);
}

export function mapDailyStats(
  tenantId: string,
  dayKey: string,
  data: DocumentData,
): DailyStats {
  return dailyStatsSchema.parse({
    schemaVersion: REPORTING_CONTRACT_VERSION,
    tenantId,
    dayKey,
    createdOrderCount: data.createdOrderCount ?? 0,
    cancelledOrderCount: data.cancelledOrderCount ?? 0,
    paidOrderCount: data.paidOrderCount ?? 0,
    reversedOrderCount: data.reversedOrderCount ?? 0,
    refundedOrderCount: data.refundedOrderCount ?? 0,
    revenueVnd: data.revenueVnd ?? 0,
    costVnd: data.costVnd ?? 0,
    grossProfitVnd: data.grossProfitVnd ?? 0,
    reversedVnd: data.reversedVnd ?? 0,
    refundedVnd: data.refundedVnd ?? 0,
    version: data.version ?? 1,
    updatedAt: data.updatedAt == null ? nowIso() : toIsoTimestamp(data.updatedAt),
  });
}

export function mapDailyItemStats(
  tenantId: string,
  dayKey: string,
  itemId: string,
  data: DocumentData,
): DailyItemStats {
  return dailyItemStatsSchema.parse({
    schemaVersion: REPORTING_CONTRACT_VERSION,
    tenantId,
    dayKey,
    itemId,
    itemName: data.itemName ?? itemId,
    paidQuantity: data.paidQuantity ?? 0,
    revenueVnd: data.revenueVnd ?? 0,
    costVnd: data.costVnd ?? 0,
    grossProfitVnd: data.grossProfitVnd ?? 0,
    reversedVnd: data.reversedVnd ?? 0,
    refundedVnd: data.refundedVnd ?? 0,
  });
}

export async function readMenuItems(
  db: Firestore,
  tenantId: string,
): Promise<AiMenuItemContext[]> {
  const snap = await db
    .collection(`tenants/${tenantId}/menuItems`)
    .limit(MAX_AI_MENU_ITEMS)
    .get();
  return snap.docs
    .filter((docSnap) => docSnap.get('archivedAt') == null)
    .map((docSnap) => ({
      menuItemId: docSnap.id,
      name: typeof docSnap.get('name') === 'string' ? docSnap.get('name') : '',
      priceVnd: Number(docSnap.get('priceVnd') ?? 0),
      costVnd: Number(docSnap.get('costPriceVnd') ?? 0),
    }))
    .filter((item) => item.name.length > 0);
}

export async function readIngredients(
  db: Firestore,
  tenantId: string,
): Promise<AiIngredientContext[]> {
  const snap = await db
    .collection(`tenants/${tenantId}/ingredients`)
    .limit(MAX_AI_INGREDIENTS)
    .get();
  return snap.docs
    .filter((docSnap) => docSnap.get('archivedAt') == null)
    .map((docSnap) => ({
      ingredientId: docSnap.id,
      name:
        typeof docSnap.get('name') === 'string' ? docSnap.get('name') : '',
      unitCostVnd: Number(docSnap.get('unitCostVnd') ?? 0),
      stockQuantity: Number(docSnap.get('stockQuantity') ?? 0),
      lowStockThreshold: Number(docSnap.get('lowStockThreshold') ?? 0),
      isActive: docSnap.get('isActive') !== false,
    }))
    .filter((item) => item.name.length > 0);
}

export const AI_INVALID_MESSAGE = 'Yêu cầu AI không hợp lệ.';
export const AI_MEMBER_DENIED_MESSAGE = 'Bạn không thuộc cửa hàng này.';
export const AI_OWNER_DENIED_MESSAGE =
  'Chỉ chủ cửa hàng dùng được trợ lý AI.';
export const AI_BUDGET_EXCEEDED_MESSAGE =
  'Cửa hàng đã đạt hạn mức chi phí AI trong tháng.';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';
/** Estimated VND per 1,000 tokens; used only for cost accounting. */
export const GEMINI_INPUT_VND_PER_1K = 190;
export const GEMINI_OUTPUT_VND_PER_1K = 760;

const SECRET_PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z_-]{20,}/,
  /sk-[A-Za-z0-9]{16,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];

/** Detect secret-like material before it reaches a log or a provider prompt. */
export function hasSecretMaterial(value: unknown): boolean {
  if (typeof value === 'string') {
    return SECRET_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasSecretMaterial(entry));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((entry) => hasSecretMaterial(entry));
  }
  return false;
}

export function assertNoSecretMaterial(value: unknown): void {
  if (hasSecretMaterial(value)) {
    throw new Error('Secret-like material is not allowed in AI input or output.');
  }
}

/**
 * The assistant is Owner-scoped. ADMIN stays server-verified and read-only
 * (REQ-AI-001, NFR-SEC-003).
 */
export function assertAiOwnerMember(
  memberData: DocumentData | undefined,
  isAdmin: boolean,
): void {
  if (isAdmin) {
    return;
  }
  if (!memberData || memberData.isActive === false) {
    throw new HttpsError('permission-denied', AI_MEMBER_DENIED_MESSAGE);
  }
  if (memberData.membershipType !== 'owner') {
    throw new HttpsError('permission-denied', AI_OWNER_DENIED_MESSAGE);
  }
}

export const AI_PERMISSION_DENIED_MESSAGE =
  'Câu hỏi vượt quá phạm vi dữ liệu được phép.';

/**
 * Questions the Owner assistant must refuse server-side (REQ-AI-003,
 * NFR-PRIV-002, NFR-SEC-003). The assistant only reads the tenant's authorized
 * aggregates; it never exposes secrets, payroll, personal data, or another
 * tenant, and it never changes permissions.
 */
const FORBIDDEN_QUESTION_PATTERNS: RegExp[] = [
  /\b(api[\s-]?key|secret|mật\s*khẩu|password|private\s*key|access\s*token)\b/i,
  /\b(lương|payroll|salary|bảng\s*lương|thu\s*nhập\s*nhân\s*viên)\b/i,
  /(số\s*điện\s*thoại|email|địa\s*chỉ|cmnd|cccd|tên\s*khách|thông\s*tin\s*khách)[\s\S]*(liệt\s*kê|cho\s*tôi|xuất|export|tất\s*cả|danh\s*sách|list)/i,
  /(liệt\s*kê|cho\s*tôi|xuất|export|tất\s*cả|danh\s*sách|list)[\s\S]*(số\s*điện\s*thoại|email|địa\s*chỉ|cmnd|cccd|tên\s*khách|thông\s*tin\s*khách)/i,
  /(doanh\s*thu|dữ\s*liệu|số\s*liệu|cửa\s*hàng|nhà\s*hàng)[\s\S]{0,20}(cửa\s*hàng|nhà\s*hàng|chi\s*nhánh|tenant)\s*khác/i,
  /(đổi|cấp|thêm|xóa|thu\s*hồi|sửa|phân)[\s\S]{0,10}(quyền|permission|role|vai\s*trò|vai\s*tro)\b/i,
  /\b(other|another)\s+(tenant|store|shop)\b/i,
];

/** Throw `permission-denied` when a question leaves the permitted data scope. */
export function assertQuestionInPermission(question: string): void {
  if (FORBIDDEN_QUESTION_PATTERNS.some((pattern) => pattern.test(question))) {
    throw new HttpsError('permission-denied', AI_PERMISSION_DENIED_MESSAGE);
  }
}

const aiMenuItemContextSchema = z.strictObject({
  menuItemId: z.string().min(1),
  name: z.string().min(1),
  priceVnd: vndSchema,
  costVnd: vndSchema,
});

export type AiMenuItemContext = z.infer<typeof aiMenuItemContextSchema>;

const aiIngredientContextSchema = z.strictObject({
  ingredientId: z.string().min(1),
  name: z.string().min(1),
  unitCostVnd: vndSchema,
  stockQuantity: nonNegativeIntSchema,
  lowStockThreshold: nonNegativeIntSchema,
  isActive: z.boolean(),
});

export type AiIngredientContext = z.infer<typeof aiIngredientContextSchema>;

const aiItemStatsContextSchema = z.strictObject({
  itemId: z.string().min(1),
  itemName: z.string().min(1),
  paidQuantity: nonNegativeIntSchema,
  revenueVnd: vndSchema,
  costVnd: vndSchema,
  grossProfitVnd: z.number().int(),
});

export interface SafeAiContext {
  tenantId: string;
  period: string | null;
  dayStats: Array<{
    dayKey: string;
    revenueVnd: number;
    costVnd: number;
    grossProfitVnd: number;
    paidOrderCount: number;
    updatedAt: string;
    items: Array<z.infer<typeof aiItemStatsContextSchema>>;
  }>;
  menuItems: AiMenuItemContext[];
  ingredients: AiIngredientContext[];
  sources: AiSource[];
}

export interface AssembleSafeContextInput {
  tenantId: string;
  dayStats: Array<{ stats: DailyStats; items: DailyItemStats[] }>;
  menuItems: AiMenuItemContext[];
  ingredients: AiIngredientContext[];
}

/**
 * Assemble a bounded, authorized, PII-free context. Only aggregated money and
 * inventory metadata leave the tenant; no customer identity is included
 * (docs/module/ai.md, NFR-PRIV-002).
 */
export function assembleSafeContext(
  input: AssembleSafeContextInput,
): SafeAiContext {
  const dayStats = input.dayStats.map((entry) => ({
    dayKey: entry.stats.dayKey,
    revenueVnd: entry.stats.revenueVnd,
    costVnd: entry.stats.costVnd,
    grossProfitVnd: entry.stats.grossProfitVnd,
    paidOrderCount: entry.stats.paidOrderCount,
    updatedAt: entry.stats.updatedAt,
    items: entry.items.map((item) =>
      aiItemStatsContextSchema.parse({
        itemId: item.itemId,
        itemName: item.itemName,
        paidQuantity: item.paidQuantity,
        revenueVnd: item.revenueVnd,
        costVnd: item.costVnd,
        grossProfitVnd: item.grossProfitVnd,
      }),
    ),
  }));

  const sources: AiSource[] = [];
  for (const stats of dayStats) {
    sources.push(
      aiSourceSchema.parse({
        type: 'dailyStats',
        id: stats.dayKey,
        label: `dailyStats ${stats.dayKey}`,
        period: stats.dayKey,
      }),
    );
  }
  for (const item of input.menuItems) {
    sources.push(
      aiSourceSchema.parse({
        type: 'menuItem',
        id: item.menuItemId,
        label: item.name,
        period: null,
      }),
    );
  }
  for (const ingredient of input.ingredients) {
    sources.push(
      aiSourceSchema.parse({
        type: 'ingredient',
        id: ingredient.ingredientId,
        label: ingredient.name,
        period: null,
      }),
    );
  }

  const context: SafeAiContext = {
    tenantId: input.tenantId,
    period:
      dayStats.length === 1
        ? dayStats[0].dayKey
        : dayStats.length > 1
          ? `${dayStats[dayStats.length - 1].dayKey}..${dayStats[0].dayKey}`
          : null,
    dayStats,
    menuItems: input.menuItems.map((item) =>
      aiMenuItemContextSchema.parse(item),
    ),
    ingredients: input.ingredients.map((item) =>
      aiIngredientContextSchema.parse(item),
    ),
    sources,
  };
  assertNoSecretMaterial(context);
  return context;
}

const LOW_MARGIN_THRESHOLD = 0.2;

/**
 * Deterministic warnings for loss, low profit, and low stock. Every claim cites
 * a source id and states its formula. Missing data is a warning, never an
 * invented value (REQ-AI-001, NFR-AI-001).
 */
export function computeWarnings(context: SafeAiContext): AiWarning[] {
  const warnings: AiWarning[] = [];
  const paidOrderCount = context.dayStats.reduce(
    (sum, day) => sum + day.paidOrderCount,
    0,
  );

  if (paidOrderCount === 0) {
    warnings.push(
      aiWarningSchema.parse({
        kind: 'missingData',
        severity: 'info',
        subjectId: null,
        subjectName: null,
        message:
          'Chưa có đơn đã thanh toán trong kỳ. Không kết luận về lợi nhuận.',
        sourceIds: context.dayStats.map((day) => day.dayKey),
        formula: 'paidOrderCount == 0',
      }),
    );
  }

  for (const item of context.menuItems) {
    if (item.priceVnd <= 0 || item.costVnd <= 0) {
      continue;
    }
    const grossProfitVnd = item.priceVnd - item.costVnd;
    if (grossProfitVnd < 0) {
      warnings.push(
        aiWarningSchema.parse({
          kind: 'loss',
          severity: 'critical',
          subjectId: item.menuItemId,
          subjectName: item.name,
          message: `${item.name} đang bán dưới giá vốn.`,
          sourceIds: [item.menuItemId],
          formula: 'priceVnd - costVnd < 0',
        }),
      );
      continue;
    }
    const margin = grossProfitVnd / item.priceVnd;
    if (margin < LOW_MARGIN_THRESHOLD) {
      warnings.push(
        aiWarningSchema.parse({
          kind: 'lowProfit',
          severity: 'warning',
          subjectId: item.menuItemId,
          subjectName: item.name,
          message: `${item.name} có biên lợi nhuận thấp (${Math.round(
            margin * 100,
          )}%).`,
          sourceIds: [item.menuItemId],
          formula: '(priceVnd - costVnd) / priceVnd < 0.2',
        }),
      );
    }
  }

  for (const ingredient of context.ingredients) {
    if (
      ingredient.isActive &&
      ingredient.stockQuantity <= ingredient.lowStockThreshold
    ) {
      warnings.push(
        aiWarningSchema.parse({
          kind: 'lowStock',
          severity: 'warning',
          subjectId: ingredient.ingredientId,
          subjectName: ingredient.name,
          message: `${ingredient.name} đã chạm ngưỡng tồn kho thấp.`,
          sourceIds: [ingredient.ingredientId],
          formula: 'stockQuantity <= lowStockThreshold',
        }),
      );
    }
  }

  return warnings.slice(0, 20);
}

export interface AiProviderRequest {
  question: string;
  context: SafeAiContext;
  warnings: AiWarning[];
}

export interface AiProviderResponse {
  provider: string;
  model: string;
  answer: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostVnd: number;
}

/** One replaceable provider adapter (ADR 0008, docs/module/ai.md). */
export interface AiProviderAdapter {
  readonly provider: string;
  readonly model: string;
  generate(request: AiProviderRequest): Promise<AiProviderResponse>;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Source ids a grounded answer must be able to cite. */
export function collectSourceIds(request: AiProviderRequest): string[] {
  const ids = new Set<string>();
  for (const source of request.context.sources) {
    ids.add(source.id);
  }
  for (const warning of request.warnings) {
    for (const id of warning.sourceIds) {
      ids.add(id);
    }
  }
  return [...ids].slice(0, 10);
}

function citationSuffix(request: AiProviderRequest): string {
  const ids = collectSourceIds(request);
  return ids.length === 0
    ? ' Chưa có nguồn dữ liệu.'
    : ` Nguồn: ${ids.join(', ')}.`;
}

function summarizeDay(context: SafeAiContext): string {
  const revenue = context.dayStats.reduce((sum, day) => sum + day.revenueVnd, 0);
  const cost = context.dayStats.reduce((sum, day) => sum + day.costVnd, 0);
  const gross = context.dayStats.reduce(
    (sum, day) => sum + day.grossProfitVnd,
    0,
  );
  return (
    `Doanh thu đã thu: ${revenue} VND; giá vốn: ${cost} VND; ` +
    `lãi gộp: ${gross} VND.`
  );
}

/**
 * Default safe provider: no external call, no secret, deterministic grounding.
 * A live Gemini adapter replaces it behind the same interface when configured.
 */
export function createRuleBasedProvider(): AiProviderAdapter {
  const provider = 'rule-based';
  const model = 'deterministic-v1';
  return {
    provider,
    model,
    async generate(request: AiProviderRequest): Promise<AiProviderResponse> {
      const warningText =
        request.warnings.length === 0
          ? 'Không có cảnh báo nào từ dữ liệu hiện có.'
          : `Có ${request.warnings.length} cảnh báo: ${request.warnings
              .map((warning) => warning.message)
              .join(' ')}`;
      const answer = `${summarizeDay(request.context)} ${warningText}${citationSuffix(
        request,
      )}`;
      assertNoSecretMaterial(answer);
      return {
        provider,
        model,
        answer,
        inputTokens: estimateTokens(request.question),
        outputTokens: estimateTokens(answer),
        estimatedCostVnd: 0,
      };
    },
  };
}

export const AI_PROVIDER_MALFORMED_MESSAGE =
  'Phản hồi nhà cung cấp AI không hợp lệ.';

/**
 * Gemini's JSON response shape. Only the fields this adapter consumes are
 * declared; unknown provider fields are stripped. Validating before result
 * construction keeps a malformed body from becoming cost or an answer
 * (ADR 0008, REQ-AI-004).
 */
export const geminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(z.object({ text: z.string().optional() }))
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().int().nonnegative().optional(),
      candidatesTokenCount: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export type GeminiResponse = z.infer<typeof geminiResponseSchema>;

/**
 * Jev's structured-decision JSON response shape. A missing `choice` is a
 * malformed response, not a silent `unknown` (ADR 0008).
 */
export const jevResponseSchema = z.object({
  choice: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  usage: z
    .object({ inputTokens: z.number().int().nonnegative().optional() })
    .optional(),
});

export type JevResponse = z.infer<typeof jevResponseSchema>;

/**
 * A live Gemini adapter behind the same interface. The API key stays server
 * side and is never logged or returned. The call is only reachable when Config
 * selects `gemini` and a provider secret is present (ADR 0008).
 */
export function createGeminiProvider(config: {
  apiKey: string;
  model: string;
}): AiProviderAdapter {
  const provider = 'gemini';
  const model = config.model;
  return {
    provider,
    model,
    async generate(request: AiProviderRequest): Promise<AiProviderResponse> {
      let response: Response;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}` +
            `:generateContent?key=${encodeURIComponent(config.apiKey)}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              contents: [
                { role: 'user', parts: [{ text: buildProviderPrompt(request) }] },
              ],
            }),
          },
        );
      } catch {
        // Never surface the key-bearing request URL in an error or a log.
        throw new Error('Gemini request failed before a response was received.');
      }
      if (!response.ok) {
        throw new Error(`Gemini request failed with status ${response.status}.`);
      }
      // Validate the provider JSON before any result or cost is built.
      const parsedBody = geminiResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (!parsedBody.success) {
        throw new Error(AI_PROVIDER_MALFORMED_MESSAGE);
      }
      const body = parsedBody.data;
      const answer =
        body.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? '')
          .join('') ?? '';
      if (!answer) {
        throw new Error('Gemini returned an empty answer.');
      }
      assertNoSecretMaterial(answer);
      const inputTokens =
        body.usageMetadata?.promptTokenCount ?? estimateTokens(request.question);
      const outputTokens =
        body.usageMetadata?.candidatesTokenCount ?? estimateTokens(answer);
      return {
        provider,
        model,
        answer,
        inputTokens,
        outputTokens,
        estimatedCostVnd: estimateGeminiCostVnd(inputTokens, outputTokens),
      };
    },
  };
}

/** Integer VND estimate for one Gemini call (no floating VND is ever stored). */
export function estimateGeminiCostVnd(
  inputTokens: number,
  outputTokens: number,
): number {
  const input = (inputTokens / 1000) * GEMINI_INPUT_VND_PER_1K;
  const output = (outputTokens / 1000) * GEMINI_OUTPUT_VND_PER_1K;
  return Math.round(input + output);
}

export const DEFAULT_JEV_MODEL = 'jev-1.13.0';
/** Approximate VND per 1,000 input tokens; Jev output is free (ADR 0008). */
export const JEV_INPUT_VND_PER_1K = 1.1;

/**
 * TypeSafe Jev structured-decision adapter behind a feature flag (ADR 0008).
 * Jev is a signal, never money, permission, price, or inventory. The prose is
 * assembled in code so Vietnamese quality and grounding stay deterministic.
 * The API key stays server side and is never logged or returned.
 */
export function createJevProvider(config: {
  apiKey: string;
  model: string;
}): AiProviderAdapter {
  const provider = 'jev';
  const model = config.model;
  return {
    provider,
    model,
    async generate(request: AiProviderRequest): Promise<AiProviderResponse> {
      const decisionInput = buildProviderPrompt(request);
      let response: Response;
      try {
        response = await fetch('https://api.typesafe.ai/v1/decisions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model,
            task: 'insight_priority',
            input: decisionInput,
          }),
        });
      } catch {
        throw new Error('Jev request failed before a response was received.');
      }
      if (!response.ok) {
        throw new Error(`Jev request failed with status ${response.status}.`);
      }
      // Validate the provider JSON before any result or cost is built.
      const parsedBody = jevResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (!parsedBody.success) {
        throw new Error(AI_PROVIDER_MALFORMED_MESSAGE);
      }
      const body = parsedBody.data;
      const choice = body.choice;
      const confidence =
        typeof body.confidence === 'number' ? body.confidence : 0;
      const answer = buildJevAnswer(request, choice, confidence);
      assertNoSecretMaterial(answer);
      const inputTokens = body.usage?.inputTokens ?? estimateTokens(decisionInput);
      return {
        provider,
        model,
        answer,
        inputTokens,
        outputTokens: 0,
        estimatedCostVnd: estimateJevCostVnd(inputTokens),
      };
    },
  };
}

/** Integer VND estimate for one Jev call (input tokens only). */
export function estimateJevCostVnd(inputTokens: number): number {
  return Math.round((inputTokens / 1000) * JEV_INPUT_VND_PER_1K);
}

function buildJevAnswer(
  request: AiProviderRequest,
  choice: string,
  confidence: number,
): string {
  const warningText =
    request.warnings.length === 0
      ? 'Không có cảnh báo nào từ dữ liệu hiện có.'
      : `Có ${request.warnings.length} điểm cần lưu ý.`;
  return (
    `Phân loại ${choice} (độ tin cậy ${confidence}). ` +
    `${summarizeDay(request.context)} ${warningText}${citationSuffix(request)}`
  );
}

/** Jev is opt-in only; it is never selected unless the flag is on (ADR 0008). */
export function isJevEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.TYPESAFE_JEV_ENABLED === 'true';
}

function buildProviderPrompt(request: AiProviderRequest): string {
  const warnings = request.warnings
    .map((warning) => `- ${warning.message} (${warning.formula})`)
    .join('\n');
  return (
    `Câu hỏi của chủ cửa hàng: ${request.question}\n` +
    `Dữ liệu đã tổng hợp: ${JSON.stringify(request.context.dayStats)}\n` +
    `Cảnh báo: ${warnings || 'không có'}`
  );
}

export interface AiProviderRegistry {
  readonly gemini?: AiProviderAdapter;
  readonly jev?: AiProviderAdapter;
}

/**
 * Resolve the provider adapter from Config without changing any module. The
 * deterministic adapter is the safe default; `gemini` is used only when a
 * registered adapter or a provider secret exists, and `jev` only when the
 * feature flag is on. Anything else degrades to the deterministic adapter
 * (ADR 0008, REQ-AI-004).
 */
export function resolveAiProvider(
  name: AiProviderName = 'rule-based',
  env: Record<string, string | undefined> = process.env,
  registry: AiProviderRegistry = {},
): AiProviderAdapter {
  if (name === 'gemini') {
    if (registry.gemini) {
      return registry.gemini;
    }
    const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
    if (apiKey) {
      return createGeminiProvider({
        apiKey,
        model: env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
      });
    }
  }
  if (name === 'jev') {
    if (registry.jev) {
      return registry.jev;
    }
    if (isJevEnabled(env)) {
      const apiKey = env.TYPESAFE_API_KEY ?? env.JEV_API_KEY;
      if (apiKey) {
        return createJevProvider({
          apiKey,
          model: env.JEV_MODEL ?? DEFAULT_JEV_MODEL,
        });
      }
    }
  }
  return createRuleBasedProvider();
}

export interface AiBudgetState {
  monthlyBudgetVnd: number;
  spentVnd: number;
}

/** The server stops a new AI call when this month's spend reaches the cap. */
export function isAiBudgetExhausted(state: AiBudgetState): boolean {
  return state.spentVnd >= state.monthlyBudgetVnd;
}

export function sumAiUsageCostVnd(
  records: Array<{ estimatedCostVnd: number }>,
): number {
  return records.reduce((sum, record) => sum + record.estimatedCostVnd, 0);
}

/** Tenant-local `yyyymm` budget period for a `yyyymmdd` day key. */
export function monthKeyFromDayKey(dayKey: string): string {
  return dayKey.slice(0, 6);
}

export const AI_BUDGET_COLLECTION = 'aiBudget';
/** Conservative output ceiling for one Gemini call, used to reserve budget. */
export const AI_MAX_OUTPUT_TOKENS = 1024;

export function aiBudgetPath(tenantId: string, monthKey: string): string {
  return `tenants/${tenantId}/${AI_BUDGET_COLLECTION}/${monthKey}`;
}

/**
 * Conservative integer-VND estimate reserved before a provider call. A
 * rule-based call has no external cost; Gemini and Jev reserve the estimated
 * input cost plus a bounded output ceiling (REQ-AI-005, NFR-AI-002).
 */
export function estimateAiReservationVnd(
  provider: string,
  inputText: string,
): number {
  const inputTokens = estimateTokens(inputText);
  if (provider === 'gemini') {
    return estimateGeminiCostVnd(inputTokens, AI_MAX_OUTPUT_TOKENS);
  }
  if (provider === 'jev') {
    return estimateJevCostVnd(inputTokens);
  }
  return 0;
}

export interface ReserveAiBudgetInput {
  tenantId: string;
  monthKey: string;
  monthlyBudgetVnd: number;
  estimatedCostVnd: number;
  now: string;
}

export interface AiBudgetReservation {
  reserved: boolean;
  /** Amount this call added to `reservedVnd`; zero when rejected. */
  reservedVnd: number;
  /** Month spend already committed by settled calls. */
  spentVnd: number;
  /** Month spend plus outstanding reservations after this attempt. */
  outstandingVnd: number;
}

/**
 * Atomically reserve part of the tenant monthly AI budget. The reservation
 * ledger is one document per tenant month, so concurrent calls conflict on the
 * same read and Firestore retries them. A call that cannot cover its estimate
 * is rejected, which prevents concurrent calls from exceeding the cap
 * (REQ-AI-005, NFR-AI-002).
 */
export async function reserveAiBudget(
  db: Firestore,
  input: ReserveAiBudgetInput,
): Promise<AiBudgetReservation> {
  const ref = db.doc(aiBudgetPath(input.tenantId, input.monthKey));
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const spentVnd = Number(snap.get('spentVnd') ?? 0);
    const reservedVnd = Number(snap.get('reservedVnd') ?? 0);
    const available = input.monthlyBudgetVnd - spentVnd - reservedVnd;
    if (available <= 0 || input.estimatedCostVnd > available) {
      return {
        reserved: false,
        reservedVnd: 0,
        spentVnd,
        outstandingVnd: reservedVnd,
      };
    }
    const nextReserved = reservedVnd + input.estimatedCostVnd;
    transaction.set(
      ref,
      {
        schemaVersion: AI_CONTRACT_VERSION,
        tenantId: input.tenantId,
        monthKey: input.monthKey,
        monthlyBudgetVnd: input.monthlyBudgetVnd,
        spentVnd,
        reservedVnd: nextReserved,
        updatedAt: input.now,
      },
      { merge: true },
    );
    return {
      reserved: true,
      reservedVnd: input.estimatedCostVnd,
      spentVnd,
      outstandingVnd: nextReserved,
    };
  });
}

export interface SettleAiBudgetInput {
  tenantId: string;
  monthKey: string;
  reservedVnd: number;
  actualCostVnd: number;
  now: string;
}

/**
 * Release a reservation and commit the actual integer-VND cost. Settling is
 * idempotent per reservation amount because the caller passes the same
 * reservation it received; the ledger never holds a negative reservation
 * (REQ-AI-005).
 */
export async function settleAiBudget(
  db: Firestore,
  input: SettleAiBudgetInput,
): Promise<void> {
  const ref = db.doc(aiBudgetPath(input.tenantId, input.monthKey));
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const spentVnd = Number(snap.get('spentVnd') ?? 0) + input.actualCostVnd;
    const reservedVnd = Math.max(
      0,
      Number(snap.get('reservedVnd') ?? 0) - input.reservedVnd,
    );
    transaction.set(
      ref,
      { spentVnd, reservedVnd, updatedAt: input.now },
      { merge: true },
    );
  });
}

export interface BuildAiUsageInput {
  usageId: string;
  tenantId: string;
  response: AiProviderResponse;
  monthKey: string;
  now: string;
  purpose?: AiPurpose;
}

export function buildAiUsageRecord(input: BuildAiUsageInput): AiUsageRecord {
  return aiUsageRecordSchema.parse({
    schemaVersion: AI_CONTRACT_VERSION,
    usageId: input.usageId,
    tenantId: input.tenantId,
    provider: input.response.provider,
    model: input.response.model,
    inputTokens: input.response.inputTokens,
    outputTokens: input.response.outputTokens,
    estimatedCostVnd: input.response.estimatedCostVnd,
    purpose: input.purpose ?? 'warnings',
    monthKey: input.monthKey,
    createdAt: input.now,
  });
}

export interface BuildAiResultInput {
  tenantId: string;
  question: string;
  context: SafeAiContext;
  warnings: AiWarning[];
  response: AiProviderResponse;
  now: string;
}

/** Latest server update time across the cited source data (REQ-AI-003). */
export function latestDataUpdatedAt(context: SafeAiContext): string | null {
  const times = context.dayStats
    .map((day) => day.updatedAt)
    .filter((value) => value.length > 0)
    .sort();
  return times.length > 0 ? times[times.length - 1] : null;
}

/**
 * Build the structured, grounded answer. Confidence is a bounded heuristic: it
 * drops when source data is missing (NFR-AI-001). The answer states the data
 * update time so the Owner can judge freshness (REQ-AI-003).
 */
export function buildAiResult(input: BuildAiResultInput) {
  const missingData = input.warnings.some(
    (warning) => warning.kind === 'missingData',
  );
  return aiAskResultSchema.parse({
    schemaVersion: AI_CONTRACT_VERSION,
    tenantId: input.tenantId,
    answer: input.response.answer,
    warnings: input.warnings,
    sources: input.context.sources,
    period: input.context.period,
    confidence: missingData ? 0.3 : 0.8,
    missingData,
    dataUpdatedAt: latestDataUpdatedAt(input.context),
    provider: input.response.provider,
    model: input.response.model,
    generatedAt: input.now,
  });
}
