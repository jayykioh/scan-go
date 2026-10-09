import { HttpsError } from 'firebase-functions/v2/https';
import {
  promotionAiAnswersSchema,
  promotionAiDraftSchema,
  type PromotionAiAnswers,
  type PromotionAiDraft,
  type PromotionAiStep,
} from '../../../../shared/contracts/promotionAi.contract.js';
import {
  EMPTY_PROMOTION_ELIGIBILITY,
  type PromotionBenefit,
} from '../../../../shared/contracts/promotion.contract.js';

export const PROMOTION_AI_NOT_READY = 'Cần trả lời đủ câu hỏi trước khi tạo khuyến mãi.';
export const PROMOTION_AI_SESSION_NOT_FOUND = 'Không tìm thấy phiên tạo khuyến mãi.';

export function emptyPromotionAiAnswers(): PromotionAiAnswers {
  return promotionAiAnswersSchema.parse({
    goal: null, benefitType: null, percent: null, maxDiscountVnd: null,
    amountVnd: null, buyQuantity: null, getQuantity: null, buyMenuItemIds: [],
    getMenuItemIds: [], rewardFree: null, rewardPercent: null, giftMenuItemIds: [],
    giftQuantity: null, bundleMenuItemIds: [], bundleQuantity: null, bundlePriceVnd: null,
    pointsCost: null, pointsRewardType: null, pointsRewardPercent: null,
    pointsRewardAmountVnd: null, pointsRewardMenuItemIds: [], targetSegment: null,
    targetVisitCount: null, targetMinPoints: null, minSubtotalVnd: null, minQuantity: null,
    eligibilityMenuItemIds: [], daysOfWeek: null, timeFromMinuteOfDay: null,
    timeToMinuteOfDay: null, code: null, name: null, priority: null, startsAt: null, endsAt: null,
  });
}

export function nextPromotionAiStep(answers: PromotionAiAnswers): PromotionAiStep {
  if (answers.goal === null) return 'goal';
  if (answers.benefitType === null) return 'benefitType';
  if (answers.benefitType === 'percentOff' && answers.percent === null) return 'benefitDetails';
  if (answers.benefitType === 'percentOff' && answers.maxDiscountVnd === null) return 'benefitDetails';
  if (answers.benefitType === 'fixedAmount' && answers.amountVnd === null) return 'benefitDetails';
  if (answers.targetSegment === null) return 'target';
  if (answers.minSubtotalVnd === null && answers.minQuantity === null) return 'conditions';
  if (answers.name === null) return 'identity';
  return 'review';
}

export function questionForStep(step: PromotionAiStep): string {
  const questions: Record<PromotionAiStep, string> = {
    goal: 'Mục tiêu chính của khuyến mãi là gì?',
    benefitType: 'Bạn muốn ưu đãi theo cách nào: giảm phần trăm hay giảm tiền cố định?',
    benefitDetails: 'Mức ưu đãi và giới hạn giảm tối đa bạn mong muốn là bao nhiêu?',
    target: 'Khuyến mãi dành cho tất cả khách hay một nhóm khách cụ thể?',
    conditions: 'Có điều kiện hóa đơn tối thiểu hoặc số món tối thiểu không?',
    schedule: 'Khuyến mãi chạy trong khoảng thời gian nào?',
    identity: 'Tên hiển thị của khuyến mãi là gì?',
    review: 'Hãy kiểm tra lại bản nháp trước khi xác nhận tạo.',
  };
  return questions[step];
}

function buildBenefit(answers: PromotionAiAnswers): PromotionBenefit {
  if (answers.benefitType === 'fixedAmount' && answers.amountVnd !== null) {
    return { type: 'fixedAmount', amountVnd: answers.amountVnd };
  }
  if (answers.benefitType === 'percentOff' && answers.percent !== null) {
    return { type: 'percentOff', percent: answers.percent, maxDiscountVnd: answers.maxDiscountVnd };
  }
  throw new HttpsError('failed-precondition', PROMOTION_AI_NOT_READY);
}

export function buildPromotionAiDraft(answers: PromotionAiAnswers): PromotionAiDraft {
  const benefit = buildBenefit(answers);
  if (answers.name === null || answers.targetSegment === null) {
    throw new HttpsError('failed-precondition', PROMOTION_AI_NOT_READY);
  }
  const customerSegment = answers.targetSegment === 'all'
    ? { type: 'all' as const }
    : answers.targetSegment === 'newCustomer'
      ? { type: 'newCustomer' as const }
      : answers.targetSegment === 'visitCountAtLeast' && answers.targetVisitCount !== null
        ? { type: 'visitCountAtLeast' as const, visitCount: answers.targetVisitCount }
        : answers.targetMinPoints !== null
          ? { type: 'loyaltyTierAtLeast' as const, minPoints: answers.targetMinPoints }
          : null;
  if (customerSegment === null) throw new HttpsError('failed-precondition', PROMOTION_AI_NOT_READY);
  return promotionAiDraftSchema.parse({
    name: answers.name,
    priority: answers.priority ?? 0,
    startsAt: answers.startsAt,
    endsAt: answers.endsAt,
    eligibility: {
      ...EMPTY_PROMOTION_ELIGIBILITY,
      minSubtotalVnd: answers.minSubtotalVnd,
      minQuantity: answers.minQuantity,
      menuItemIds: answers.eligibilityMenuItemIds.length ? answers.eligibilityMenuItemIds : null,
      timeWindow: answers.timeFromMinuteOfDay !== null && answers.timeToMinuteOfDay !== null
        ? { fromMinuteOfDay: answers.timeFromMinuteOfDay, toMinuteOfDay: answers.timeToMinuteOfDay }
        : null,
      daysOfWeek: answers.daysOfWeek,
      code: answers.code,
      customerSegment,
    },
    benefit,
  });
}

export function mergePromotionAiAnswer(
  current: PromotionAiAnswers,
  step: PromotionAiStep,
  answer: unknown,
): PromotionAiAnswers {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    throw new HttpsError('invalid-argument', 'Câu trả lời phải là dữ liệu có cấu trúc.');
  }
  const parsed = promotionAiAnswersSchema.partial().strict().safeParse(answer);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Câu trả lời chứa trường không được phép.');
  }
  const allowedByStep: Record<PromotionAiStep, readonly string[]> = {
    goal: ['goal'],
    benefitType: ['benefitType'],
    benefitDetails: ['percent', 'maxDiscountVnd', 'amountVnd', 'buyQuantity', 'getQuantity', 'buyMenuItemIds', 'getMenuItemIds', 'rewardFree', 'rewardPercent', 'giftMenuItemIds', 'giftQuantity', 'bundleMenuItemIds', 'bundleQuantity', 'bundlePriceVnd', 'pointsCost', 'pointsRewardType', 'pointsRewardPercent', 'pointsRewardAmountVnd', 'pointsRewardMenuItemIds'],
    target: ['targetSegment', 'targetVisitCount', 'targetMinPoints'],
    conditions: ['minSubtotalVnd', 'minQuantity', 'eligibilityMenuItemIds', 'code'],
    schedule: ['daysOfWeek', 'timeFromMinuteOfDay', 'timeToMinuteOfDay', 'startsAt', 'endsAt'],
    identity: ['name', 'priority'],
    review: [],
  };
  const keys = Object.keys(parsed.data);
  if (keys.some((key) => !allowedByStep[step].includes(key))) {
    throw new HttpsError('invalid-argument', 'Câu trả lời không phù hợp với câu hỏi hiện tại.');
  }
  return promotionAiAnswersSchema.parse({ ...current, ...parsed.data });
}
