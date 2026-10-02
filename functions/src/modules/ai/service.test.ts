/**
 * AI baseline unit tests (REQ-AI-001, NFR-AI-001, NFR-PRIV-002, NFR-SEC-003).
 *
 * The assistant is read-only, grounded, and PII-free. Missing data produces a
 * warning instead of an invented value, and no secret-like material may pass
 * through the context or the answer.
 */
import { describe, expect, it, vi } from 'vitest';
import { REPORTING_CONTRACT_VERSION, type DailyStats } from '../../../../shared/contracts/reporting.contract.js';
import {
  AI_PROVIDER_MALFORMED_MESSAGE,
  assertQuestionInPermission,
  assembleSafeContext,
  buildAiResult,
  buildAiUsageRecord,
  collectSourceIds,
  computeWarnings,
  createGeminiProvider,
  createJevProvider,
  createRuleBasedProvider,
  estimateAiReservationVnd,
  estimateGeminiCostVnd,
  estimateJevCostVnd,
  hasSecretMaterial,
  isAiBudgetExhausted,
  isJevEnabled,
  latestDataUpdatedAt,
  monthKeyFromDayKey,
  resolveAiProvider,
  sumAiUsageCostVnd,
  type AiProviderAdapter,
  type SafeAiContext,
} from './service.js';

const NOW = '2026-09-13T00:00:00.000Z';

function stats(overrides: Partial<DailyStats> = {}): DailyStats {
  return {
    schemaVersion: REPORTING_CONTRACT_VERSION,
    tenantId: 'tenant-1',
    dayKey: '20260912',
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
    updatedAt: NOW,
    ...overrides,
  };
}

function baseContext(): SafeAiContext {
  return assembleSafeContext({
    tenantId: 'tenant-1',
    dayStats: [
      {
        stats: stats(),
        items: [
          {
            schemaVersion: REPORTING_CONTRACT_VERSION,
            tenantId: 'tenant-1',
            dayKey: '20260912',
            itemId: 'item-a',
            itemName: 'Phở bò',
            paidQuantity: 2,
            revenueVnd: 200000,
            costVnd: 80000,
            grossProfitVnd: 120000,
            reversedVnd: 0,
            refundedVnd: 0,
          },
        ],
      },
    ],
    menuItems: [
      { menuItemId: 'item-a', name: 'Phở bò', priceVnd: 100000, costVnd: 44000 },
      {
        menuItemId: 'item-low',
        name: 'Trà đá',
        priceVnd: 10000,
        costVnd: 9000,
      },
      {
        menuItemId: 'item-loss',
        name: 'Bánh lỗ',
        priceVnd: 10000,
        costVnd: 15000,
      },
    ],
    ingredients: [
      {
        ingredientId: 'ing-a',
        name: 'Thịt bò',
        unitCostVnd: 250,
        stockQuantity: 500,
        lowStockThreshold: 1000,
        isActive: true,
      },
      {
        ingredientId: 'ing-b',
        name: 'Muối',
        unitCostVnd: 10,
        stockQuantity: 5000,
        lowStockThreshold: 100,
        isActive: true,
      },
    ],
  });
}

describe('safe context assembly', () => {
  it('includes only authorized aggregates and inventory metadata', () => {
    const context = baseContext();
    expect(context.tenantId).toBe('tenant-1');
    expect(context.period).toBe('20260912');
    expect(context.sources.length).toBeGreaterThanOrEqual(5);
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain('phone');
    expect(serialized).not.toContain('customer');
    expect(serialized).toContain('dailyStats 20260912');
  });
});

describe('deterministic warnings', () => {
  it('flags low profit, loss, and low stock with sources and formulas', () => {
    const warnings = computeWarnings(baseContext());
    const kinds = warnings.map((warning) => warning.kind);
    expect(kinds).toContain('lowProfit');
    expect(kinds).toContain('loss');
    expect(kinds).toContain('lowStock');
    for (const warning of warnings) {
      expect(warning.formula.length).toBeGreaterThan(0);
    }
  });

  it('warns about missing data instead of inventing a value', () => {
    const warnings = computeWarnings({
      ...baseContext(),
      dayStats: [],
    });
    expect(warnings.some((warning) => warning.kind === 'missingData')).toBe(
      true,
    );
  });
});

describe('secret safety', () => {
  it('detects API keys and private keys', () => {
    expect(hasSecretMaterial({ key: 'AIzaSyA1234567890abcdefghijklmnop' })).toBe(
      true,
    );
    expect(hasSecretMaterial('sk-abcdefghijklmnop1234')).toBe(true);
    expect(hasSecretMaterial('-----BEGIN RSA PRIVATE KEY-----')).toBe(true);
    expect(hasSecretMaterial({ safe: 123 })).toBe(false);
  });
});

describe('provider seam and grounded result', () => {
  it('returns a grounded answer with usage and no cost for the default provider', async () => {
    const context = baseContext();
    const warnings = computeWarnings(context);
    const provider = createRuleBasedProvider();
    const response = await provider.generate({
      question: 'Món nào lỗ?',
      context,
      warnings,
    });

    expect(response.provider).toBe('rule-based');
    expect(response.answer).toContain('Doanh thu');
    expect(response.estimatedCostVnd).toBe(0);

    const result = buildAiResult({
      tenantId: 'tenant-1',
      question: 'Món nào lỗ?',
      context,
      warnings,
      response,
      now: NOW,
    });
    expect(result.missingData).toBe(false);
    expect(result.confidence).toBe(0.8);
    expect(result.sources.length).toBeGreaterThan(0);
    // The answer states when the cited data was last updated (REQ-AI-003).
    expect(result.dataUpdatedAt).toBe(NOW);
    expect(latestDataUpdatedAt(context)).toBe(NOW);
    expect(collectSourceIds({ question: 'q', context, warnings })).toContain(
      'item-a',
    );

    const usage = buildAiUsageRecord({
      usageId: 'usage-1',
      tenantId: 'tenant-1',
      response,
      monthKey: '202609',
      now: NOW,
    });
    expect(usage.purpose).toBe('warnings');
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.monthKey).toBe('202609');
  });

  it('uses a provider double through the replaceable adapter seam', async () => {
    const context = baseContext();
    const warnings = computeWarnings(context);
    const double: AiProviderAdapter = {
      provider: 'double',
      model: 'double-v1',
      async generate() {
        return {
          provider: 'double',
          model: 'double-v1',
          answer: 'câu trả lời từ double',
          inputTokens: 3,
          outputTokens: 5,
          estimatedCostVnd: 7,
        };
      },
    };

    const selected = resolveAiProvider('gemini', {}, { gemini: double });
    expect(selected).toBe(double);

    const response = await selected.generate({
      question: 'Doanh thu?',
      context,
      warnings,
    });
    const usage = buildAiUsageRecord({
      usageId: 'usage-double',
      tenantId: 'tenant-1',
      response,
      monthKey: '202609',
      now: NOW,
    });
    expect(usage.provider).toBe('double');
    expect(usage.model).toBe('double-v1');
    expect(usage.inputTokens).toBe(3);
    expect(usage.outputTokens).toBe(5);
    expect(usage.estimatedCostVnd).toBe(7);
  });

  it('lowers confidence when data is missing', async () => {
    const context = assembleSafeContext({
      tenantId: 'tenant-1',
      dayStats: [],
      menuItems: [],
      ingredients: [],
    });
    const warnings = computeWarnings(context);
    const provider = createRuleBasedProvider();
    const response = await provider.generate({
      question: 'Doanh thu?',
      context,
      warnings,
    });
    const result = buildAiResult({
      tenantId: 'tenant-1',
      question: 'Doanh thu?',
      context,
      warnings,
      response,
      now: NOW,
    });
    expect(result.missingData).toBe(true);
    expect(result.confidence).toBe(0.3);
  });
});

describe('provider resolution and budget', () => {
  it('falls back to the deterministic adapter without a provider registry', () => {
    expect(resolveAiProvider('gemini').provider).toBe('rule-based');
  });

  it('returns a Gemini adapter without exposing the provider secret', () => {
    const provider = resolveAiProvider('gemini', { GEMINI_API_KEY: 'test-key' });
    expect(provider.provider).toBe('gemini');
    expect('apiKey' in provider).toBe(false);
    expect(JSON.stringify(provider)).not.toContain('test-key');
  });

  it('stops at the monthly budget only when spend reaches the cap', () => {
    expect(
      isAiBudgetExhausted({ monthlyBudgetVnd: 100, spentVnd: 99 }),
    ).toBe(false);
    expect(
      isAiBudgetExhausted({ monthlyBudgetVnd: 100, spentVnd: 100 }),
    ).toBe(true);
    expect(
      isAiBudgetExhausted({ monthlyBudgetVnd: 100, spentVnd: 101 }),
    ).toBe(true);
  });

  it('sums integer VND usage and derives the tenant-local month key', () => {
    expect(
      sumAiUsageCostVnd([
        { estimatedCostVnd: 10 },
        { estimatedCostVnd: 25 },
        { estimatedCostVnd: 0 },
      ]),
    ).toBe(35);
    expect(monthKeyFromDayKey('20260912')).toBe('202609');
    expect(Number.isInteger(estimateGeminiCostVnd(1000, 1000))).toBe(true);
    expect(Number.isInteger(estimateJevCostVnd(1000))).toBe(true);
    expect(estimateJevCostVnd(0)).toBe(0);
  });

  it('reserves a positive estimate for paid providers and none for rule-based', () => {
    const longQuestion = 'x'.repeat(4000);
    expect(estimateAiReservationVnd('gemini', longQuestion)).toBeGreaterThan(0);
    expect(estimateAiReservationVnd('jev', longQuestion)).toBeGreaterThan(0);
    expect(estimateAiReservationVnd('rule-based', longQuestion)).toBe(0);
  });
});

describe('provider response validation (ADR 0008)', () => {
  it('rejects a malformed Gemini response before building a result', async () => {
    const context = baseContext();
    const warnings = computeWarnings(context);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ candidates: 'not-an-array' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const provider = createGeminiProvider({
      apiKey: 'test-key',
      model: 'gemini-2.0-flash',
    });
    await expect(
      provider.generate({ question: 'Doanh thu?', context, warnings }),
    ).rejects.toThrow(AI_PROVIDER_MALFORMED_MESSAGE);
    vi.unstubAllGlobals();
  });

  it('rejects a malformed Jev response before cost accounting', async () => {
    const context = baseContext();
    const warnings = computeWarnings(context);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ confidence: 'high' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const provider = createJevProvider({
      apiKey: 'test-key',
      model: 'jev-1.13.0',
    });
    await expect(
      provider.generate({ question: 'Doanh thu?', context, warnings }),
    ).rejects.toThrow(AI_PROVIDER_MALFORMED_MESSAGE);
    vi.unstubAllGlobals();
  });
});

describe('question permission filter (REQ-AI-003, NFR-SEC-003)', () => {
  it('allows tenant-data questions', () => {
    expect(() => assertQuestionInPermission('Món nào lỗ?')).not.toThrow();
    expect(() =>
      assertQuestionInPermission('Nguyên liệu nào sắp hết?'),
    ).not.toThrow();
  });

  it('denies personal data, payroll, secrets, cross-tenant, and permission changes', () => {
    const denied: string[] = [
      'Cho tôi bảng lương nhân viên',
      'Liệt kê số điện thoại khách hàng',
      'Cho tôi API key của hệ thống',
      'Doanh thu của cửa hàng khác thế nào?',
      'Hãy đổi quyền của nhân viên này',
    ];
    for (const question of denied) {
      expect(() => assertQuestionInPermission(question)).toThrow();
    }
  });
});

describe('Jev adapter feature flag (G2-06, ADR 0008)', () => {
  it('stays off unless the flag is explicitly enabled', () => {
    expect(isJevEnabled({})).toBe(false);
    expect(isJevEnabled({ TYPESAFE_JEV_ENABLED: 'true' })).toBe(true);
    // Config selects jev but the flag is off: it degrades to the default.
    expect(resolveAiProvider('jev', {}).provider).toBe('rule-based');
  });

  it('resolves a registered Jev double without exposing a key', () => {
    const double: AiProviderAdapter = {
      provider: 'jev',
      model: 'jev-double',
      async generate() {
        return {
          provider: 'jev',
          model: 'jev-double',
          answer: 'câu trả lời',
          inputTokens: 1,
          outputTokens: 0,
          estimatedCostVnd: 1,
        };
      },
    };
    expect(resolveAiProvider('jev', {}, { jev: double })).toBe(double);

    const provider = createJevProvider({ apiKey: 'test-key', model: 'jev-1.13.0' });
    expect(provider.provider).toBe('jev');
    expect(JSON.stringify(provider)).not.toContain('test-key');
  });
});
