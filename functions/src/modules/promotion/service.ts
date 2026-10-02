import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import type { ZodType } from 'zod';
import {
  PROMOTION_CONTRACT_VERSION,
  promotionEvaluateInputSchema,
  promotionListInputSchema,
  promotionSetStatusInputSchema,
  promotionSchema,
  promotionUpsertInputSchema,
  type Promotion,
  type PromotionCartLine,
  type PromotionEvaluateInput,
  type PromotionListInput,
  type PromotionSetStatusInput,
  type PromotionUpsertInput,
} from '../../../../shared/contracts/promotion.contract.js';

export const PROMOTION_INVALID_MESSAGE = 'Dữ liệu khuyến mãi không hợp lệ.';
export const PROMOTION_MEMBER_DENIED_MESSAGE =
  'Bạn không thuộc cửa hàng này.';
export const PROMOTION_OWNER_DENIED_MESSAGE =
  'Chỉ chủ cửa hàng quản lý được khuyến mãi.';
export const PROMOTION_NOT_FOUND_MESSAGE = 'Không tìm thấy khuyến mãi.';
export const PROMOTION_MENU_ITEM_MISSING_MESSAGE =
  'Món trong giỏ không còn khả dụng.';

export function nowIso(): string {
  return new Date().toISOString();
}

export function requireUid(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Cần đăng nhập để thực hiện thao tác này.',
    );
  }
  return uid;
}

function parseOrInvalid<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', PROMOTION_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function assertActiveOwnerMember(
  memberData: DocumentData | undefined,
): void {
  if (!memberData || memberData.isActive === false) {
    throw new HttpsError(
      'permission-denied',
      PROMOTION_MEMBER_DENIED_MESSAGE,
    );
  }
  if (memberData.membershipType !== 'owner') {
    throw new HttpsError(
      'permission-denied',
      PROMOTION_OWNER_DENIED_MESSAGE,
    );
  }
}

export function parsePromotionEvaluateInput(
  data: unknown,
): PromotionEvaluateInput {
  return parseOrInvalid<PromotionEvaluateInput>(
    promotionEvaluateInputSchema,
    data,
  );
}

export function parsePromotionUpsertInput(
  data: unknown,
): PromotionUpsertInput {
  return parseOrInvalid<PromotionUpsertInput>(promotionUpsertInputSchema, data);
}

export function parsePromotionSetStatusInput(
  data: unknown,
): PromotionSetStatusInput {
  return parseOrInvalid<PromotionSetStatusInput>(
    promotionSetStatusInputSchema,
    data,
  );
}

export function parsePromotionListInput(data: unknown): PromotionListInput {
  return parseOrInvalid<PromotionListInput>(promotionListInputSchema, data);
}

export function mapStoredPromotion(
  promotionId: string,
  tenantId: string,
  data: DocumentData,
): Promotion {
  return promotionSchema.parse({ ...data, promotionId, tenantId });
}

export interface BuildPromotionDocumentInput {
  promotionId: string;
  tenantId: string;
  name: string;
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
  eligibility: PromotionUpsertInput['eligibility'];
  benefit: PromotionUpsertInput['benefit'];
  status: Promotion['status'];
  now: string;
  createdAt: string;
}

export function buildPromotionDocument(
  input: BuildPromotionDocumentInput,
): Promotion {
  return promotionSchema.parse({
    schemaVersion: PROMOTION_CONTRACT_VERSION,
    promotionId: input.promotionId,
    tenantId: input.tenantId,
    name: input.name,
    status: input.status,
    priority: input.priority,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    eligibility: input.eligibility,
    benefit: input.benefit,
    createdAt: input.createdAt,
    updatedAt: input.now,
    archivedAt: input.status === 'archived' ? input.now : null,
  });
}

export interface EvaluatedCart {
  subtotalVnd: number;
  lines: Array<PromotionCartLine & { lineTotalVnd: number }>;
}

/**
 * Resolve the authoritative cart from the public menu projection. The client
 * sends only menu item ids and quantities, so no client money reaches the
 * calculation (REQ-PRO-001, NFR-DATA-001).
 */
export async function resolvePromotionCart(
  db: Firestore,
  tenantId: string,
  lines: readonly PromotionCartLine[],
): Promise<EvaluatedCart> {
  const resolved: EvaluatedCart['lines'] = [];
  for (const line of lines) {
    const snap = await db
      .doc(`tenants/${tenantId}/publicMenuItems/${line.menuItemId}`)
      .get();
    const priceVnd = snap.get('priceVnd');
    if (!snap.exists || typeof priceVnd !== 'number' || priceVnd < 0) {
      throw new HttpsError(
        'failed-precondition',
        PROMOTION_MENU_ITEM_MISSING_MESSAGE,
      );
    }
    resolved.push({
      ...line,
      lineTotalVnd: priceVnd * line.quantity,
    });
  }
  return {
    subtotalVnd: resolved.reduce((sum, line) => sum + line.lineTotalVnd, 0),
    lines: resolved,
  };
}
