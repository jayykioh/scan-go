import {
  SUBSCRIPTION_CONTRACT_VERSION,
  resolvePlanEntitlements,
  type SubscriptionState,
} from '../contracts/subscription.contract.js';
import { TENANT_A_FIXTURE } from './identity.fixture.js';

export const SUBSCRIPTION_UPDATED_AT_FIXTURE = '2026-09-12T06:00:00.000Z';

export const proSubscriptionStateFixture: SubscriptionState = {
  schemaVersion: SUBSCRIPTION_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  plan: 'pro',
  entitlements: resolvePlanEntitlements('pro'),
  updatedAt: SUBSCRIPTION_UPDATED_AT_FIXTURE,
};

export const freeSubscriptionStateFixture: SubscriptionState = {
  schemaVersion: SUBSCRIPTION_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  plan: 'free',
  entitlements: resolvePlanEntitlements('free'),
  updatedAt: SUBSCRIPTION_UPDATED_AT_FIXTURE,
};

export const liteSubscriptionStateFixture: SubscriptionState = {
  schemaVersion: SUBSCRIPTION_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  plan: 'lite',
  entitlements: resolvePlanEntitlements('lite'),
  updatedAt: SUBSCRIPTION_UPDATED_AT_FIXTURE,
};
