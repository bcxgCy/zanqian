const planUtil = require('./plan');
const money = require('./money');
const cloudSync = require('./cloudSync');
const dateUtil = require('./date');

const defaultUser = {
  nickName: '存钱达人',
  avatarUrl: '',
  savingDays: 0,
};

function normalizeState(state) {
  // 云端可能返回旧数据或空字段，这里统一补齐默认用户和 plans 数组。
  return {
    openid: state && state.openid ? state.openid : '',
    user: Object.assign({}, defaultUser, state && state.user ? state.user : {}),
    plans: state && Array.isArray(state.plans) ? state.plans : [],
  };
}

function getState() {
  return cloudSync.login().then(normalizeState);
}

function getPlans() {
  return getState().then((state) => state.plans);
}

function savePlans(plans) {
  // 仅用于清空/兼容旧接口；常规计划操作走 addPlan/updatePlan/deletePlan。
  return cloudSync.savePlans(plans || []).then(normalizeState);
}

function getPlan(id) {
  return getPlans().then((plans) => plans.find((p) => p.id === id));
}

function addPlan(plan) {
  return cloudSync.addPlan(plan).then((result) => result.plan || plan);
}

function updatePlan(id, updates) {
  return cloudSync.updatePlan(id, updates).then((result) => result.plan || null);
}

function deletePlan(id) {
  return cloudSync.deletePlan(id).then(normalizeState);
}

function allocateRemainingAmounts(periods, remaining) {
  // 打卡后按剩余目标重摊未完成期数，保证每期至少 0.01 元并尽量保持原权重。
  const remainingCents = money.toCents(remaining);
  if (remainingCents <= 0 || !periods.length) return [];

  const count = Math.min(periods.length, remainingCents);
  const nextPeriods = periods.slice(0, count);
  const baseCents = count;
  const extraCents = remainingCents - baseCents;
  const weights = nextPeriods.map((p) => Math.max(0, money.toCents(p.expectedAmount)));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const extras = [];
  let usedExtra = 0;

  for (let i = 0; i < count; i++) {
    const raw = weightTotal ? (extraCents * weights[i]) / weightTotal : extraCents / count;
    const cents = Math.floor(raw);
    extras.push({ index: i, cents, remainder: raw - cents });
    usedExtra += cents;
  }

  let leftExtra = extraCents - usedExtra;
  extras.sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < extras.length && leftExtra > 0; i++) {
    extras[i].cents += 1;
    leftExtra--;
  }
  extras.sort((a, b) => a.index - b.index);

  return nextPeriods.map((period, idx) => Object.assign({}, period, {
    expectedAmount: money.fromCents(1 + extras[idx].cents),
  }));
}

function getPlanFrequency(plan) {
  // 暂停重启、最后一期补差额都需要知道下一期按天/周/月顺延。
  if (plan && plan.customConfig && plan.customConfig.frequency) {
    return plan.customConfig.frequency;
  }
  if (plan && plan.planType === 'preset') {
    if (plan.presetId === '52week') return 'week';
    if (plan.presetId === '12month') return 'month';
  }
  return 'day';
}

function createRemainingPeriod(plan, completedPeriods, remaining) {
  // 所有期数完成但金额还没达标时，追加一期补齐剩余差额。
  const lastPeriod = completedPeriods.reduce((latest, period) => {
    if (!latest) return period;
    return period.index > latest.index ? period : latest;
  }, null);
  const frequency = getPlanFrequency(plan);
  const lastDate = lastPeriod && lastPeriod.date ? lastPeriod.date : plan.startDate;

  return {
    index: lastPeriod ? lastPeriod.index + 1 : 1,
    expectedAmount: money.toMoney(remaining),
    savedAmount: 0,
    date: dateUtil.getPeriodDate(lastDate, frequency, 1),
    completed: false,
    note: '',
  };
}

function reschedulePendingPeriods(plan, restartDate) {
  // 重启计划只重排未完成期数；已完成记录保留原日期，避免历史流水被改写。
  const frequency = getPlanFrequency(plan);
  let pendingIndex = 0;
  return (plan.periods || []).map((period) => {
    if (period.completed) return period;
    const date = dateUtil.getPeriodDate(restartDate, frequency, pendingIndex);
    pendingIndex++;
    return Object.assign({}, period, { date });
  });
}

function rebalancePeriods(plan, updatedPeriod) {
  // 记录一次存入后，重新计算后续未完成期数，确保最终目标金额能被补齐。
  const targetAmount = money.toMoney(plan.targetAmount);
  const completedPeriods = [];
  const pendingPeriods = [];

  plan.periods.forEach((period) => {
    const next = period.index === updatedPeriod.index ? updatedPeriod : period;
    if (next.completed) {
      completedPeriods.push(next);
    } else {
      pendingPeriods.push(next);
    }
  });

  const savedTotal = money.sum(completedPeriods, (p) => p.savedAmount || 0);
  const remaining = money.sub(targetAmount, savedTotal);
  if (!money.greaterThanZero(remaining)) {
    // 已存达到或超过目标时，未完成期数不再保留；计划完成状态由详情页确认后写入。
    return completedPeriods.sort((a, b) => a.index - b.index);
  }

  const rebalancedPending = allocateRemainingAmounts(pendingPeriods, remaining);
  if (!rebalancedPending.length) {
    rebalancedPending.push(createRemainingPeriod(plan, completedPeriods, remaining));
  }
  return completedPeriods.concat(rebalancedPending).sort((a, b) => a.index - b.index);
}

function updatePeriod(planId, periodIndex, data) {
  // 单期打卡是唯一会改变 periods 金额分配的入口。
  return getPlan(planId).then((plan) => {
    if (!plan) return null;
    const period = plan.periods.find((p) => p.index === periodIndex);
    if (!period) return null;
    const periodData = Object.assign({}, data);
    const completePlan = !!periodData.completePlan;
    delete periodData.completePlan;
    const savedAmount = money.toMoney(
      periodData.savedAmount !== undefined ? periodData.savedAmount : period.savedAmount
    );
    const updatedPeriod = Object.assign({}, period, periodData, {
      savedAmount,
      completed: money.isPositive(savedAmount),
    });
    const periods = rebalancePeriods(plan, updatedPeriod);
    const updates = { periods };
    if (completePlan) {
      updates.completed = true;
      updates.completedAt = new Date().toISOString();
      updates.paused = false;
      updates.pausedAt = '';
    }
    return updatePlan(planId, updates);
  });
}

function pausePlan(id) {
  // 暂停只打标记，不改期数；首页和详情页根据 paused 控制排序与只读状态。
  return updatePlan(id, {
    paused: true,
    pausedAt: new Date().toISOString(),
  });
}

function restartPlan(id) {
  // 重启从今天开始重新安排未完成期数，并同步截止日期型计划的新 endDate。
  return getPlan(id).then((plan) => {
    if (!plan) return null;
    const periods = reschedulePendingPeriods(plan, dateUtil.today());
    const lastPeriod = periods[periods.length - 1];
    const updates = {
      paused: false,
      pausedAt: '',
      restartedAt: new Date().toISOString(),
      periods,
    };
    if (plan.planType === 'custom_deadline' && plan.customConfig) {
      updates.customConfig = Object.assign({}, plan.customConfig, {
        endDate: lastPeriod ? lastPeriod.date : plan.customConfig.endDate,
      });
    }
    return updatePlan(id, updates);
  });
}

function getUser() {
  return getState().then((state) => state.user);
}

function saveUser(user) {
  return cloudSync.saveUser(Object.assign({}, defaultUser, user || {})).then(normalizeState);
}

function getLoginState() {
  return cloudSync.getLoginState();
}

function getOverview() {
  return getPlans().then(getOverviewFromPlans);
}

function getOverviewFromPlans(plans) {
  // 首页总览直接按所有计划汇总，暂停计划仍计入目标和已存金额。
  const targetTotal = money.sum(plans, (plan) => plan.targetAmount);
  const savedTotal = money.sum(plans, (plan) => planUtil.calcSavedAmount(plan.periods));
  return {
    targetTotal,
    savedTotal,
    remaining: money.max(0, money.sub(targetTotal, savedTotal)),
    planCount: plans.length,
  };
}

module.exports = {
  getState,
  getPlans,
  savePlans,
  getPlan,
  addPlan,
  updatePlan,
  deletePlan,
  updatePeriod,
  pausePlan,
  restartPlan,
  getUser,
  saveUser,
  getLoginState,
  getOverview,
  getOverviewFromPlans,
};
