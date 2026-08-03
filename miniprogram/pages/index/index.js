const storage = require('../../utils/storage');
const planUtil = require('../../utils/plan');
const dateUtil = require('../../utils/date');

const GUIDE_KEY = 'home_new_plan_guide_shown';

Page({
  data: {
    overview: { targetTotal: 0, savedTotal: 0, remaining: 0 },
    plans: [],
  },

  onShow() {
    this.loadData();
    this.showNewUserGuide();
  },

  loadData() {
    const rawPlans = storage.getPlans();
    const today = dateUtil.today();
    const plans = rawPlans.map((plan) => {
      const summary = planUtil.getPlanSummary(plan);
      const actionPeriod = this.getActionPeriod(plan, today);
      return Object.assign({}, plan, summary, {
        planTypeName: planUtil.getPlanTypeName(plan),
        nextSaveDate: actionPeriod ? actionPeriod.date : '',
        nextSaveText: actionPeriod ? '下次存钱 ' + actionPeriod.date : '计划已完成',
        nextPeriodIndex: actionPeriod ? actionPeriod.index : 0,
        actionText: this.getPlanActionText(actionPeriod, today),
        actionType: this.getPlanActionType(actionPeriod, today),
        sortGroup: this.getPlanSortGroup(actionPeriod, today),
      });
    }).sort((a, b) => {
      if (a.sortGroup !== b.sortGroup) return a.sortGroup - b.sortGroup;
      if (a.sortGroup === 1) return b.nextSaveDate.localeCompare(a.nextSaveDate);
      return a.nextSaveDate.localeCompare(b.nextSaveDate);
    });
    this.setData({
      overview: storage.getOverview(),
      plans,
    });
  },

  getActionPeriod(plan, today) {
    const periods = plan.periods || [];
    const todayPeriod = periods.find((period) => !period.completed && period.date === today);
    if (todayPeriod) return todayPeriod;
    return periods.find((period) => !period.completed);
  },

  getPlanActionText(period, today) {
    if (!period) return '去查看';
    if (period.date === today) return '去打卡';
    if (period.date < today) return '补打卡';
    return '去查看';
  },

  getPlanActionType(period, today) {
    if (!period) return 'view';
    return period.date <= today ? 'checkin' : 'view';
  },

  getPlanSortGroup(period, today) {
    if (!period) return 3;
    if (period.date === today) return 0;
    if (period.date < today) return 1;
    return 2;
  },

  showNewUserGuide() {
    if (wx.getStorageSync(GUIDE_KEY) || storage.getPlans().length) return;
    wx.setStorageSync(GUIDE_KEY, true);
    setTimeout(() => {
      wx.showModal({
        title: '创建第一份心愿',
        content: '点击右下角加号，创建你的第一个存钱心愿。',
        confirmText: '去创建',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) this.goAddPlan();
        },
      });
    }, 500);
  },

  goStatistics() {
    wx.navigateTo({ url: '/pages/statistics/statistics' });
  },

  goAddPlan() {
    wx.navigateTo({ url: '/pages/plan-add/plan-add' });
  },

  goPlanDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/plan-detail/plan-detail?id=' + id });
  },

  handlePlanAction(e) {
    const { id, action, periodIndex } = e.currentTarget.dataset;
    if (action === 'checkin') {
      wx.navigateTo({
        url:
          '/pages/plan-detail/plan-detail?id=' +
          id +
          '&checkin=1&periodIndex=' +
          periodIndex,
      });
      return;
    }
    wx.navigateTo({ url: '/pages/plan-detail/plan-detail?id=' + id });
  },
});
