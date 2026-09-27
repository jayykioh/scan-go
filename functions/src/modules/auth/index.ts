import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { ownerRegistrationInputSchema } from '../../../../shared/contracts/identity.contract.js';
import { getDb } from '../../shared/firestore.js';
import { writeAuditEvent } from '../../shared/audit.js';
import {
  mapIdentity,
  mapMembership,
  provisionOwnerTenant,
  readEmail,
  readPhoneNumber,
  requireUid,
} from '../tenant/service.js';

const CALL_OPTIONS = { region: 'us-central1', cors: true } as const;

export const callableAuthRegisterOwner = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    const token = request.auth?.token as Record<string, unknown> | undefined;
    const isAdmin = token?.admin === true;

    const email = readEmail(token);
    if (!email) {
      throw new HttpsError(
        'failed-precondition',
        'Tài khoản Owner phải dùng email và mật khẩu.',
      );
    }

    const parsed = ownerRegistrationInputSchema.safeParse(request.data ?? {});
    if (!parsed.success) {
      throw new HttpsError(
        'invalid-argument',
        'Thông tin đăng ký không hợp lệ.',
      );
    }
    const { shopName } = parsed.data;
    const displayName = parsed.data.displayName ?? null;

    const db = getDb();
    const existing = await db
      .collectionGroup('members')
      .where('uid', '==', uid)
      .limit(1)
      .get();

    let tenantId: string;
    if (!existing.empty) {
      const parent = existing.docs[0].ref.parent.parent;
      if (!parent) {
        throw new HttpsError('internal', 'Không tìm thấy cửa hàng.');
      }
      tenantId = parent.id;
    } else {
      tenantId = await provisionOwnerTenant(db, {
        uid,
        email,
        phoneNumber: readPhoneNumber(token),
        displayName,
        shopName,
        isNewUser: true,
      });
      await writeAuditEvent({
        tenantId,
        actorUid: uid,
        action: 'OwnerRegistered',
        targetType: 'tenant',
        targetId: tenantId,
        detail: { email },
      }).catch(() => undefined);
    }

    const [userSnap, memberSnap] = await Promise.all([
      db.doc(`users/${uid}`).get(),
      db.doc(`tenants/${tenantId}/members/${uid}`).get(),
    ]);

    return {
      identity: mapIdentity(uid, userSnap.data() ?? {}, isAdmin),
      membership: mapMembership(tenantId, uid, memberSnap.data() ?? {}),
    };
  },
);
