import { describe, expect, it } from 'vitest';
import { resolvePlanEntitlements } from '@contracts/subscription.contract';
import {
  allowsFeature,
  formatPlanLabel,
  formatPlanLimit,
} from './subscription-view';

/**
 * Subscription view helpers must render the server plan and entitlements, so a
 * hard-coded local plan label can never drift from the server state
 * (REQ-SUB-001).
 */
describe('formatPlanLabel', () => {
  it('renders the server plan code in Owner language', () => {
    expect(formatPlanLabel('free')).toBe('Free');
    expect(formatPlanLabel('lite')).toBe('Lite');
    expect(formatPlanLabel('pro')).toBe('Pro');
  });
});

describe('allowsFeature', () => {
  it('reads the feature list from the server entitlements', () => {
    const lite = resolvePlanEntitlements('lite');
    expect(allowsFeature(lite, 'loyalty')).toBe(true);
    expect(allowsFeature(lite, 'nfc')).toBe(false);

    const pro = resolvePlanEntitlements('pro');
    expect(allowsFeature(pro, 'nfc')).toBe(true);
    expect(allowsFeature(pro, 'ai')).toBe(true);
  });
});

describe('formatPlanLimit', () => {
  it('shows a number limit or unlimited', () => {
    expect(formatPlanLimit(3, 'bàn')).toBe('3 bàn');
    expect(formatPlanLimit(null, 'bàn')).toBe('Không giới hạn bàn');
  });
});
