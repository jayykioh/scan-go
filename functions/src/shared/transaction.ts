import { createHash } from 'node:crypto'
import { FieldValue, Firestore, Transaction } from 'firebase-admin/firestore'

export type JsonRecord = Record<string, unknown>

export const requireSafeId = (value: string, field: string): string => {
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(value)) throw new Error(`${field} must be an opaque safe identifier`)
  return value
}

export const requireInteger = (value: unknown, field: string, minimum = 0): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${field} must be an integer greater than or equal to ${minimum}`)
  }
  return value
}

export const requestHash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export const hasRole = (member: JsonRecord, role: string): boolean => {
  const roles = member.roles
  return member.isActive === true && (
    (role === 'owner' && member.membershipType === 'owner')
    || (Array.isArray(roles) && roles.some(item => String(item).toLowerCase() === role))
  )
}

export const idempotencyRef = (db: Firestore, tenantId: string, key: string) =>
  db.doc(`tenants/${tenantId}/idempotency/${requireSafeId(key, 'idempotencyKey')}`)

export const serverTimestamps = (): JsonRecord => ({
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
})

export type FirestoreTransaction = Transaction
