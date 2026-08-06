const planUtil = require('../../utils/plan');
const storage = require('../../utils/storage');

Page({
  data: {
    result: null,
    table: [],
  },

  onLoad(options) {
    let result = null;
    if (options.key) {
      // 新版通过本地临时缓存传测算结果，读取后立即清理。
      result = wx.getStorageSync(options.key);
      wx.removeStorageSync(options.key);
    } else if (options.data) {
      // 兼容旧版 URL data 参数，避免已打开页面无法解析。
      result = JSON.parse(decodeURIComponent(options.data));
    }
    if (!result) {
      wx.showToast({ title: '测算结果已失效', icon: 'none' });
      return;
    }
    const table = planUtil.buildCalcTable(result.periods);
    this.setData({ result, table });
  },

  applyPlan() {
    const { result } = this.data;
    // 测算结果转为真实计划时，会重置 periods 为未打卡状态。
    const plan = planUtil.buildPlanFromCalc(result);
    wx.showLoading({ title: '保存中' });
    storage.addPlan(plan)
      .then(() => {
        wx.showToast({ title: '已添加到首页', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' });
        }, 600);
      })
      .catch((err) => {
        wx.showToast({ title: '添加失败', icon: 'none' });
        console.warn('添加计算结果失败', err);
      })
      .finally(() => {
        wx.hideLoading();
      });
  },

  goBack() {
    wx.navigateBack();
  },
});
