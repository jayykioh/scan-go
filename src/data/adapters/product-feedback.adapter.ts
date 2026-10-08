import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  PRODUCT_FEEDBACK_ATTACHMENT_CONTENT_TYPES,
  PRODUCT_FEEDBACK_ATTACHMENT_MAX_BYTES,
  PRODUCT_FEEDBACK_MAX_ATTACHMENTS,
  productFeedbackAttachmentPrefix,
  productFeedbackListResultSchema,
  productFeedbackSetStatusResultSchema,
  productFeedbackSubmitResultSchema,
  type ProductFeedbackAttachment,
  type ProductFeedbackListInput,
  type ProductFeedbackListResult,
  type ProductFeedbackSetStatusInput,
  type ProductFeedbackSetStatusResult,
  type ProductFeedbackSubmitInput,
  type ProductFeedbackSubmitResult,
} from '@contracts/product-feedback.contract';
import {
  getFirebaseAuth,
  getFirebaseFunctions,
  getFirebaseStorage,
} from '../../services/firebase/client';

/** Stable published callable names (docs/RULES_FIREBASE.md §2). */
export const PRODUCT_FEEDBACK_SUBMIT_CALLABLE = 'callableProductFeedbackSubmit';
export const PRODUCT_FEEDBACK_LIST_CALLABLE = 'callableProductFeedbackList';
export const PRODUCT_FEEDBACK_SET_STATUS_CALLABLE =
  'callableProductFeedbackSetStatus';

export const PRODUCT_FEEDBACK_IMAGE_TYPE_ERROR =
  'Chỉ nhận ảnh PNG, JPEG, WEBP hoặc GIF.';
export const PRODUCT_FEEDBACK_IMAGE_SIZE_ERROR = 'Ảnh tối đa 5 MB.';
export const PRODUCT_FEEDBACK_IMAGE_COUNT_ERROR =
  `Tối đa ${PRODUCT_FEEDBACK_MAX_ATTACHMENTS} ảnh mỗi phản hồi.`;

export function parseProductFeedbackSubmitResult(
  data: unknown,
): ProductFeedbackSubmitResult {
  return productFeedbackSubmitResultSchema.parse(data);
}

export function parseProductFeedbackListResult(
  data: unknown,
): ProductFeedbackListResult {
  return productFeedbackListResultSchema.parse(data);
}

export function parseProductFeedbackSetStatusResult(
  data: unknown,
): ProductFeedbackSetStatusResult {
  return productFeedbackSetStatusResultSchema.parse(data);
}

function currentUid(): string {
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!uid) {
    throw new Error('Bạn cần đăng nhập để gửi phản hồi.');
  }
  return uid;
}

/** Reject a file before it is uploaded, so the Storage Rules never have to. */
export function assertFeedbackImage(file: {
  type: string;
  size: number;
}): void {
  if (
    !(PRODUCT_FEEDBACK_ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(
      file.type,
    )
  ) {
    throw new Error(PRODUCT_FEEDBACK_IMAGE_TYPE_ERROR);
  }
  if (file.size <= 0 || file.size > PRODUCT_FEEDBACK_ATTACHMENT_MAX_BYTES) {
    throw new Error(PRODUCT_FEEDBACK_IMAGE_SIZE_ERROR);
  }
}

function extensionFor(contentType: string): string {
  switch (contentType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'jpg';
  }
}

/** Random, collision-resistant file name. It never carries a user string. */
function randomFileName(contentType: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${random}.${extensionFor(contentType)}`;
}

/**
 * Upload one screenshot to the reporter's own Storage prefix and return the
 * descriptor the server records (REQ-FDB-004, REQ-FDB-005).
 *
 * The object path is derived from the signed-in uid, never from a caller
 * argument, so a client cannot address another Tenant's prefix.
 */
export async function uploadFeedbackImage(
  tenantId: string,
  file: File,
): Promise<ProductFeedbackAttachment> {
  const storage = getFirebaseStorage();
  if (!storage) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  assertFeedbackImage(file);

  const uid = currentUid();
  const storagePath = `${productFeedbackAttachmentPrefix(
    tenantId,
    uid,
  )}/${randomFileName(file.type)}`;

  await uploadBytes(ref(storage, storagePath), file, {
    contentType: file.type,
  });

  return {
    storagePath,
    contentType: file.type as ProductFeedbackAttachment['contentType'],
    sizeBytes: file.size,
  };
}

export async function submitProductFeedback(
  input: ProductFeedbackSubmitInput,
): Promise<ProductFeedbackSubmitResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<ProductFeedbackSubmitInput, unknown>(
    functions,
    PRODUCT_FEEDBACK_SUBMIT_CALLABLE,
  );
  const result = await callable(input);
  return parseProductFeedbackSubmitResult(result.data);
}

export async function listProductFeedback(
  input: ProductFeedbackListInput,
): Promise<ProductFeedbackListResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<ProductFeedbackListInput, unknown>(
    functions,
    PRODUCT_FEEDBACK_LIST_CALLABLE,
  );
  const result = await callable(input);
  return parseProductFeedbackListResult(result.data);
}

export async function setProductFeedbackStatus(
  input: ProductFeedbackSetStatusInput,
): Promise<ProductFeedbackSetStatusResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<ProductFeedbackSetStatusInput, unknown>(
    functions,
    PRODUCT_FEEDBACK_SET_STATUS_CALLABLE,
  );
  const result = await callable(input);
  return parseProductFeedbackSetStatusResult(result.data);
}

/** Resolve a stored Storage path to a displayable URL on demand. */
export async function resolveFeedbackImageUrl(
  storagePath: string,
): Promise<string | null> {
  const storage = getFirebaseStorage();
  if (!storage) {
    return null;
  }
  try {
    return await getDownloadURL(ref(storage, storagePath));
  } catch {
    // A missing object must not break the inbox.
    return null;
  }
}
