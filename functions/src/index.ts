import { initFunctionsMonitoring } from './shared/monitoring.js';

// Server error monitoring stays disabled without SENTRY_DSN (NFR-OBS-001).
initFunctionsMonitoring();

export {
  callableAuthAuthorizeStaff,
  callableAuthRegisterOwner,
  callableAuthRevokeStaffSessions,
  callableAuthStaffPinVerify,
} from './modules/auth/index.js';

export {
  callableAdminChangeTenant,
  callableAdminListAudit,
  callableAdminListCustomerPhones,
  callableAdminListTenants,
  callableAdminOpenTenant,
} from './modules/admin/index.js';

export {
  callableAiAsk,
  callableAiGroupFeedback,
  callableAiRunWeeklyAnalysis,
  scheduledAiWeeklyAnalysis,
} from './modules/ai/index.js';

export {
  callableCatalogApplyTemplate,
  callableCatalogArchive,
  callableCatalogCreate,
  callableCatalogListAvailability,
  callableCatalogSearch,
  callableCatalogSetAvailability,
  callableCatalogSetCategoryAvailability,
  callableCatalogUpdate,
} from './modules/catalog/index.js';

export {
  callableConfigGetResolved,
  callableConfigUpdatePlatform,
  callableConfigUpdateTenant,
  scheduledFirestoreBackup,
  scheduledRetentionArchive,
} from './modules/config/index.js';

export {
  callableFeedbackCreateTicket,
  callableFeedbackSubmit,
  callableFeedbackUpdateTicket,
  callableProductFeedbackList,
  callableProductFeedbackSetStatus,
  callableProductFeedbackSubmit,
} from './modules/feedback/index.js';

export {
  callableWorkforceApproveCorrection,
  callableWorkforceClockIn,
  callableWorkforceClockOut,
  callableWorkforceGetAttendanceSummary,
  callableWorkforceRequestCorrection,
  callableWorkforceScheduleShift,
} from './modules/workforce/index.js';

export {
  callableI18nGetLocale,
  callableI18nSetLocale,
} from './modules/i18n/index.js';

export {
  callableOrderCancelUnpaid,
  callableOrderGetTracking,
  callableOrderListKitchen,
  callableOrderListUnpaid,
  callableOrderStaffCreate,
  callableOrderSubmit,
} from './modules/ordering/index.js';

export {
  callablePaymentAutoConfirm,
  callablePaymentConfirm,
  callablePaymentCorrect,
  callablePaymentGetVietQrInstruction,
  callablePaymentProviderSettle,
  paymentWebhookV1,
} from './modules/payment/index.js';

export {
  callablePromotionApproveCampaign,
  callablePromotionEvaluate,
  callablePromotionList,
  callablePromotionMeasureCampaign,
  callablePromotionSetStatus,
  callablePromotionSuggestCampaign,
  callablePromotionUpsert,
} from './modules/promotion/index.js';

export {
  callableLoyaltyEarnPoints,
  callableLoyaltyGetConfig,
  callableLoyaltyListMembers,
  callableLoyaltyRedeemPoints,
  callableLoyaltyRegisterMember,
  callableLoyaltyReversePoints,
  callableLoyaltyUpdateConfig,
  callableLoyaltyVerifyMember,
} from './modules/loyalty/index.js';

export {
  callableSubscriptionChangePlan,
  callableSubscriptionGet,
} from './modules/subscription/index.js';

export {
  callableReportingGetSummary,
  callableReportingRebuildDailyStats,
  scheduledReportingRebuildDailyStats,
} from './modules/reporting/index.js';

export {
  callableInventoryAdjustStock,
  callableInventoryArchiveIngredient,
  callableInventoryArchiveRecipe,
  callableInventoryChangeReport,
  callableInventoryCreateIngredient,
  callableInventoryCreateRecipe,
  callableInventoryRecordStockCount,
  callableInventoryReviewLoss,
  callableInventoryUpdateIngredient,
  callableInventoryUpdateRecipe,
} from './modules/inventory/index.js';

export {
  callableFulfilmentListReady,
  callableFulfilmentMarkReady,
  callableFulfilmentMarkServed,
  callableFulfilmentStartCooking,
} from './modules/fulfilment/index.js';

export {
  callableTableArchive,
  callableTableCreate,
  callableTableNfcResolve,
  callableTableProvisionNfc,
  callableTableRegenerate,
  callableTableRename,
  callableTableResolvePublic,
  callableTableRevokeNfc,
} from './modules/table-access/index.js';

export {
  callableTenantBootstrap,
  callableTenantCreate,
  callableTenantListCustomerPhones,
  callableTenantListMemberships,
  callableTenantOnboardingGet,
  callableTenantOnboardingUpdate,
  callableTenantSelectActive,
} from './modules/tenant/index.js';

export {
  callableStaffCreate,
  callableStaffList,
  callableStaffResetPin,
  callableStaffSetActive,
  callableStaffUpdate,
} from './modules/staff/index.js';
