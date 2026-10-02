import {
  FULFILMENT_CONTRACT_VERSION,
  type FulfilmentCommandResult,
  type FulfilmentMarkReadyInput,
  type FulfilmentMarkServedInput,
  type FulfilmentStartCookingInput,
} from '../contracts/fulfilment.contract.js';
import type { OrderSnapshot } from '../contracts/order.contract.js';
import {
  ORDER_ID_FIXTURE,
  ORDER_TRACKING_TOKEN_FIXTURE,
  orderLineFixture,
  pendingOrderFixture,
} from './order.fixture.js';
import { orderDeductionPlanFixture } from './inventory.fixture.js';
import { TENANT_A_FIXTURE } from './identity.fixture.js';

export const KITCHEN_IDEMPOTENCY_KEY_FIXTURE = 'idem-kitchen-0001';
export const KITCHEN_ACTOR_UID_FIXTURE = 'uid-kitchen-001';

/**
 * Acceptance bound for REQ-KDS-001 and NFR-RT-001: authorized Customer and
 * Staff views must receive a committed Kitchen change within two seconds.
 */
export const KITCHEN_UPDATE_BOUND_MS = 2000;

export const fulfilmentStartCookingInputFixture: FulfilmentStartCookingInput = {
  tenantId: TENANT_A_FIXTURE,
  orderId: ORDER_ID_FIXTURE,
  idempotencyKey: KITCHEN_IDEMPOTENCY_KEY_FIXTURE,
};

export const fulfilmentMarkReadyInputFixture: FulfilmentMarkReadyInput = {
  tenantId: TENANT_A_FIXTURE,
  orderId: ORDER_ID_FIXTURE,
  idempotencyKey: 'idem-kitchen-0002',
};

/** Cooking snapshots the recipe Cost onto the Order lines. */
export const cookingOrderFixture: OrderSnapshot = {
  ...pendingOrderFixture,
  status: 'cooking',
  items: [
    {
      ...orderLineFixture,
      unitCostVnd: 38000,
      lineCostVnd: 76000,
    },
  ],
  updatedAt: '2026-09-12T07:05:00.000Z',
};

export const readyOrderFixture: OrderSnapshot = {
  ...cookingOrderFixture,
  status: 'ready',
  updatedAt: '2026-09-12T07:10:00.000Z',
};

export const servedOrderFixture: OrderSnapshot = {
  ...readyOrderFixture,
  status: 'served',
  updatedAt: '2026-09-12T07:15:00.000Z',
};

export const WAITER_IDEMPOTENCY_KEY_FIXTURE = 'idem-waiter-0001';
export const WAITER_ACTOR_UID_FIXTURE = 'uid-waiter-001';

export const fulfilmentMarkServedInputFixture: FulfilmentMarkServedInput = {
  tenantId: TENANT_A_FIXTURE,
  orderId: ORDER_ID_FIXTURE,
  idempotencyKey: WAITER_IDEMPOTENCY_KEY_FIXTURE,
};

export const markServedResultFixture: FulfilmentCommandResult = {
  schemaVersion: FULFILMENT_CONTRACT_VERSION,
  command: 'markServed',
  status: 'applied',
  order: servedOrderFixture,
  deduction: null,
  movementIds: [],
  appliedAt: '2026-09-12T07:15:00.000Z',
};

export const startCookingResultFixture: FulfilmentCommandResult = {
  schemaVersion: FULFILMENT_CONTRACT_VERSION,
  command: 'startCooking',
  status: 'applied',
  order: cookingOrderFixture,
  deduction: orderDeductionPlanFixture,
  movementIds: orderDeductionPlanFixture.lines.map((line) => line.movementId),
  appliedAt: '2026-09-12T07:05:00.000Z',
};

export const replayedStartCookingResultFixture: FulfilmentCommandResult = {
  ...startCookingResultFixture,
  status: 'replayed',
  deduction: null,
  movementIds: [],
};

/**
 * Realtime harness sample. Tests measure one committed change against the
 * two-second bound; this fixture records the p95 evidence shape.
 */
export const realtimeTimingSampleFixture = {
  trackingToken: ORDER_TRACKING_TOKEN_FIXTURE,
  boundMs: KITCHEN_UPDATE_BOUND_MS,
  sampleMs: 1200,
  withinBound: true,
} as const;
