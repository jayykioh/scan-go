import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp } from 'firebase-admin/app'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { cancelUnpaidOrderTransaction, CancellationRequest } from './integrations/cancellation.js'
import { startCookingTransaction, StartCookingRequest } from './integrations/cooking.js'
import { createOrderCallable } from './modules/ordering/index.js'

initializeApp()
const db = getFirestore()

export const createOrder = createOrderCallable(db)

export const fulfilmentStartCooking = onCall<StartCookingRequest>({ enforceAppCheck: true }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Kitchen authentication is required')
  try {
    return await startCookingTransaction(db, { ...request.data, actorUid: request.auth.uid })
  } catch (error) {
    throw new HttpsError('failed-precondition', error instanceof Error ? error.message : 'Unable to start cooking')
  }
})

export const orderingCancel = onCall<CancellationRequest>({ enforceAppCheck: true }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Cashier or Owner authentication is required')
  try {
    return await cancelUnpaidOrderTransaction(db, { ...request.data, actorUid: request.auth.uid })
  } catch (error) {
    throw new HttpsError('failed-precondition', error instanceof Error ? error.message : 'Unable to cancel order')
  }
})
