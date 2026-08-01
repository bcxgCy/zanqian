const storage = require('../../utils/storage');
const planUtil = require('../../utils/plan');

Page({
  data: {
    overview: { targetTotal: 0, savedTotal: 0, remaining: 0 },
    plans: [],
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    const plans = storage.getPlans().map((plan) => {
      const summary = planUtil.getPlanSummary(plan);
      return Object.assign({}, plan, summary, {
        planTypeName: planUtil.getPlanTypeName(plan),
      });
    });
    this.setData({
      overview: storage.getOverview(),
      plans,
    });
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
});
