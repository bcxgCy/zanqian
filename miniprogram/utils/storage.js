const planUtil = require('./plan');
const money = require('./money');
const cloudSync = require('./cloudSync');

const defaultUser = {
  nickName: '存钱达人',
  avatarUrl: '',
  savingDays: 0,
};

function normalizeState(state) {
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
  return cloudSync.savePlans(plans || []).then(normalizeState);
}

function getPlan(id) {
  return getPlans().then((plans) => plans.find((p) => p.id === id));
}

function addPlan(plan) {
  return getPlans().then((plans) => {
    const next = [plan].concat(plans);
    return savePlans(next).then(() => plan);
  });
}

function updatePlan(id, updates) {
  return getPlans().then((plans) => {
    const idx = plans.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    const next = plans.slice();
    next[idx] = Object.assign({}, next[idx], updates);
    return savePlans(next).then(() => next[idx]);
  });
}

function deletePlan(id) {
  return getPlans().then((plans) => savePlans(plans.filter((p) => p.id !== id)));
}

function allocateRemainingAmounts(periods, remaining) {
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

function rebalancePeriods(plan, updatedPeriod) {
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
    return completedPeriods.sort((a, b) => a.index - b.index);
  }

  const rebalancedPending = allocateRemainingAmounts(pendingPeriods, remaining);
  return completedPeriods.concat(rebalancedPending).sort((a, b) => a.index - b.index);
}

function updatePeriod(planId, periodIndex, data) {
  return getPlan(planId).then((plan) => {
    if (!plan) return null;
    const period = plan.periods.find((p) => p.index === periodIndex);
    if (!period) return null;
    const savedAmount = money.toMoney(
      data.savedAmount !== undefined ? data.savedAmount : period.savedAmount
    );
    const updatedPeriod = Object.assign({}, period, data, {
      savedAmount,
      completed: money.isPositive(savedAmount),
    });
    const periods = rebalancePeriods(plan, updatedPeriod);
    return updatePlan(planId, { periods });
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
  getUser,
  saveUser,
  getLoginState,
  getOverview,
  getOverviewFromPlans,
};
