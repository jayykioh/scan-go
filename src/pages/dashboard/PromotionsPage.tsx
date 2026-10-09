import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  BadgePercent,
  Check,
  Clock,
  Gift,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Ticket,
  Trash2,
  X,
} from 'lucide-react';
import type {
  Promotion,
  PromotionBenefit,
  PromotionBenefitType,
  PromotionCustomerSegment,
  PromotionEligibility,
  PromotionStatus,
} from '@contracts/promotion.contract';
import {
  EMPTY_PROMOTION_ELIGIBILITY,
  QUICK_DISCOUNT_PROMOTION_ID,
  isBasicPromotion,
} from '@contracts/promotion.contract';
import type {
  CampaignGoal,
  CampaignSuggestion,
} from '@contracts/campaign.contract';
import { resolvePlanEntitlements } from '@contracts/subscription.contract';
import type { SubscriptionPlan } from '@contracts/subscription.contract';
import { useToast } from '../../contexts/ToastContext';
import { useActiveTenantId } from '../../hooks/useActiveTenantId';
import {
  approveCampaign,
  changePromotionStatus,
  measureCampaign,
  suggestCampaign,
  upsertPromotion,
} from '../../data/adapters/promotion.adapter';
import { getSubscription } from '../../data/adapters/subscription.adapter';
import {
  refreshSlice,
  useStoreSlice,
} from '../../data/tenantStore';

/** The six benefit kinds the page offers, with their Vietnamese labels. */
const BENEFIT_OPTIONS: Array<{
  type: PromotionBenefitType;
  label: string;
  hint: string;
  advanced: boolean;
}> = [
  {
    type: 'percentOff',
    label: 'Giảm %',
    hint: 'Giảm theo phần trăm hoá đơn, có thể đặt mức giảm tối đa.',
    advanced: false,
  },
  {
    type: 'fixedAmount',
    label: 'Giảm tiền',
    hint: 'Giảm một số tiền cố định.',
    advanced: false,
  },
  {
    type: 'buyXGetY',
    label: 'Mua X tặng Y',
    hint: 'Mua đủ số món thì tặng thêm, ví dụ mua 1 tặng 1.',
    advanced: true,
  },
  {
    type: 'freeItem',
    label: 'Tặng món',
    hint: 'Đạt điều kiện thì tặng một món, tính 0đ trên hoá đơn.',
    advanced: true,
  },
  {
    type: 'bundlePrice',
    label: 'Combo giá cố định',
    hint: 'Chọn đủ số món trong nhóm với một giá trọn gói.',
    advanced: true,
  },
  {
    type: 'pointsRedemption',
    label: 'Đổi điểm',
    hint: 'Khách dùng điểm hội viên để lấy ưu đãi.',
    advanced: true,
  },
];

const STATUS_LABELS: Record<PromotionStatus, string> = {
  active: 'Đang chạy',
  inactive: 'Tạm dừng',
  archived: 'Đã lưu trữ',
};

const GOAL_LABELS: Record<CampaignGoal, string> = {
  increaseReturnRate: 'Khách quay lại nhiều hơn',
  increaseOrderValue: 'Tăng giá trị mỗi đơn',
  increaseGrossProfit: 'Tăng lợi nhuận gộp',
};

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function money(value: number): string {
  return `${Math.round(value).toLocaleString('vi-VN')}đ`;
}

function minuteToLabel(minute: number): string {
  const hour = Math.floor(minute / 60);
  const rest = minute % 60;
  return `${String(hour).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function labelToMinute(label: string): number {
  const [hour, minute] = label.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return 0;
  }
  return Math.min(Math.max(hour * 60 + minute, 0), 1439);
}

/** One human sentence that says exactly what the promotion will do. */
function describePromotion(promotion: Promotion): string {
  const parts: string[] = [];
  const eligibility = promotion.eligibility;
  if (eligibility.minSubtotalVnd !== null) {
    parts.push(`hoá đơn từ ${money(eligibility.minSubtotalVnd)}`);
  }
  if (eligibility.minQuantity !== null) {
    parts.push(`từ ${eligibility.minQuantity} món`);
  }
  if (eligibility.timeWindow !== null) {
    parts.push(
      `trong khung ${minuteToLabel(eligibility.timeWindow.fromMinuteOfDay)}–${minuteToLabel(eligibility.timeWindow.toMinuteOfDay)}`,
    );
  }
  if (eligibility.daysOfWeek !== null) {
    parts.push(
      `vào ${eligibility.daysOfWeek.map((day) => WEEKDAY_LABELS[day]).join(', ')}`,
    );
  }
  if (eligibility.code !== null) {
    parts.push(`khi khách nhập mã ${eligibility.code}`);
  }
  if (eligibility.customerSegment !== null) {
    const segment = eligibility.customerSegment;
    if (segment.type === 'newCustomer') {
      parts.push('cho khách lần đầu');
    } else if (segment.type === 'visitCountAtLeast') {
      parts.push(`cho khách đã ghé từ ${segment.visitCount} lần`);
    } else if (segment.type === 'loyaltyTierAtLeast') {
      parts.push(`cho hội viên từ ${segment.minPoints} điểm`);
    }
  }
  const condition = parts.length > 0 ? parts.join(', ') : 'cho mọi hoá đơn';

  const benefit = promotion.benefit;
  let reward: string;
  if (benefit.type === 'percentOff') {
    reward = `giảm ${benefit.percent}%`;
    if (benefit.maxDiscountVnd !== null) {
      reward += ` (tối đa ${money(benefit.maxDiscountVnd)})`;
    }
  } else if (benefit.type === 'fixedAmount') {
    reward = `giảm ${money(benefit.amountVnd)}`;
  } else if (benefit.type === 'buyXGetY') {
    const rewardLabel =
      benefit.reward.type === 'free'
        ? 'tặng miễn phí'
        : `giảm ${benefit.reward.percent}%`;
    reward = `mua ${benefit.buyQuantity} ${rewardLabel} ${benefit.getQuantity} món`;
  } else if (benefit.type === 'freeItem') {
    reward = `tặng ${benefit.quantity} món`;
  } else if (benefit.type === 'bundlePrice') {
    reward = `${benefit.quantity} món giá trọn gói ${money(benefit.bundlePriceVnd)}`;
  } else {
    reward = `dùng ${benefit.pointsCost} điểm để nhận ưu đãi`;
  }
  return `${reward.charAt(0).toUpperCase()}${reward.slice(1)} — ${condition}.`;
}

interface DraftState {
  promotionId: string | null;
  name: string;
  priority: number;
  benefitType: PromotionBenefitType;
  percent: number;
  maxDiscountVnd: number;
  amountVnd: number;
  buyQuantity: number;
  getQuantity: number;
  buySameItem: boolean;
  buyMenuItemIds: string[];
  getMenuItemIds: string[];
  rewardFree: boolean;
  rewardPercent: number;
  giftMenuItemIds: string[];
  giftQuantity: number;
  bundleMenuItemIds: string[];
  bundleQuantity: number;
  bundlePriceVnd: number;
  pointsCost: number;
  pointsRewardType: 'percentOff' | 'fixedAmount' | 'freeItem';
  pointsRewardPercent: number;
  pointsRewardAmountVnd: number;
  pointsRewardMenuItemIds: string[];
  minSubtotalVnd: number;
  minQuantity: number;
  eligibilityMenuItemIds: string[];
  happyHourEnabled: boolean;
  happyHourFrom: string;
  happyHourTo: string;
  weekdayEnabled: boolean;
  daysOfWeek: number[];
  code: string;
  segmentType: PromotionCustomerSegment['type'];
  segmentVisitCount: number;
  segmentMinPoints: number;
  startsAt: string;
  endsAt: string;
}

function emptyDraft(): DraftState {
  return {
    promotionId: null,
    name: '',
    priority: 0,
    benefitType: 'percentOff',
    percent: 10,
    maxDiscountVnd: 0,
    amountVnd: 10000,
    buyQuantity: 1,
    getQuantity: 1,
    buySameItem: true,
    buyMenuItemIds: [],
    getMenuItemIds: [],
    rewardFree: true,
    rewardPercent: 50,
    giftMenuItemIds: [],
    giftQuantity: 1,
    bundleMenuItemIds: [],
    bundleQuantity: 2,
    bundlePriceVnd: 50000,
    pointsCost: 100,
    pointsRewardType: 'fixedAmount',
    pointsRewardPercent: 10,
    pointsRewardAmountVnd: 20000,
    pointsRewardMenuItemIds: [],
    minSubtotalVnd: 0,
    minQuantity: 0,
    eligibilityMenuItemIds: [],
    happyHourEnabled: false,
    happyHourFrom: '14:00',
    happyHourTo: '17:00',
    weekdayEnabled: false,
    daysOfWeek: [],
    code: '',
    segmentType: 'all',
    segmentVisitCount: 3,
    segmentMinPoints: 100,
    startsAt: '',
    endsAt: '',
  };
}

function draftFromPromotion(promotion: Promotion): DraftState {
  const draft = emptyDraft();
  draft.promotionId = promotion.promotionId;
  draft.name = promotion.name;
  draft.priority = promotion.priority;
  draft.startsAt = promotion.startsAt ? promotion.startsAt.slice(0, 10) : '';
  draft.endsAt = promotion.endsAt ? promotion.endsAt.slice(0, 10) : '';
  draft.benefitType = promotion.benefit.type;
  draft.minSubtotalVnd = promotion.eligibility.minSubtotalVnd ?? 0;
  draft.minQuantity = promotion.eligibility.minQuantity ?? 0;
  draft.eligibilityMenuItemIds = promotion.eligibility.menuItemIds ?? [];
  if (promotion.eligibility.timeWindow) {
    draft.happyHourEnabled = true;
    draft.happyHourFrom = minuteToLabel(
      promotion.eligibility.timeWindow.fromMinuteOfDay,
    );
    draft.happyHourTo = minuteToLabel(
      promotion.eligibility.timeWindow.toMinuteOfDay,
    );
  }
  if (promotion.eligibility.daysOfWeek) {
    draft.weekdayEnabled = true;
    draft.daysOfWeek = [...promotion.eligibility.daysOfWeek];
  }
  draft.code = promotion.eligibility.code ?? '';
  const segment = promotion.eligibility.customerSegment;
  if (segment && segment.type !== 'all') {
    draft.segmentType = segment.type;
    if (segment.type === 'visitCountAtLeast') {
      draft.segmentVisitCount = segment.visitCount;
    }
    if (segment.type === 'loyaltyTierAtLeast') {
      draft.segmentMinPoints = segment.minPoints;
    }
  }
  const benefit = promotion.benefit;
  if (benefit.type === 'percentOff') {
    draft.percent = benefit.percent;
    draft.maxDiscountVnd = benefit.maxDiscountVnd ?? 0;
  } else if (benefit.type === 'fixedAmount') {
    draft.amountVnd = benefit.amountVnd;
  } else if (benefit.type === 'buyXGetY') {
    draft.buyQuantity = benefit.buyQuantity;
    draft.getQuantity = benefit.getQuantity;
    draft.getMenuItemIds = [...benefit.getMenuItemIds];
    draft.buyMenuItemIds = benefit.buyMenuItemIds ?? [];
    draft.buySameItem =
      benefit.buyMenuItemIds === null ||
      benefit.getMenuItemIds.every((id) => benefit.buyMenuItemIds?.includes(id));
    draft.rewardFree = benefit.reward.type === 'free';
    draft.rewardPercent =
      benefit.reward.type === 'percentOff' ? benefit.reward.percent : 50;
  } else if (benefit.type === 'freeItem') {
    draft.giftMenuItemIds = [...benefit.menuItemIds];
    draft.giftQuantity = benefit.quantity;
  } else if (benefit.type === 'bundlePrice') {
    draft.bundleMenuItemIds = [...benefit.menuItemIds];
    draft.bundleQuantity = benefit.quantity;
    draft.bundlePriceVnd = benefit.bundlePriceVnd;
  } else {
    draft.pointsCost = benefit.pointsCost;
    draft.pointsRewardType = benefit.reward.type;
    if (benefit.reward.type === 'percentOff') {
      draft.pointsRewardPercent = benefit.reward.percent;
    } else if (benefit.reward.type === 'fixedAmount') {
      draft.pointsRewardAmountVnd = benefit.reward.amountVnd;
    } else {
      draft.pointsRewardMenuItemIds = [...benefit.reward.menuItemIds];
    }
  }
  return draft;
}

function draftToBenefit(draft: DraftState): PromotionBenefit {
  switch (draft.benefitType) {
    case 'percentOff':
      return {
        type: 'percentOff',
        percent: Math.min(Math.max(Math.trunc(draft.percent) || 1, 1), 100),
        maxDiscountVnd:
          draft.maxDiscountVnd > 0 ? Math.trunc(draft.maxDiscountVnd) : null,
      };
    case 'fixedAmount':
      return {
        type: 'fixedAmount',
        amountVnd: Math.max(Math.trunc(draft.amountVnd) || 1, 1),
      };
    case 'buyXGetY':
      return {
        type: 'buyXGetY',
        buyMenuItemIds:
          draft.buySameItem || draft.buyMenuItemIds.length === 0
            ? null
            : draft.buyMenuItemIds,
        buyQuantity: Math.max(Math.trunc(draft.buyQuantity) || 1, 1),
        getMenuItemIds: draft.getMenuItemIds,
        getQuantity: Math.max(Math.trunc(draft.getQuantity) || 1, 1),
        reward: draft.rewardFree
          ? { type: 'free' }
          : {
              type: 'percentOff',
              percent: Math.min(Math.max(Math.trunc(draft.rewardPercent) || 1, 1), 100),
            },
      };
    case 'freeItem':
      return {
        type: 'freeItem',
        menuItemIds: draft.giftMenuItemIds,
        quantity: Math.max(Math.trunc(draft.giftQuantity) || 1, 1),
      };
    case 'bundlePrice':
      return {
        type: 'bundlePrice',
        menuItemIds: draft.bundleMenuItemIds,
        quantity: Math.max(Math.trunc(draft.bundleQuantity) || 2, 2),
        bundlePriceVnd: Math.max(Math.trunc(draft.bundlePriceVnd) || 0, 0),
      };
    case 'pointsRedemption':
      return {
        type: 'pointsRedemption',
        pointsCost: Math.max(Math.trunc(draft.pointsCost) || 1, 1),
        reward:
          draft.pointsRewardType === 'percentOff'
            ? {
                type: 'percentOff',
                percent: Math.min(
                  Math.max(Math.trunc(draft.pointsRewardPercent) || 1, 1),
                  100,
                ),
                maxDiscountVnd: null,
              }
            : draft.pointsRewardType === 'fixedAmount'
              ? {
                  type: 'fixedAmount',
                  amountVnd: Math.max(
                    Math.trunc(draft.pointsRewardAmountVnd) || 1,
                    1,
                  ),
                }
              : {
                  type: 'freeItem',
                  menuItemIds: draft.pointsRewardMenuItemIds,
                  quantity: 1,
                },
      };
  }
}

function draftToEligibility(draft: DraftState): PromotionEligibility {
  const segment: PromotionCustomerSegment =
    draft.segmentType === 'all'
      ? { type: 'all' }
      : draft.segmentType === 'newCustomer'
        ? { type: 'newCustomer' }
        : draft.segmentType === 'visitCountAtLeast'
          ? {
              type: 'visitCountAtLeast',
              visitCount: Math.max(Math.trunc(draft.segmentVisitCount) || 1, 1),
            }
          : {
              type: 'loyaltyTierAtLeast',
              minPoints: Math.max(Math.trunc(draft.segmentMinPoints) || 0, 0),
            };
  return {
    minSubtotalVnd:
      draft.minSubtotalVnd > 0 ? Math.trunc(draft.minSubtotalVnd) : null,
    minQuantity: draft.minQuantity > 0 ? Math.trunc(draft.minQuantity) : null,
    menuItemIds:
      draft.eligibilityMenuItemIds.length > 0
        ? draft.eligibilityMenuItemIds
        : null,
    timeWindow: draft.happyHourEnabled
      ? {
          fromMinuteOfDay: labelToMinute(draft.happyHourFrom),
          toMinuteOfDay: labelToMinute(draft.happyHourTo),
        }
      : null,
    daysOfWeek:
      draft.weekdayEnabled && draft.daysOfWeek.length > 0
        ? [...draft.daysOfWeek].sort((left, right) => left - right)
        : null,
    code: draft.code.trim().length > 0 ? draft.code.trim().toUpperCase() : null,
    customerSegment: segment,
  };
}

/** Reasons the form cannot be saved yet, in the order the Owner reads them. */
function validateDraft(draft: DraftState): string[] {
  const problems: string[] = [];
  if (draft.name.trim().length === 0) {
    problems.push('Chưa đặt tên khuyến mãi.');
  }
  if (draft.benefitType === 'buyXGetY' && draft.getMenuItemIds.length === 0) {
    problems.push('Chọn món được tặng.');
  }
  if (
    !draft.buySameItem &&
    draft.benefitType === 'buyXGetY' &&
    draft.buyMenuItemIds.length === 0
  ) {
    problems.push('Chọn món thuộc nhóm mua.');
  }
  if (draft.benefitType === 'freeItem' && draft.giftMenuItemIds.length === 0) {
    problems.push('Chọn món tặng.');
  }
  if (
    draft.benefitType === 'bundlePrice' &&
    draft.bundleMenuItemIds.length === 0
  ) {
    problems.push('Chọn món trong combo.');
  }
  if (
    draft.benefitType === 'pointsRedemption' &&
    draft.pointsRewardType === 'freeItem' &&
    draft.pointsRewardMenuItemIds.length === 0
  ) {
    problems.push('Chọn món tặng khi đổi điểm.');
  }
  if (draft.code.trim().length > 0 && draft.code.trim().length < 3) {
    problems.push('Mã ưu đãi cần ít nhất 3 ký tự.');
  }
  if (draft.weekdayEnabled && draft.daysOfWeek.length === 0) {
    problems.push('Chọn ít nhất một ngày trong tuần.');
  }
  return problems;
}

/** A checkbox list of the tenant menu items, keyed by id. */
function MenuItemPicker({
  legend,
  menuItems,
  selected,
  onToggle,
}: {
  legend: string;
  menuItems: Array<{ id: string; name: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
        {legend}
      </legend>
      {menuItems.length === 0 ? (
        <p className="text-xs text-zinc-500">
          Chưa có món nào trong thực đơn.
        </p>
      ) : (
        <div className="max-h-40 overflow-y-auto border-hard bg-zinc-50 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {menuItems.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-2 text-xs cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={() => onToggle(item.id)}
                className="w-4 h-4 accent-orange-600"
              />
              <span className="truncate">{item.name}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

export default function PromotionsPage() {
  const toast = useToast();
  const tenantId = useActiveTenantId();
  const [promotions, promotionsState] = useStoreSlice('promotions');
  const [suggestions, suggestionsState] = useStoreSlice('campaignSuggestions');
  const [menuItems] = useStoreSlice('menuItems');

  const [plan, setPlan] = useState<SubscriptionPlan>('free');
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [channel, setChannel] = useState<'promotion' | 'loyalty'>('promotion');
  const [goal, setGoal] = useState<CampaignGoal>('increaseOrderValue');
  const [suggesting, setSuggesting] = useState(false);
  const [measuringId, setMeasuringId] = useState<string | null>(null);
  const [measurements, setMeasurements] = useState<
    Record<string, string>
  >({});

  const entitlements = useMemo(() => resolvePlanEntitlements(plan), [plan]);
  const canUseAdvanced = entitlements.features.includes('promotionAdvanced');
  const maxActivePromotions = entitlements.maxActivePromotions;

  useEffect(() => {
    let cancelled = false;
    void getSubscription()
      .then((state) => {
        if (!cancelled && state) {
          setPlan(state.plan);
        }
      })
      .catch(() => {
        // A missing subscription read leaves the conservative Free limits.
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const activeCount = promotions.filter(
    (promotion) => promotion.status === 'active',
  ).length;
  const atActiveLimit =
    maxActivePromotions !== null && activeCount >= maxActivePromotions;

  const menuItemChoices = useMemo(
    () =>
      menuItems.map((item) => ({
        id: item.menuItemId,
        name: item.name,
      })),
    [menuItems],
  );

  const reload = useCallback(() => {
    refreshSlice('promotions');
  }, []);

  const toggleIn = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];

  const handleSave = useCallback(async () => {
    if (!draft || !tenantId) {
      return;
    }
    const problems = validateDraft(draft);
    if (problems.length > 0) {
      toast.error(problems[0]);
      return;
    }
    setSaving(true);
    try {
      await upsertPromotion({
        tenantId,
        promotionId: draft.promotionId,
        name: draft.name.trim(),
        priority: Math.trunc(draft.priority) || 0,
        startsAt: draft.startsAt
          ? `${draft.startsAt}T00:00:00.000Z`
          : null,
        endsAt: draft.endsAt ? `${draft.endsAt}T23:59:59.999Z` : null,
        eligibility: draftToEligibility(draft),
        benefit: draftToBenefit(draft),
      });
      toast.success(
        draft.promotionId
          ? 'Đã cập nhật khuyến mãi'
          : 'Đã tạo khuyến mãi. Bật để bắt đầu chạy.',
      );
      setDraft(null);
      reload();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Không lưu được khuyến mãi.',
      );
    } finally {
      setSaving(false);
    }
  }, [draft, tenantId, toast, reload]);

  const handleStatus = useCallback(
    async (promotion: Promotion, status: PromotionStatus) => {
      if (!tenantId) {
        return;
      }
      setBusyId(promotion.promotionId);
      try {
        await changePromotionStatus(
          tenantId,
          promotion.promotionId,
          status,
        );
        toast.success(
          status === 'active'
            ? 'Đã bật khuyến mãi'
            : status === 'inactive'
              ? 'Đã tạm dừng khuyến mãi'
              : 'Đã lưu trữ khuyến mãi',
        );
        reload();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Không đổi được trạng thái khuyến mãi.',
        );
      } finally {
        setBusyId(null);
      }
    },
    [tenantId, toast, reload],
  );

  const handleSuggest = useCallback(async () => {
    if (!tenantId) {
      return;
    }
    setSuggesting(true);
    try {
      await suggestCampaign({ tenantId, channel, goal });
      toast.success('Đã tạo gợi ý chiến dịch');
      refreshSlice('campaignSuggestions');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Không tạo được gợi ý.',
      );
    } finally {
      setSuggesting(false);
    }
  }, [tenantId, channel, goal, toast]);

  const handleApprove = useCallback(
    async (suggestion: CampaignSuggestion) => {
      if (!tenantId) {
        return;
      }
      setBusyId(suggestion.suggestionId);
      try {
        await approveCampaign({
          tenantId,
          suggestionId: suggestion.suggestionId,
          idempotencyKey: `approve-${suggestion.suggestionId}`,
        });
        toast.success('Đã duyệt chiến dịch');
        refreshSlice('campaignSuggestions');
        reload();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Không duyệt được chiến dịch.',
        );
      } finally {
        setBusyId(null);
      }
    },
    [tenantId, toast, reload],
  );

  const handleMeasure = useCallback(
    async (suggestion: CampaignSuggestion) => {
      if (!tenantId) {
        return;
      }
      setMeasuringId(suggestion.suggestionId);
      try {
        const result = await measureCampaign({
          tenantId,
          suggestionId: suggestion.suggestionId,
        });
        const measurement = result.measurement;
        setMeasurements((previous) => ({
          ...previous,
          [suggestion.suggestionId]:
            `${measurement.paidOrderCount} đơn đã trả · doanh thu ${money(measurement.revenueVnd)} · ` +
            `lợi nhuận gộp sau giảm ${money(measurement.grossProfitAfterDiscountVnd)} · ` +
            `giá trị đơn trung bình ${money(measurement.averageOrderValueVnd)} · ` +
            `khách quay lại ${measurement.returningLoyaltyMembers}/${measurement.distinctLoyaltyMembers}` +
            (measurement.missingData ? ' · còn thiếu dữ liệu' : ''),
        }));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Không đo được chiến dịch.',
        );
      } finally {
        setMeasuringId(null);
      }
    },
    [tenantId, toast],
  );

  const quickPromotion = promotions.find(
    (promotion) => promotion.promotionId === QUICK_DISCOUNT_PROMOTION_ID,
  );

  return (
    <div className="p-6 md:p-12 w-full max-w-5xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-zinc-900 uppercase tracking-tighter flex items-center gap-3">
            <BadgePercent className="w-8 h-8" />
            Khuyến mãi
          </h1>
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mt-2">
            Tạo ưu đãi, bật chạy và xem lại kết quả
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraft(emptyDraft())}
          className="inline-flex items-center gap-2 bg-orange-600 text-white border-hard px-5 py-3 font-mono text-xs font-bold uppercase tracking-widest hover:bg-orange-700 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Thêm khuyến mãi
        </button>
      </header>

      <section
        className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8"
        aria-label="Tình trạng khuyến mãi"
      >
        {(
          [
            ['Đang chạy', promotions.filter((p) => p.status === 'active').length],
            [
              'Tạm dừng',
              promotions.filter((p) => p.status === 'inactive').length,
            ],
            ['Tổng số', promotions.length],
            [
              'Giới hạn gói',
              maxActivePromotions === null
                ? 'Không giới hạn'
                : `${maxActivePromotions} đang chạy`,
            ],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="bg-white border-hard shadow-hard p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              {label}
            </p>
            <p className="mt-1 text-xl font-black text-zinc-900">{value}</p>
          </div>
        ))}
      </section>

      {atActiveLimit && (
        <div
          role="status"
          className="mb-8 border-hard bg-amber-50 p-4 flex items-start gap-3"
        >
          <AlertTriangle
            className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="text-sm text-zinc-800">
            <p className="font-bold">
              Gói hiện tại đã dùng hết {maxActivePromotions} khuyến mãi đang chạy.
            </p>
            <p className="mt-1">
              Tạm dừng một khuyến mãi khác, hoặc nâng lên Lite để chạy nhiều
              khuyến mãi và dùng giờ vàng, mã ưu đãi, tặng món, đổi điểm.
            </p>
          </div>
        </div>
      )}

      {quickPromotion && (
        <div className="mb-8 border-hard bg-white p-4 flex items-start gap-3">
          <Ticket
            className="w-5 h-5 text-orange-600 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="text-sm text-zinc-800">
            <p className="font-bold">Ưu đãi nhanh đang bật từ trang Cấu hình</p>
            <p className="mt-1">{describePromotion(quickPromotion)}</p>
            <p className="mt-1 text-zinc-500">
              Ưu đãi nhanh chỉ sửa được ở trang Cấu hình. Muốn nhiều loại ưu đãi
              hơn thì tạo khuyến mãi mới ở đây.
            </p>
          </div>
        </div>
      )}

      <section aria-labelledby="promotion-list-title" className="mb-10">
        <h2
          id="promotion-list-title"
          className="font-bold text-lg uppercase tracking-tight text-zinc-900 mb-4"
        >
          Danh sách khuyến mãi
        </h2>

        {promotionsState.loading && promotions.length === 0 ? (
          <p className="text-sm text-zinc-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Đang tải khuyến mãi…
          </p>
        ) : promotionsState.error ? (
          <p role="alert" className="text-sm text-red-600">
            {promotionsState.error}
          </p>
        ) : promotions.length === 0 ? (
          <div className="border-hard bg-white p-8 text-center">
            <Gift
              className="w-8 h-8 mx-auto text-zinc-400"
              aria-hidden="true"
            />
            <p className="mt-3 font-bold text-zinc-900">
              Chưa có khuyến mãi nào
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Bắt đầu bằng một ưu đãi đơn giản: giảm 10% cho hoá đơn từ
              200.000đ.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {promotions.map((promotion) => {
              const isQuick =
                promotion.promotionId === QUICK_DISCOUNT_PROMOTION_ID;
              const busy = busyId === promotion.promotionId;
              return (
                <li
                  key={promotion.promotionId}
                  className="border-hard bg-white p-4 md:p-5"
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-zinc-900 truncate">
                          {promotion.name}
                        </h3>
                        <span
                          className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border ${
                            promotion.status === 'active'
                              ? 'border-emerald-600 text-emerald-700 bg-emerald-50'
                              : 'border-zinc-400 text-zinc-600 bg-zinc-50'
                          }`}
                        >
                          {STATUS_LABELS[promotion.status]}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border border-zinc-300 text-zinc-600">
                          {BENEFIT_OPTIONS.find(
                            (option) => option.type === promotion.benefit.type,
                          )?.label ?? promotion.benefit.type}
                        </span>
                        {isQuick && (
                          <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border border-orange-500 text-orange-700 bg-orange-50">
                            Ưu đãi nhanh
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-zinc-600">
                        {describePromotion(promotion)}
                      </p>
                      {(promotion.startsAt || promotion.endsAt) && (
                        <p className="mt-1 font-mono text-[11px] text-zinc-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          {promotion.startsAt
                            ? promotion.startsAt.slice(0, 10)
                            : 'không giới hạn'}
                          {' → '}
                          {promotion.endsAt
                            ? promotion.endsAt.slice(0, 10)
                            : 'không giới hạn'}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!isQuick && (
                        <button
                          type="button"
                          onClick={() => setDraft(draftFromPromotion(promotion))}
                          title="Sửa khuyến mãi"
                          aria-label={`Sửa khuyến mãi ${promotion.name}`}
                          className="p-2 border-hard hover:bg-zinc-100 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" aria-hidden="true" />
                        </button>
                      )}
                      {promotion.status === 'active' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleStatus(promotion, 'inactive')}
                          title="Tạm dừng khuyến mãi"
                          aria-label={`Tạm dừng khuyến mãi ${promotion.name}`}
                          className="p-2 border-hard hover:bg-zinc-100 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Pause className="w-4 h-4" aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleStatus(promotion, 'active')}
                          title="Bật khuyến mãi"
                          aria-label={`Bật khuyến mãi ${promotion.name}`}
                          className="p-2 border-hard hover:bg-emerald-50 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Play className="w-4 h-4" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleStatus(promotion, 'archived')}
                        title="Lưu trữ khuyến mãi"
                        aria-label={`Lưu trữ khuyến mãi ${promotion.name}`}
                        className="p-2 border-hard hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="campaign-title" className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-orange-600" aria-hidden="true" />
          <h2
            id="campaign-title"
            className="font-bold text-lg uppercase tracking-tight text-zinc-900"
          >
            AI gợi ý chiến dịch
          </h2>
        </div>
        <p className="text-sm text-zinc-600 mb-4">
          AI đọc số liệu bán hàng của quán rồi đề xuất một chiến dịch. Chỉ khi
          bạn bấm <strong>Duyệt</strong> thì chiến dịch mới được áp dụng.
        </p>

        <div className="border-hard bg-white p-4 md:p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="space-y-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                Kênh
              </span>
              <select
                value={channel}
                onChange={(event) =>
                  setChannel(event.target.value as 'promotion' | 'loyalty')
                }
                className="w-full bg-zinc-50 border-hard px-3 py-2 font-mono text-xs font-bold uppercase"
              >
                <option value="promotion">Khuyến mãi</option>
                <option value="loyalty">Tích điểm</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                Mục tiêu
              </span>
              <select
                value={goal}
                onChange={(event) =>
                  setGoal(event.target.value as CampaignGoal)
                }
                className="w-full bg-zinc-50 border-hard px-3 py-2 font-mono text-xs font-bold uppercase"
              >
                {Object.entries(GOAL_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                disabled={suggesting || !tenantId}
                onClick={() => void handleSuggest()}
                className="w-full inline-flex items-center justify-center gap-2 bg-zinc-950 text-white border-hard px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                {suggesting ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                )}
                Gợi ý
              </button>
            </div>
          </div>

          {suggestionsState.loading && suggestions.length === 0 ? (
            <p className="text-sm text-zinc-500">Đang tải gợi ý…</p>
          ) : suggestions.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Chưa có gợi ý nào. Bấm <strong>Gợi ý</strong> để AI đề xuất một
              chiến dịch từ số liệu gần đây.
            </p>
          ) : (
            <ul className="space-y-3">
              {suggestions.map((suggestion) => (
                <li
                  key={suggestion.suggestionId}
                  className="border-hard bg-zinc-50 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-zinc-900">
                      {suggestion.title}
                    </h3>
                    <span
                      className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border ${
                        suggestion.status === 'approved'
                          ? 'border-emerald-600 text-emerald-700 bg-emerald-50'
                          : 'border-zinc-400 text-zinc-600 bg-white'
                      }`}
                    >
                      {suggestion.status === 'approved'
                        ? 'Đã duyệt'
                        : 'Chờ duyệt'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-700">
                    {suggestion.rationale}
                  </p>
                  {suggestion.missingData && (
                    <p className="mt-1 text-xs text-amber-700">
                      Còn thiếu dữ liệu
                      {suggestion.missingDataNotes.length > 0
                        ? `: ${suggestion.missingDataNotes.join('; ')}`
                        : ''}
                    </p>
                  )}
                  {measurements[suggestion.suggestionId] && (
                    <p className="mt-2 font-mono text-[11px] text-zinc-600">
                      {measurements[suggestion.suggestionId]}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {suggestion.status !== 'approved' && (
                      <button
                        type="button"
                        disabled={busyId === suggestion.suggestionId}
                        onClick={() => void handleApprove(suggestion)}
                        className="inline-flex items-center gap-1 border-hard bg-emerald-600 text-white px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" aria-hidden="true" />
                        Duyệt
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={measuringId === suggestion.suggestionId}
                      onClick={() => void handleMeasure(suggestion)}
                      className="inline-flex items-center gap-1 border-hard bg-white px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-100 cursor-pointer disabled:opacity-50"
                    >
                      {measuringId === suggestion.suggestionId ? (
                        <Loader2
                          className="w-3 h-3 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Clock className="w-3 h-3" aria-hidden="true" />
                      )}
                      Đo lường
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {draft &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto p-4 bg-zinc-900/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="promotion-dialog-title"
          >
            <div className="bg-white border-hard shadow-[8px_8px_0_0_#09090b] w-full max-w-3xl my-8">
              <div className="flex justify-between items-center p-4 border-b border-hard bg-zinc-950 text-white">
                <h2
                  id="promotion-dialog-title"
                  className="font-mono font-bold text-sm uppercase tracking-widest"
                >
                  {draft.promotionId ? 'Sửa khuyến mãi' : 'Khuyến mãi mới'}
                </h2>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  title="Đóng"
                  aria-label="Đóng hộp thoại khuyến mãi"
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>

              <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
                <label className="space-y-2 block">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                    Tên khuyến mãi
                  </span>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                    placeholder="Giảm 10% giờ trưa"
                    className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm"
                  />
                </label>

                <fieldset className="space-y-2">
                  <legend className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    Loại khuyến mãi
                  </legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {BENEFIT_OPTIONS.map((option) => {
                      const locked = option.advanced && !canUseAdvanced;
                      return (
                        <label
                          key={option.type}
                          className={`flex items-start gap-2 border-hard p-3 ${
                            locked
                              ? 'opacity-50 cursor-not-allowed'
                              : 'cursor-pointer hover:bg-zinc-50'
                          } ${
                            draft.benefitType === option.type
                              ? 'bg-orange-50'
                              : 'bg-white'
                          }`}
                        >
                          <input
                            type="radio"
                            name="benefitType"
                            checked={draft.benefitType === option.type}
                            disabled={locked}
                            onChange={() =>
                              setDraft({ ...draft, benefitType: option.type })
                            }
                            className="mt-0.5 w-4 h-4 accent-orange-600"
                          />
                          <span>
                            <span className="block text-xs font-bold uppercase tracking-widest">
                              {option.label}
                              {locked ? ' · cần Lite' : ''}
                            </span>
                            <span className="block text-xs text-zinc-500 mt-0.5">
                              {option.hint}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Benefit-specific fields. */}
                {draft.benefitType === 'percentOff' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="space-y-2">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                        Phần trăm giảm
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={draft.percent}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            percent: Number(event.target.value),
                          })
                        }
                        className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                        Giảm tối đa (đ, 0 = không giới hạn)
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={draft.maxDiscountVnd}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            maxDiscountVnd: Number(event.target.value),
                          })
                        }
                        className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm"
                      />
                    </label>
                  </div>
                )}

                {draft.benefitType === 'fixedAmount' && (
                  <label className="space-y-2 block">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                      Số tiền giảm (đ)
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={1000}
                      value={draft.amountVnd}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          amountVnd: Number(event.target.value),
                        })
                      }
                      className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm"
                    />
                  </label>
                )}

                {draft.benefitType === 'buyXGetY' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <label className="space-y-2">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                          Mua bao nhiêu món
                        </span>
                        <input
                          type="number"
                          min={1}
                          value={draft.buyQuantity}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              buyQuantity: Number(event.target.value),
                            })
                          }
                          className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm"
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                          Tặng bao nhiêu món
                        </span>
                        <input
                          type="number"
                          min={1}
                          value={draft.getQuantity}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              getQuantity: Number(event.target.value),
                            })
                          }
                          className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm"
                        />
                      </label>
                    </div>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.buySameItem}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            buySameItem: event.target.checked,
                          })
                        }
                        className="w-4 h-4 accent-orange-600"
                      />
                      Mua và tặng cùng một món (mua 1 tặng 1)
                    </label>
                    {!draft.buySameItem && (
                      <MenuItemPicker
                        legend="Nhóm món được tính là đã mua"
                        menuItems={menuItemChoices}
                        selected={draft.buyMenuItemIds}
                        onToggle={(id) =>
                          setDraft({
                            ...draft,
                            buyMenuItemIds: toggleIn(draft.buyMenuItemIds, id),
                          })
                        }
                      />
                    )}
                    <MenuItemPicker
                      legend="Món được tặng"
                      menuItems={menuItemChoices}
                      selected={draft.getMenuItemIds}
                      onToggle={(id) =>
                        setDraft({
                          ...draft,
                          getMenuItemIds: toggleIn(draft.getMenuItemIds, id),
                        })
                      }
                    />
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!draft.rewardFree}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            rewardFree: !event.target.checked,
                          })
                        }
                        className="w-4 h-4 accent-orange-600"
                      />
                      Giảm một phần thay vì tặng miễn phí
                    </label>
                    {!draft.rewardFree && (
                      <label className="space-y-2 block">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                          Phần trăm giảm cho món tặng
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={draft.rewardPercent}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              rewardPercent: Number(event.target.value),
                            })
                          }
                          className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm"
                        />
                      </label>
                    )}
                  </div>
                )}

                {draft.benefitType === 'freeItem' && (
                  <div className="space-y-4">
                    <MenuItemPicker
                      legend="Món tặng (chọn món rẻ nhất làm quà)"
                      menuItems={menuItemChoices}
                      selected={draft.giftMenuItemIds}
                      onToggle={(id) =>
                        setDraft({
                          ...draft,
                          giftMenuItemIds: toggleIn(draft.giftMenuItemIds, id),
                        })
                      }
                    />
                    <label className="space-y-2 block">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                        Số lượng tặng
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={draft.giftQuantity}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            giftQuantity: Number(event.target.value),
                          })
                        }
                        className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm"
                      />
                    </label>
                  </div>
                )}

                {draft.benefitType === 'bundlePrice' && (
                  <div className="space-y-4">
                    <MenuItemPicker
                      legend="Món trong combo"
                      menuItems={menuItemChoices}
                      selected={draft.bundleMenuItemIds}
                      onToggle={(id) =>
                        setDraft({
                          ...draft,
                          bundleMenuItemIds: toggleIn(
                            draft.bundleMenuItemIds,
                            id,
                          ),
                        })
                      }
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <label className="space-y-2">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                          Số món mỗi combo
                        </span>
                        <input
                          type="number"
                          min={2}
                          value={draft.bundleQuantity}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              bundleQuantity: Number(event.target.value),
                            })
                          }
                          className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm"
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                          Giá trọn gói (đ)
                        </span>
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={draft.bundlePriceVnd}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              bundlePriceVnd: Number(event.target.value),
                            })
                          }
                          className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {draft.benefitType === 'pointsRedemption' && (
                  <div className="space-y-4">
                    <label className="space-y-2 block">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                        Số điểm khách dùng
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={draft.pointsCost}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            pointsCost: Number(event.target.value),
                          })
                        }
                        className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm"
                      />
                    </label>
                    <label className="space-y-2 block">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                        Khách nhận được
                      </span>
                      <select
                        value={draft.pointsRewardType}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            pointsRewardType: event.target
                              .value as DraftState['pointsRewardType'],
                          })
                        }
                        className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm font-bold uppercase"
                      >
                        <option value="fixedAmount">Giảm tiền</option>
                        <option value="percentOff">Giảm %</option>
                        <option value="freeItem">Tặng món</option>
                      </select>
                    </label>
                    {draft.pointsRewardType === 'fixedAmount' && (
                      <label className="space-y-2 block">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                          Số tiền giảm (đ)
                        </span>
                        <input
                          type="number"
                          min={1}
                          step={1000}
                          value={draft.pointsRewardAmountVnd}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              pointsRewardAmountVnd: Number(event.target.value),
                            })
                          }
                          className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm"
                        />
                      </label>
                    )}
                    {draft.pointsRewardType === 'percentOff' && (
                      <label className="space-y-2 block">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                          Phần trăm giảm
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={draft.pointsRewardPercent}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              pointsRewardPercent: Number(event.target.value),
                            })
                          }
                          className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm"
                        />
                      </label>
                    )}
                    {draft.pointsRewardType === 'freeItem' && (
                      <MenuItemPicker
                        legend="Món tặng khi đổi điểm"
                        menuItems={menuItemChoices}
                        selected={draft.pointsRewardMenuItemIds}
                        onToggle={(id) =>
                          setDraft({
                            ...draft,
                            pointsRewardMenuItemIds: toggleIn(
                              draft.pointsRewardMenuItemIds,
                              id,
                            ),
                          })
                        }
                      />
                    )}
                  </div>
                )}

                {/* Conditions. */}
                <div className="pt-4 border-t space-y-4">
                  <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-zinc-900">
                    Điều kiện áp dụng
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="space-y-2">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                        Hoá đơn tối thiểu (đ, 0 = không yêu cầu)
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={draft.minSubtotalVnd}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            minSubtotalVnd: Number(event.target.value),
                          })
                        }
                        className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                        Số món tối thiểu (0 = không yêu cầu)
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={draft.minQuantity}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            minQuantity: Number(event.target.value),
                          })
                        }
                        className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm"
                      />
                    </label>
                  </div>

                  <MenuItemPicker
                    legend="Chỉ áp dụng khi giỏ có một trong các món này (bỏ trống = mọi món)"
                    menuItems={menuItemChoices}
                    selected={draft.eligibilityMenuItemIds}
                    onToggle={(id) =>
                      setDraft({
                        ...draft,
                        eligibilityMenuItemIds: toggleIn(
                          draft.eligibilityMenuItemIds,
                          id,
                        ),
                      })
                    }
                  />

                  <div
                    className={`space-y-3 border-hard p-3 ${
                      canUseAdvanced ? 'bg-white' : 'bg-zinc-100 opacity-60'
                    }`}
                  >
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={!canUseAdvanced}
                        checked={draft.happyHourEnabled}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            happyHourEnabled: event.target.checked,
                          })
                        }
                        className="w-4 h-4 accent-orange-600"
                      />
                      <span className="font-bold uppercase tracking-widest">
                        Giờ vàng{canUseAdvanced ? '' : ' · cần Lite'}
                      </span>
                    </label>
                    {draft.happyHourEnabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <label className="space-y-1">
                          <span className="font-mono text-[10px] text-zinc-500 block">
                            Từ
                          </span>
                          <input
                            type="time"
                            value={draft.happyHourFrom}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                happyHourFrom: event.target.value,
                              })
                            }
                            className="w-full bg-zinc-50 border-hard px-3 py-2 font-mono text-sm"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="font-mono text-[10px] text-zinc-500 block">
                            Đến
                          </span>
                          <input
                            type="time"
                            value={draft.happyHourTo}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                happyHourTo: event.target.value,
                              })
                            }
                            className="w-full bg-zinc-50 border-hard px-3 py-2 font-mono text-sm"
                          />
                        </label>
                      </div>
                    )}

                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={!canUseAdvanced}
                        checked={draft.weekdayEnabled}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            weekdayEnabled: event.target.checked,
                          })
                        }
                        className="w-4 h-4 accent-orange-600"
                      />
                      <span className="font-bold uppercase tracking-widest">
                        Chọn ngày trong tuần
                        {canUseAdvanced ? '' : ' · cần Lite'}
                      </span>
                    </label>
                    {draft.weekdayEnabled && (
                      <div className="flex flex-wrap gap-2">
                        {WEEKDAY_LABELS.map((label, day) => (
                          <label
                            key={label}
                            className="flex items-center gap-1 text-xs cursor-pointer border-hard px-2 py-1 bg-zinc-50"
                          >
                            <input
                              type="checkbox"
                              checked={draft.daysOfWeek.includes(day)}
                              onChange={() =>
                                setDraft({
                                  ...draft,
                                  daysOfWeek: draft.daysOfWeek.includes(day)
                                    ? draft.daysOfWeek.filter(
                                        (entry) => entry !== day,
                                      )
                                    : [...draft.daysOfWeek, day],
                                })
                              }
                              className="w-3.5 h-3.5 accent-orange-600"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    )}

                    <label className="space-y-1 block">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                        Mã ưu đãi khách phải nhập
                        {canUseAdvanced ? '' : ' · cần Lite'}
                      </span>
                      <input
                        type="text"
                        disabled={!canUseAdvanced}
                        value={draft.code}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            code: event.target.value.toUpperCase(),
                          })
                        }
                        placeholder="TET2026"
                        className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm uppercase"
                      />
                    </label>

                    <label className="space-y-1 block">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                        Nhóm khách{canUseAdvanced ? '' : ' · cần Lite'}
                      </span>
                      <select
                        disabled={!canUseAdvanced}
                        value={draft.segmentType}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            segmentType: event.target
                              .value as PromotionCustomerSegment['type'],
                          })
                        }
                        className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm font-bold uppercase"
                      >
                        <option value="all">Tất cả khách</option>
                        <option value="newCustomer">Khách lần đầu</option>
                        <option value="visitCountAtLeast">
                          Khách đã ghé đủ số lần
                        </option>
                        <option value="loyaltyTierAtLeast">
                          Hội viên đủ điểm
                        </option>
                      </select>
                    </label>
                    {draft.segmentType === 'visitCountAtLeast' && (
                      <label className="space-y-1 block">
                        <span className="font-mono text-[10px] text-zinc-500 block">
                          Số lần ghé tối thiểu
                        </span>
                        <input
                          type="number"
                          min={1}
                          value={draft.segmentVisitCount}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              segmentVisitCount: Number(event.target.value),
                            })
                          }
                          className="w-full bg-zinc-50 border-hard px-3 py-2 font-mono text-sm"
                        />
                      </label>
                    )}
                    {draft.segmentType === 'loyaltyTierAtLeast' && (
                      <label className="space-y-1 block">
                        <span className="font-mono text-[10px] text-zinc-500 block">
                          Điểm tối thiểu
                        </span>
                        <input
                          type="number"
                          min={0}
                          value={draft.segmentMinPoints}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              segmentMinPoints: Number(event.target.value),
                            })
                          }
                          className="w-full bg-zinc-50 border-hard px-3 py-2 font-mono text-sm"
                        />
                      </label>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <label className="space-y-2">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                        Bắt đầu (bỏ trống = ngay)
                      </span>
                      <input
                        type="date"
                        value={draft.startsAt}
                        onChange={(event) =>
                          setDraft({ ...draft, startsAt: event.target.value })
                        }
                        className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                        Kết thúc (bỏ trống = mãi)
                      </span>
                      <input
                        type="date"
                        value={draft.endsAt}
                        onChange={(event) =>
                          setDraft({ ...draft, endsAt: event.target.value })
                        }
                        className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                        Ưu tiên (lớn hơn thắng khi bằng tiền giảm)
                      </span>
                      <input
                        type="number"
                        value={draft.priority}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            priority: Number(event.target.value),
                          })
                        }
                        className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm"
                      />
                    </label>
                  </div>

                  <p className="text-xs text-zinc-600 bg-zinc-50 border-hard p-3">
                    {describePromotion({
                      ...({
                        schemaVersion: 2,
                        promotionId: draft.promotionId ?? 'draft',
                        tenantId: tenantId ?? '',
                        name: draft.name,
                        source: 'manual',
                        status: 'inactive',
                        priority: draft.priority,
                        startsAt: null,
                        endsAt: null,
                        createdAt: new Date(0).toISOString(),
                        updatedAt: new Date(0).toISOString(),
                        archivedAt: null,
                      } as Promotion),
                      eligibility: draftToEligibility(draft),
                      benefit: draftToBenefit(draft),
                    })}
                  </p>

                  {!isBasicPromotion(
                    draftToBenefit(draft),
                    draftToEligibility(draft),
                  ) &&
                    !canUseAdvanced && (
                      <p role="alert" className="text-xs text-red-600">
                        Gói hiện tại chỉ dùng được giảm % hoặc giảm tiền với
                        điều kiện cơ bản. Hãy chọn lại, hoặc nâng lên Lite.
                      </p>
                    )}
                </div>
              </div>

              <div className="flex justify-end gap-3 p-4 border-t border-hard bg-zinc-50">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="border-hard bg-white px-5 py-3 font-mono text-xs font-bold uppercase tracking-widest hover:bg-zinc-100 cursor-pointer"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="inline-flex items-center gap-2 bg-orange-600 text-white border-hard px-5 py-3 font-mono text-xs font-bold uppercase tracking-widest hover:bg-orange-700 cursor-pointer disabled:opacity-50"
                >
                  {saving && (
                    <Loader2
                      className="w-4 h-4 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  Lưu khuyến mãi
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
