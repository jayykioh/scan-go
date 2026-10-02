import {
  LOYALTY_CONTRACT_VERSION,
  LOYALTY_DEFAULT_EARN_RATE_VND,
  LOYALTY_DEFAULT_POINTS_PER_EARN_RATE,
  LOYALTY_DEFAULT_WELCOME_POINTS,
  type LoyaltyConfig,
  type LoyaltyMember,
  type LoyaltyMemberView,
  type LoyaltyTransaction,
} from '../contracts/loyalty.contract.js';
import { TENANT_A_FIXTURE } from './identity.fixture.js';

export const LOYALTY_MEMBER_ID_FIXTURE = 'member_84901234567';
export const LOYALTY_PHONE_FIXTURE = '+84901234567';
export const LOYALTY_CREATED_AT_FIXTURE = '2026-09-12T06:30:00.000Z';

export const loyaltyConfigFixture: LoyaltyConfig = {
  schemaVersion: LOYALTY_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  earnRateVnd: LOYALTY_DEFAULT_EARN_RATE_VND,
  pointsPerEarnRate: LOYALTY_DEFAULT_POINTS_PER_EARN_RATE,
  welcomePoints: LOYALTY_DEFAULT_WELCOME_POINTS,
  updatedAt: LOYALTY_CREATED_AT_FIXTURE,
};

export const loyaltyMemberFixture: LoyaltyMember = {
  schemaVersion: LOYALTY_CONTRACT_VERSION,
  memberId: LOYALTY_MEMBER_ID_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  phone: LOYALTY_PHONE_FIXTURE,
  displayName: 'Khách A',
  isVerified: true,
  pointBalance: 10,
  paidTotalVnd: 100000,
  visitCount: 1,
  verificationCodeHash: null,
  verificationExpiresAt: null,
  createdAt: LOYALTY_CREATED_AT_FIXTURE,
  updatedAt: LOYALTY_CREATED_AT_FIXTURE,
};

export const loyaltyMemberViewFixture: LoyaltyMemberView = {
  schemaVersion: LOYALTY_CONTRACT_VERSION,
  memberId: LOYALTY_MEMBER_ID_FIXTURE,
  displayName: 'Khách A',
  phone: LOYALTY_PHONE_FIXTURE,
  phoneVisible: true,
  isVerified: true,
  pointBalance: 10,
  paidTotalVnd: 100000,
  visitCount: 1,
  createdAt: LOYALTY_CREATED_AT_FIXTURE,
  updatedAt: LOYALTY_CREATED_AT_FIXTURE,
};

export const loyaltyEarnTransactionFixture: LoyaltyTransaction = {
  schemaVersion: LOYALTY_CONTRACT_VERSION,
  transactionId: 'loyalty_earn_order-fixture-001',
  tenantId: TENANT_A_FIXTURE,
  memberId: LOYALTY_MEMBER_ID_FIXTURE,
  kind: 'earn',
  points: 10,
  balanceAfter: 10,
  orderId: 'order-fixture-001',
  reason: null,
  idempotencyKey: 'idem-loyalty-0001',
  actorUid: null,
  createdAt: LOYALTY_CREATED_AT_FIXTURE,
};

export const loyaltyRedeemTransactionFixture: LoyaltyTransaction = {
  ...loyaltyEarnTransactionFixture,
  transactionId: 'loyalty_redeem_0001',
  kind: 'redeem',
  points: -5,
  balanceAfter: 5,
  orderId: null,
};

export const loyaltyReverseTransactionFixture: LoyaltyTransaction = {
  ...loyaltyEarnTransactionFixture,
  transactionId: 'loyalty_reverse_order-fixture-001',
  kind: 'reverse',
  points: -10,
  balanceAfter: 0,
  reason: 'refund',
};
