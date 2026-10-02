import {
  AI_CONTRACT_VERSION,
  aiEvaluationReportSchema,
  type AiEvaluationCase,
  type AiEvaluationMetric,
  type AiEvaluationReport,
} from '../../../../shared/contracts/ai.contract.js';
import { REPORTING_CONTRACT_VERSION } from '../../../../shared/contracts/reporting.contract.js';
import {
  assembleSafeContext,
  collectSourceIds,
  computeWarnings,
  type AiProviderAdapter,
  type AiProviderRequest,
} from './service.js';

const EVALUATION_DAY_KEY = '20260912';
const EVALUATION_NOW = '2026-09-13T00:00:00.000Z';
const VIETNAMESE_DIACRITIC =
  /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;

/**
 * Vietnamese quality is a bounded heuristic: the share of answer tokens that
 * carry Vietnamese diacritics. It is a signal for review, not a value that
 * changes the default provider (ADR 0008).
 */
export function vietnameseQualityScore(answer: string): number {
  const tokens = answer.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return 0;
  }
  const vietnamese = tokens.filter((token) =>
    VIETNAMESE_DIACRITIC.test(token),
  ).length;
  return Math.round((vietnamese / tokens.length) * 100) / 100;
}

/** Build the bounded, PII-free request every provider sees in evaluation. */
export function buildEvaluationRequest(
  testCase: AiEvaluationCase,
): AiProviderRequest {
  const context = assembleSafeContext({
    tenantId: 'evaluation-tenant',
    dayStats: [
      {
        stats: {
          schemaVersion: REPORTING_CONTRACT_VERSION,
          tenantId: 'evaluation-tenant',
          dayKey: EVALUATION_DAY_KEY,
          createdOrderCount: 3,
          cancelledOrderCount: 0,
          paidOrderCount: 2,
          reversedOrderCount: 0,
          refundedOrderCount: 0,
          revenueVnd: 200000,
          costVnd: 80000,
          grossProfitVnd: 120000,
          reversedVnd: 0,
          refundedVnd: 0,
          version: 1,
          updatedAt: EVALUATION_NOW,
        },
        items: [],
      },
    ],
    menuItems: [
      {
        menuItemId: 'item-pho-bo',
        name: 'Phở bò',
        priceVnd: 100000,
        costVnd: 44000,
      },
    ],
    ingredients: [],
  });
  return {
    question: testCase.input,
    context,
    warnings: computeWarnings(context),
  };
}

export interface RunProviderEvaluationOptions {
  cases: AiEvaluationCase[];
  providers: AiProviderAdapter[];
  baselineProvider: string;
  now?: string;
  /** Injectable millisecond clock so latency is deterministic in tests. */
  clock?: () => number;
}

function isGrounded(
  testCase: AiEvaluationCase,
  request: AiProviderRequest,
  answer: string,
): boolean {
  if (!testCase.expectsSource) {
    return answer.length > 0;
  }
  const wanted = collectSourceIds(request);
  return wanted.some((id) => answer.includes(id));
}

/**
 * Compare providers on cost per useful result, Vietnamese quality, grounding,
 * and latency. It only reports; it never changes the default provider
 * (G2-06, ADR 0008).
 */
export async function runProviderEvaluation(
  options: RunProviderEvaluationOptions,
): Promise<AiEvaluationReport> {
  const now = options.now ?? new Date().toISOString();
  const clock = options.clock ?? (() => Date.now());
  const metrics: AiEvaluationMetric[] = [];

  for (const provider of options.providers) {
    let callCount = 0;
    let usefulCount = 0;
    let groundedCount = 0;
    let totalQuality = 0;
    let totalCostVnd = 0;
    let totalLatencyMs = 0;

    for (const testCase of options.cases) {
      const request = buildEvaluationRequest(testCase);
      const start = clock();
      const response = await provider.generate(request);
      const latencyMs = Math.max(0, clock() - start);
      callCount += 1;
      totalLatencyMs += latencyMs;
      totalCostVnd += response.estimatedCostVnd;
      const quality = vietnameseQualityScore(response.answer);
      totalQuality += quality;
      const grounded = isGrounded(testCase, request, response.answer);
      if (grounded) {
        groundedCount += 1;
      }
      if (grounded && response.answer.length > 0 && quality >= 0.5) {
        usefulCount += 1;
      }
    }

    const costPerUsefulResultVnd =
      usefulCount > 0
        ? Math.round(totalCostVnd / usefulCount)
        : totalCostVnd;
    metrics.push({
      provider: provider.provider,
      model: provider.model,
      callCount,
      usefulCount,
      groundedCount,
      vietnameseQuality:
        callCount > 0 ? Math.round((totalQuality / callCount) * 100) / 100 : 0,
      totalCostVnd,
      costPerUsefulResultVnd,
      averageLatencyMs:
        callCount > 0 ? Math.round(totalLatencyMs / callCount) : 0,
    });
  }

  const baseline = metrics.find(
    (metric) => metric.provider === options.baselineProvider,
  );
  const candidates = metrics.filter(
    (metric) => metric.provider !== options.baselineProvider,
  );
  const recommendation = decideRecommendation(baseline, candidates);

  return aiEvaluationReportSchema.parse({
    schemaVersion: AI_CONTRACT_VERSION,
    caseCount: options.cases.length,
    baselineProvider: options.baselineProvider,
    metrics,
    recommendation,
    generatedAt: now,
  });
}

function decideRecommendation(
  baseline: AiEvaluationMetric | undefined,
  candidates: AiEvaluationMetric[],
): AiEvaluationReport['recommendation'] {
  if (!baseline || candidates.length === 0) {
    return 'evaluate-more';
  }
  const groundedAll = (metric: AiEvaluationMetric) =>
    metric.callCount > 0 && metric.groundedCount === metric.callCount;
  const adoptable = candidates.some(
    (candidate) =>
      groundedAll(candidate) &&
      candidate.vietnameseQuality >= 0.6 &&
      candidate.costPerUsefulResultVnd <= baseline.costPerUsefulResultVnd,
  );
  if (adoptable) {
    return 'adopt-candidate';
  }
  const worthMoreEvaluation = candidates.some(
    (candidate) =>
      candidate.vietnameseQuality >= 0.6 &&
      candidate.groundedCount > 0 &&
      candidate.costPerUsefulResultVnd <= baseline.costPerUsefulResultVnd * 1.5,
  );
  return worthMoreEvaluation ? 'evaluate-more' : 'keep-default';
}

/**
 * Offline Jev-shaped fixture provider for the evaluation harness. It is NOT the
 * TypeSafe adapter and never becomes the default; it lets the report run
 * without an early-access contract (G2-06, SRS Q-4).
 */
export function createJevFixtureProvider(): AiProviderAdapter {
  const provider = 'jev';
  const model = 'jev-1.13.0-fixture';
  return {
    provider,
    model,
    async generate(request: AiProviderRequest) {
      const sourceIds = collectSourceIds(request);
      const answer =
        `Phân loại ưu tiên (độ tin cậy 0.7). ` +
        `Có ${request.warnings.length} điểm cần lưu ý. ` +
        `Nguồn: ${sourceIds.join(', ') || 'chưa có'}.`;
      return {
        provider,
        model,
        answer,
        inputTokens: Math.max(1, request.question.length),
        outputTokens: 0,
        estimatedCostVnd: Math.max(1, Math.round(request.question.length / 100)),
      };
    },
  };
}
