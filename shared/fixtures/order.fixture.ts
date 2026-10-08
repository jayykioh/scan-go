import {
  ORDER_CONTRACT_VERSION,
  type OrderLineSnapshot,
  type OrderSnapshot,
  type OrderStatusEvent,
  type OrderSubmitResult,
  type OrderSubmitInput,
  type PublicOrderTracking,
} from '../contracts/order.contract.js';
import { MENU_ITEM_ID_FIXTURE } from './catalog.fixture.js';
import { TENANT_A_FIXTURE } from './identity.fixture.js';
import { TABLE_ID_FIXTURE } from './table.fixture.js';

export const ORDER_ID_FIXTURE = 'order-pho-001';
export const ORDER_TRACKING_TOKEN_FIXTURE = 'track_9f3a1b7c';
export const ORDER_IDEMPOTENCY_KEY_FIXTURE = 'idem-customer-0001';
export const ORDER_MODIFIER_OPTION_ID_FIXTURE = 'opt-trung';

const CREATED_AT = '2026-09-12T07:00:00.000Z';
const UPDATED_AT = '2026-09-12T07:00:05.000Z';

export const orderLineFixture: OrderLineSnapshot = {
  lineId: 'line-001',
  menuItemId: MENU_ITEM_ID_FIXTURE,
  name: 'Phở bò',
  modifiers: [
    { optionId: ORDER_MODIFIER_OPTION_ID_FIXTURE, name: 'Trứng', priceDeltaVnd: 5000 },
  ],
  unitPriceVnd: 50000,
  quantity: 2,
  lineTotalVnd: 100000,
  unitCostVnd: 22000,
  lineCostVnd: 44000,
};

export const pendingOrderFixture: OrderSnapshot = {
  schemaVersion: ORDER_CONTRACT_VERSION,
  orderId: ORDER_ID_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  orderType: 'dineIn',
  tableId: TABLE_ID_FIXTURE,
  tableNameSnapshot: 'Bàn 5',
  status: 'pending',
  paymentMode: 'payLater',
  items: [orderLineFixture],
  subtotalVnd: 100000,
  totalVnd: 100000,
  trackingToken: ORDER_TRACKING_TOKEN_FIXTURE,
  idempotencyKey: ORDER_IDEMPOTENCY_KEY_FIXTURE,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

export const orderSubmitInputFixture: OrderSubmitInput = {
  token: 'tok_new_9f3a',
  paymentMode: 'payLater',
  idempotencyKey: ORDER_IDEMPOTENCY_KEY_FIXTURE,
  lines: [
    {
      menuItemId: MENU_ITEM_ID_FIXTURE,
      quantity: 2,
      selectedOptionIds: [ORDER_MODIFIER_OPTION_ID_FIXTURE],
    },
  ],
};

export const orderStatusEventFixture: OrderStatusEvent = {
  schemaVersion: ORDER_CONTRACT_VERSION,
  eventId: 'event-001',
  previousStatus: null,
  newStatus: 'pending',
  actorType: 'customer',
  actorUid: null,
  reason: null,
  createdAt: CREATED_AT,
};

export const publicOrderTrackingFixture: PublicOrderTracking = {
  schemaVersion: ORDER_CONTRACT_VERSION,
  trackingToken: ORDER_TRACKING_TOKEN_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  orderId: ORDER_ID_FIXTURE,
  orderType: 'dineIn',
  tableName: 'Bàn 5',
  itemSummary: '2x Phở bò (Trứng)',
  totalVnd: 100000,
  status: 'pending',
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

export const createdOrderResultFixture: OrderSubmitResult = {
  schemaVersion: ORDER_CONTRACT_VERSION,
  status: 'created',
  order: pendingOrderFixture,
  tracking: publicOrderTrackingFixture,
  replayed: false,
};

export const replayedOrderResultFixture: OrderSubmitResult = {
  ...createdOrderResultFixture,
  replayed: true,
};
