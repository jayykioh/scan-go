import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  tableCommandResultSchema,
  tableLinkContextSchema,
  type TableArchiveInput,
  type TableCommandResult,
  type TableCreateInput,
  type TableLinkContext,
  type TableRegenerateInput,
  type TableRenameInput,
  type TableResolveInput,
} from '@contracts/table.contract';
import {
  nfcProvisionResultSchema,
  nfcResolveResultSchema,
  nfcRevokeResultSchema,
  type NfcProvisionInput,
  type NfcProvisionResult,
  type NfcResolveInput,
  type NfcResolveResult,
  type NfcRevokeInput,
  type NfcRevokeResult,
} from '@contracts/nfc.contract';
import {
  getFirebaseAuth,
  getFirebaseFirestore,
  getFirebaseFunctions,
} from '../../services/firebase/client';

export const TENANT_TABLE_LISTENER_LIMIT = 100;

export interface TenantTable {
  tableId: string;
  name: string;
  isActive: boolean;
  tokenVersion: number;
  activeToken: string | null;
  qrPayload: string | null;
  nfcWritten: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function mapStoredTable(
  tableId: string,
  data: DocumentData,
): TenantTable {
  return {
    tableId,
    name: String(data.name ?? ''),
    isActive: data.isActive !== false && !data.archivedAt,
    tokenVersion:
      typeof data.tokenVersion === 'number' ? data.tokenVersion : 1,
    activeToken: typeof data.activeToken === 'string' ? data.activeToken : null,
    qrPayload: typeof data.qrPayload === 'string' ? data.qrPayload : null,
    nfcWritten: data.nfcWritten === true,
    archivedAt: typeof data.archivedAt === 'string' ? data.archivedAt : null,
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

/** QR and NFC share one opaque link; the token is the only path segment. */
export function buildQrPayload(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/menu/${token}`;
}

async function requireFunctions() {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  return functions;
}

export async function createTenantTable(
  tenantId: string,
  name: string,
): Promise<TableCommandResult> {
  const functions = await requireFunctions();
  const callable = httpsCallable<TableCreateInput, TableCommandResult>(
    functions,
    'callableTableCreate',
  );
  const result = await callable({ tenantId, name });
  return tableCommandResultSchema.parse(result.data);
}

export async function renameTenantTable(
  tenantId: string,
  tableId: string,
  name: string,
): Promise<TableCommandResult> {
  const functions = await requireFunctions();
  const callable = httpsCallable<TableRenameInput, TableCommandResult>(
    functions,
    'callableTableRename',
  );
  const result = await callable({ tenantId, tableId, name });
  return tableCommandResultSchema.parse(result.data);
}

export async function archiveTenantTable(
  tenantId: string,
  tableId: string,
  reason: string | null = null,
): Promise<TableCommandResult> {
  const functions = await requireFunctions();
  const callable = httpsCallable<TableArchiveInput, TableCommandResult>(
    functions,
    'callableTableArchive',
  );
  const result = await callable({ tenantId, tableId, reason });
  return tableCommandResultSchema.parse(result.data);
}

export async function regenerateTableToken(
  tenantId: string,
  tableId: string,
): Promise<TableCommandResult> {
  const functions = await requireFunctions();
  const callable = httpsCallable<TableRegenerateInput, TableCommandResult>(
    functions,
    'callableTableRegenerate',
  );
  const result = await callable({ tenantId, tableId });
  return tableCommandResultSchema.parse(result.data);
}

/** Public resolver: no sign-in is required, but App Check and limits apply. */
export async function resolvePublicTable(
  token: string,
  tenantId: string | null = null,
): Promise<TableLinkContext> {
  const functions = await requireFunctions();
  const callable = httpsCallable<TableResolveInput, TableLinkContext>(
    functions,
    'callableTableResolvePublic',
  );
  const result = await callable({ token, tenantId });
  return tableLinkContextSchema.parse(result.data);
}

/** Bounded tenant-table listener; archived tables stay out of the list. */
export function subscribeTenantTables(
  onChange: (tables: TenantTable[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!db || !uid) {
    onChange([]);
    return () => undefined;
  }

  let unsubscribe: Unsubscribe | null = null;
  let cancelled = false;

  void (async () => {
    const userSnap = await getDoc(doc(db, 'users', uid));
    const activeTenantId = userSnap.get('activeTenantId');
    const tenantId =
      typeof activeTenantId === 'string' ? activeTenantId : null;
    if (cancelled || !tenantId) {
      return;
    }
    const tablesQuery = query(
      collection(db, 'tenants', tenantId, 'tables'),
      where('archivedAt', '==', null),
      orderBy('name'),
      limit(TENANT_TABLE_LISTENER_LIMIT),
    );
    unsubscribe = onSnapshot(
      tablesQuery,
      (snap) => {
        onChange(
          snap.docs.map((docSnap) =>
            mapStoredTable(docSnap.id, docSnap.data()),
          ),
        );
      },
      (error) => onError?.(error),
    );
  })();

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

/**
 * Owner command: provision an opaque NFC session for one table. The server
 * enforces the `nfc` plan entitlement and returns the token the device step
 * must write to the tag (REQ-NFC-001, REQ-SUB-001).
 */
export async function provisionTableNfc(
  tenantId: string,
  tableId: string,
): Promise<NfcProvisionResult> {
  const functions = await requireFunctions();
  const callable = httpsCallable<NfcProvisionInput, unknown>(
    functions,
    'callableTableProvisionNfc',
  );
  const result = nfcProvisionResultSchema.parse(
    (await callable({ tenantId, tableId })).data,
  );
  return result;
}

export async function revokeTableNfc(
  tenantId: string,
  tableId: string,
): Promise<NfcRevokeResult> {
  const functions = await requireFunctions();
  const callable = httpsCallable<NfcRevokeInput, unknown>(
    functions,
    'callableTableRevokeNfc',
  );
  const result = nfcRevokeResultSchema.parse(
    (await callable({ tenantId, tableId })).data,
  );
  return result;
}

/** Device verification: resolve a tapped NFC token to table context. */
export async function resolveNfcSession(
  token: string,
): Promise<NfcResolveResult> {
  const functions = await requireFunctions();
  const callable = httpsCallable<NfcResolveInput, unknown>(
    functions,
    'callableTableNfcResolve',
  );
  const result = nfcResolveResultSchema.parse((await callable({ token })).data);
  return result;
}
