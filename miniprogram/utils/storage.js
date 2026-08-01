const planUtil = require('./plan');
const money = require('./money');

const PLANS_KEY = 'saving_plans';
const USER_KEY = 'saving_user';

function getPlans() {
  return wx.getStorageSync(PLANS_KEY) || [];
}

function savePlans(plans) {
  wx.setStorageSync(PLANS_KEY, plans);
}

function getPlan(id) {
  return getPlans().find((p) => p.id === id);
}

function addPlan(plan) {
  const plans = getPlans();
  plans.unshift(plan);
  savePlans(plans);
  return plan;
}

function updatePlan(id, updates) {
  const plans = getPlans();
  const idx = plans.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  plans[idx] = Object.assign({}, plans[idx], updates);
  savePlans(plans);
  return plans[idx];
}

function deletePlan(id) {
  const plans = getPlans().filter((p) => p.id !== id);
  savePlans(plans);
}

function updatePeriod(planId, periodIndex, data) {
  const plan = getPlan(planId);
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
}

function getUser() {
  const defaults = {
    nickName: '存钱达人',
    avatarUrl: '',
    savingDays: 0,
  };
  return Object.assign(defaults, wx.getStorageSync(USER_KEY) || {});
}

function saveUser(user) {
  wx.setStorageSync(USER_KEY, user);
}

function getOverview() {
  const plans = getPlans();
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
  getPlans,
  savePlans,
  getPlan,
  addPlan,
  updatePlan,
  deletePlan,
  updatePeriod,
  getUser,
  saveUser,
  getOverview,
};
