const planUtil = require('../../utils/plan');
const storage = require('../../utils/storage');

Page({
  data: {
    result: null,
    table: [],
  },

  onLoad(options) {
    if (!options.data) return;
    const result = JSON.parse(decodeURIComponent(options.data));
    const table = planUtil.buildCalcTable(result.periods);
    this.setData({ result, table });
  },

  applyPlan() {
    const { result } = this.data;
    const plan = planUtil.buildPlanFromCalc(result);
    storage.addPlan(plan);
    wx.showToast({ title: '已添加到首页', icon: 'success' });
    setTimeout(() => {
      wx.switchTab({ url: '/pages/index/index' });
    }, 600);
  },

  goBack() {
    wx.navigateBack();
  },
});
