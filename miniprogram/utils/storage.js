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

function updatePeriod(planId, periodIndex, data) {
  return getPlan(planId).then((plan) => {
    if (!plan) return null;
    const periods = plan.periods.map((p) => {
      if (p.index !== periodIndex) return p;
      const savedAmount = money.toMoney(
        data.savedAmount !== undefined ? data.savedAmount : p.savedAmount
      );
      const expectedAmount = money.toMoney(p.expectedAmount);
      const completed = money.gte(savedAmount, money.mul(expectedAmount, 0.99));
      return Object.assign({}, p, data, { savedAmount, completed });
    });
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
