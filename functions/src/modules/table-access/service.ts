import { randomBytes } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import type { ZodType } from 'zod';
import {
  TABLE_AREA_CONTRACT_VERSION,
  TABLE_AREA_MAX_WAITERS,
  TABLE_CONTRACT_VERSION,
  tableAreaAssignInputSchema,
  tableArchiveInputSchema,
  tableConfigureInputSchema,
  tableCreateInputSchema,
  tableLinkContextSchema,
  tableRegenerateInputSchema,
  tableRenameInputSchema,
  tableResolveInputSchema,
  type TableArchiveInput,
  type TableAreaAssignInput,
  type TableConfigureInput,
  type TableCreateInput,
  type TableLinkContext,
  type TableRegenerateInput,
  type TableRenameInput,
  type TableResolveInput,
} from '../../../../shared/contracts/table.contract.js';
import { CONFIG_DEFAULTS } from '../../../../shared/config/defaults.js';
import {
  NFC_CONTRACT_VERSION,
  nfcProvisionInputSchema,
  nfcResolveInputSchema,
  nfcRevokeInputSchema,
  type NfcProvisionInput,
  type NfcResolveInput,
  type NfcRevokeInput,
  type NfcSession,
} from '../../../../shared/contracts/nfc.contract.js';

export const TABLE_OWNER_DENIED_MESSAGE =
  'Chỉ chủ cửa hàng quản lý được bàn.';
export const TABLE_MEMBER_DENIED_MESSAGE = 'Bạn không thuộc cửa hàng này.';
export const TABLE_INVALID_MESSAGE = 'Dữ liệu bàn không hợp lệ.';
export const TABLE_NOT_FOUND_MESSAGE = 'Không tìm thấy bàn.';
export const TABLE_TOKEN_INVALID_MESSAGE = 'Link bàn không còn khả dụng.';
export const TABLE_TOKEN_CROSS_TENANT_MESSAGE =
  'Link bàn không thuộc cửa hàng này.';
export const TABLE_AREA_WAITER_INVALID_MESSAGE =
  'Chỉ gán được nhân viên phục vụ đang hoạt động của cửa hàng.';

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

export function assertActiveMember(memberData: DocumentData | undefined): void {
  if (!memberData || memberData.isActive === false) {
    throw new HttpsError('permission-denied', TABLE_MEMBER_DENIED_MESSAGE);
  }
}

export function assertActiveOwnerMember(
  memberData: DocumentData | undefined,
): void {
  assertActiveMember(memberData);
  if (memberData?.membershipType !== 'owner') {
    throw new HttpsError('permission-denied', TABLE_OWNER_DENIED_MESSAGE);
  }
}

function parseInput<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', TABLE_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function parseTableCreateInput(data: unknown): TableCreateInput {
  return parseInput<TableCreateInput>(tableCreateInputSchema, data);
}

export function parseTableRenameInput(data: unknown): TableRenameInput {
  return parseInput<TableRenameInput>(tableRenameInputSchema, data);
}

export function parseTableArchiveInput(data: unknown): TableArchiveInput {
  return parseInput<TableArchiveInput>(tableArchiveInputSchema, data);
}

export function parseTableRegenerateInput(data: unknown): TableRegenerateInput {
  return parseInput<TableRegenerateInput>(tableRegenerateInputSchema, data);
}

export function parseTableConfigureInput(data: unknown): TableConfigureInput {
  return parseInput<TableConfigureInput>(tableConfigureInputSchema, data);
}

export function parseTableResolveInput(data: unknown): TableResolveInput {
  return parseInput<TableResolveInput>(tableResolveInputSchema, data);
}

export function parseTableAreaAssignInput(data: unknown): TableAreaAssignInput {
  return parseInput<TableAreaAssignInput>(tableAreaAssignInputSchema, data);
}

export function parseNfcProvisionInput(data: unknown): NfcProvisionInput {
  return parseInput<NfcProvisionInput>(nfcProvisionInputSchema, data);
}

export function parseNfcRevokeInput(data: unknown): NfcRevokeInput {
  return parseInput<NfcRevokeInput>(nfcRevokeInputSchema, data);
}

export function parseNfcResolveInput(data: unknown): NfcResolveInput {
  return parseInput<NfcResolveInput>(nfcResolveInputSchema, data);
}

/**
 * Build the public NFC link document. Only the opaque token path is public;
 * the document carries the minimal Tenant and table context (REQ-NFC-001).
 */
export function buildPublicNfcLinkDocument(input: {
  tenantId: string;
  tableId: string;
  tableName: string;
  tokenVersion: number;
  now: string;
}): Record<string, unknown> {
  return {
    schemaVersion: NFC_CONTRACT_VERSION,
    tenantId: input.tenantId,
    tableId: input.tableId,
    tableName: input.tableName,
    tokenVersion: input.tokenVersion,
    isActive: true,
    createdAt: input.now,
    revokedAt: null,
  };
}

/** Map a stored public NFC link to the frozen session contract. */
export function toNfcSession(
  nfcToken: string,
  data: DocumentData,
): NfcSession {
  return {
    schemaVersion: NFC_CONTRACT_VERSION,
    nfcToken,
    tenantId: String(data.tenantId ?? ''),
    tableId: String(data.tableId ?? ''),
    tableName: String(data.tableName ?? ''),
    tokenVersion:
      typeof data.tokenVersion === 'number' && data.tokenVersion >= 1
        ? data.tokenVersion
        : 1,
    isActive: data.isActive === true,
    createdAt: String(data.createdAt ?? ''),
    revokedAt: typeof data.revokedAt === 'string' ? data.revokedAt : null,
  };
}

/**
 * Create an opaque, URL-safe table token. The token is random and carries no
 * Tenant or table id (REQ-TBL-001, NFR-SEC-002).
 */
export function generateTableToken(): string {
  return randomBytes(32).toString('base64url');
}

export function computeNextTokenVersion(current: unknown): number {
  return typeof current === 'number' &&
    Number.isInteger(current) &&
    current >= 1
    ? current + 1
    : 1;
}

/** Map one stored public link document to the minimal public context. */
export function toTableLinkContext(
  token: string,
  data: DocumentData,
): TableLinkContext {
  const isActive = data.isActive === true;
  return tableLinkContextSchema.parse({
    // A stored link keeps the contract version it was written with, but the
    // projection always speaks the current one. Echoing the stored version
    // rejected every QR printed before a version bump (REQ-TBL-001).
    schemaVersion: TABLE_CONTRACT_VERSION,
    token,
    tenantId: data.tenantId,
    tableId: data.tableId,
    tableName: data.tableName,
    tokenVersion: data.tokenVersion,
    status: isActive ? 'active' : 'revoked',
    isActive,
    createdAt: data.createdAt,
    revokedAt: data.revokedAt ?? null,
  });
}

export function buildPublicTableLinkDocument(input: {
  tenantId: string;
  tableId: string;
  tableName: string;
  tokenVersion: number;
  now: string;
}): Record<string, unknown> {
  return {
    schemaVersion: TABLE_CONTRACT_VERSION,
    tenantId: input.tenantId,
    tableId: input.tableId,
    tableName: input.tableName,
    tokenVersion: input.tokenVersion,
    isActive: true,
    createdAt: input.now,
    revokedAt: null,
  };
}

export function buildTableDocument(input: {
  name: string;
  token: string;
  now: string;
  area?: string | null;
  seats?: number | null;
  position?: TableConfigureInput['position'];
  /** Projection of the area's assignment, copied so Rules can scope a read. */
  areaWaiterUids?: string[];
}): Record<string, unknown> {
  return {
    name: input.name,
    isActive: true,
    tokenVersion: 1,
    activeToken: input.token,
    qrPayload: `/menu/${input.token}`,
    nfcWritten: false,
    archivedAt: null,
    // A new table starts where the Owner dropped it, or with an empty layout
    // that `configure` fills later (REQ-TBL-002).
    area: input.area ?? null,
    seats: input.seats ?? null,
    position: input.position ?? null,
    areaWaiterUids: input.areaWaiterUids ?? [],
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/**
 * The stored layout patch for one `configure` command (REQ-TBL-002). Written as
 * a full replace so clearing a value is a deliberate `null`, never a leftover.
 */
export function buildTableLayoutPatch(
  input: TableConfigureInput,
  now: string,
  areaWaiterUids: string[] = [],
): Record<string, unknown> {
  return {
    area: input.area,
    seats: input.seats,
    position: input.position,
    areaWaiterUids,
    updatedAt: now,
  };
}

/** The stored document for one area's Waiter coverage (REQ-TBL-004). */
export function buildTableAreaDocument(input: {
  tenantId: string;
  label: string;
  waiterUids: string[];
  updatedBy: string;
  now: string;
}): Record<string, unknown> {
  return {
    schemaVersion: TABLE_AREA_CONTRACT_VERSION,
    tenantId: input.tenantId,
    label: input.label,
    waiterUids: input.waiterUids,
    updatedAt: input.now,
    updatedBy: input.updatedBy,
  };
}

/**
 * Every assigned uid must be an active member holding the Waiter role
 * (REQ-TBL-004). The assignment never grants a role, so anything else is a
 * rejected command rather than a silent repair.
 */
export function assertAreaWaiterUids(
  members: readonly { uid: string; data: DocumentData | undefined }[],
): void {
  if (members.length > TABLE_AREA_MAX_WAITERS) {
    throw new HttpsError('invalid-argument', TABLE_AREA_WAITER_INVALID_MESSAGE);
  }
  for (const member of members) {
    const roles = member.data?.roles;
    const isWaiter =
      Array.isArray(roles) && roles.some((role) => role === 'waiter');
    if (!member.data || member.data.isActive === false || !isWaiter) {
      throw new HttpsError(
        'invalid-argument',
        TABLE_AREA_WAITER_INVALID_MESSAGE,
      );
    }
  }
}

/** Recompute one member's `assignedAreas` projection from the area documents. */
export function projectAssignedAreas(
  areas: readonly { label: string; waiterUids: string[] }[],
  uid: string,
): string[] {
  return areas
    .filter((area) => area.waiterUids.includes(uid))
    .map((area) => area.label)
    .sort((left, right) => left.localeCompare(right, 'vi'));
}

export interface StoredAreaAssignment {
  id: string;
  label: string;
  waiterUids: string[];
}

/**
 * Read one stored area document tolerantly: a row written by an older build (or
 * half-written) contributes what it has instead of failing the whole command.
 */
export function readStoredAreaAssignment(
  id: string,
  data: DocumentData | undefined,
): StoredAreaAssignment | null {
  const label = typeof data?.label === 'string' ? data.label.trim() : '';
  if (label.length === 0) {
    return null;
  }
  const waiterUids = Array.isArray(data?.waiterUids)
    ? data.waiterUids.filter(
        (uid): uid is string => typeof uid === 'string' && uid.length > 0,
      )
    : [];
  return { id, label, waiterUids };
}

/**
 * The Waiter uids currently assigned to one area, to project them onto a table
 * that is created or moved into it. Read outside the write transaction: the
 * assign command re-projects the whole area afterwards, so a table created
 * while an assignment is in flight is corrected by that command.
 */
export async function readAreaWaiterUids(
  db: Firestore,
  tenantId: string,
  area: string | null,
): Promise<string[]> {
  const label = (area ?? '').trim();
  if (label.length === 0) {
    return [];
  }
  const snap = await db
    .collection(`tenants/${tenantId}/tableAreas`)
    .where('label', '==', label)
    .limit(1)
    .get();
  return readStoredAreaAssignment(snap.docs[0]?.id ?? '', snap.docs[0]?.data())
    ?.waiterUids ?? [];
}

/**
 * Resolve the configurable public rate limit. `publicOrderPerMinute` is a
 * platform default; an invalid stored value falls back to the approved default.
 */
export async function resolvePublicOrderRateLimit(
  db: Firestore,
): Promise<number> {
  const snap = await db.doc('platform/config').get();
  const values = snap.exists ? snap.data()?.values : undefined;
  const limit = (values as { rateLimit?: { publicOrderPerMinute?: unknown } } | undefined)
    ?.rateLimit?.publicOrderPerMinute;
  return typeof limit === 'number' && Number.isInteger(limit) && limit > 0
    ? limit
    : CONFIG_DEFAULTS.rateLimit.publicOrderPerMinute;
}
