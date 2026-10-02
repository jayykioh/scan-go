/**
 * Offline provider evaluation script (G2-06, ADR 0008).
 *
 * Runs the default deterministic provider against a Jev-shaped fixture over a
 * fixed masked Vietnamese case set and prints the comparison report. It never
 * calls TypeSafe, never needs a secret, and never changes the default provider.
 *
 * Run: npm --workspace functions run ai:evaluate
 */
import { aiEvaluationCaseSchema } from '../../../../shared/contracts/ai.contract.js';
import {
  createJevFixtureProvider,
  runProviderEvaluation,
} from './evaluation.js';
import { createRuleBasedProvider } from './service.js';

const RAW_CASES = [
  {
    caseId: 'qa-loss',
    input: 'Món nào đang bán dưới giá vốn?',
    expectsSource: true,
  },
  {
    caseId: 'qa-stock',
    input: 'Nguyên liệu nào sắp hết?',
    expectsSource: true,
  },
  {
    caseId: 'qa-feedback',
    input: 'Khách phàn nàn nhiều nhất về vấn đề gì?',
    expectsSource: true,
  },
  {
    caseId: 'qa-missing',
    input: 'Tuần này lợi nhuận thế nào nếu chưa có dữ liệu?',
    expectsSource: false,
  },
];

async function main(): Promise<void> {
  const cases = RAW_CASES.map((entry) => aiEvaluationCaseSchema.parse(entry));
  const report = await runProviderEvaluation({
    cases,
    providers: [createRuleBasedProvider(), createJevFixtureProvider()],
    baselineProvider: 'rule-based',
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const invokedDirectly =
  process.argv[1]?.endsWith('evaluation.cli.ts') ||
  process.argv[1]?.endsWith('evaluation.cli.js') ||
  false;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
