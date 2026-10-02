import {
  AI_CONTRACT_VERSION,
  type AiAskResult,
  type AiEvaluationReport,
  type AiFeedbackGroupingResult,
  type AiInsight,
  type AiUsageRecord,
  type AiWeeklyAnalysisResult,
} from '../contracts/ai.contract.js';
import { TENANT_A_FIXTURE } from './identity.fixture.js';

/** One grounded Owner answer with a citation per claim (REQ-AI-001). */
export const AI_NOW_FIXTURE = '2026-09-13T00:00:00.000Z';

export const aiAskResultFixture: AiAskResult = {
  schemaVersion: AI_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  answer: 'Doanh thu đã thu: 200000 VND; giá vốn: 88000 VND; lãi gộp: 112000 VND.',
  warnings: [
    {
      kind: 'lowStock',
      severity: 'warning',
      subjectId: 'ingredient-beef-001',
      subjectName: 'Thịt bò',
      message: 'Thịt bò đã chạm ngưỡng tồn kho thấp.',
      sourceIds: ['ingredient-beef-001'],
      formula: 'stockQuantity <= lowStockThreshold',
    },
  ],
  sources: [
    {
      type: 'dailyStats',
      id: '20260912',
      label: 'dailyStats 20260912',
      period: '20260912',
    },
    {
      type: 'menuItem',
      id: 'item-pho-bo-001',
      label: 'Phở bò',
      period: null,
    },
    {
      type: 'ingredient',
      id: 'ingredient-beef-001',
      label: 'Thịt bò',
      period: null,
    },
  ],
  period: '20260912',
  confidence: 0.8,
  missingData: false,
  dataUpdatedAt: AI_NOW_FIXTURE,
  provider: 'rule-based',
  model: 'deterministic-v1',
  generatedAt: AI_NOW_FIXTURE,
};

export const aiUsageRecordFixture: AiUsageRecord = {
  schemaVersion: AI_CONTRACT_VERSION,
  usageId: 'usage-001',
  tenantId: TENANT_A_FIXTURE,
  provider: 'rule-based',
  model: 'deterministic-v1',
  inputTokens: 12,
  outputTokens: 48,
  estimatedCostVnd: 0,
  purpose: 'warnings',
  monthKey: '202609',
  createdAt: AI_NOW_FIXTURE,
};

/** One grounded weekly Insight with a cited source (REQ-AI-002). */
export const aiInsightFixture: AiInsight = {
  schemaVersion: AI_CONTRACT_VERSION,
  insightId: `${TENANT_A_FIXTURE}-insight-20260907-20260913-00`,
  tenantId: TENANT_A_FIXTURE,
  analysisKey: `${TENANT_A_FIXTURE}:20260907:20260913`,
  department: 'inventory',
  priority: 'medium',
  periodStart: '20260907',
  periodEnd: '20260913',
  title: 'Nguyên liệu sắp hết',
  detail: 'Thịt bò đã chạm ngưỡng tồn kho thấp.',
  sourceIds: ['ingredient-beef-001'],
  confidence: 0.8,
  missingData: false,
  missingDataNotes: [],
  status: 'new',
  provider: 'rule-based',
  model: 'deterministic-v1',
  generatedAt: AI_NOW_FIXTURE,
};

export const aiWeeklyAnalysisResultFixture: AiWeeklyAnalysisResult = {
  schemaVersion: AI_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  periodStart: '20260907',
  periodEnd: '20260913',
  insightIds: [aiInsightFixture.insightId],
  insightCount: 1,
  missingData: false,
  provider: 'rule-based',
  model: 'deterministic-v1',
  generatedAt: AI_NOW_FIXTURE,
};

/** One grouped theme that cites its masked source feedback (REQ-FDB-002). */
export const aiFeedbackGroupingResultFixture: AiFeedbackGroupingResult = {
  schemaVersion: AI_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  themes: [
    {
      themeId: 'service',
      label: 'Thái độ và tốc độ phục vụ',
      department: 'operations',
      sentiment: 'negative',
      feedbackCount: 1,
      sourceFeedbackIds: ['feedback-unverified-001'],
      maskedExamples: ['Nhân viên gọi số [redacted] chưa tới bàn.'],
    },
  ],
  processedCount: 1,
  maskedCount: 1,
  provider: 'rule-based',
  model: 'deterministic-v1',
  generatedAt: AI_NOW_FIXTURE,
};

/** Offline provider comparison report; it keeps the default (G2-06). */
export const aiEvaluationReportFixture: AiEvaluationReport = {
  schemaVersion: AI_CONTRACT_VERSION,
  caseCount: 2,
  baselineProvider: 'rule-based',
  metrics: [
    {
      provider: 'rule-based',
      model: 'deterministic-v1',
      callCount: 2,
      usefulCount: 2,
      groundedCount: 2,
      vietnameseQuality: 0.8,
      totalCostVnd: 0,
      costPerUsefulResultVnd: 0,
      averageLatencyMs: 0,
    },
    {
      provider: 'jev',
      model: 'jev-1.13.0-fixture',
      callCount: 2,
      usefulCount: 1,
      groundedCount: 2,
      vietnameseQuality: 0.7,
      totalCostVnd: 120,
      costPerUsefulResultVnd: 120,
      averageLatencyMs: 5,
    },
  ],
  recommendation: 'keep-default',
  generatedAt: AI_NOW_FIXTURE,
};
