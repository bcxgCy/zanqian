const planUtil = require('../../utils/plan');
const storage = require('../../utils/storage');

Page({
  data: {
    result: null,
    table: [],
    isMysteryPreset: false,
  },

  buildMysteryTable(periods) {
    const total = (periods || []).length;
    return (periods || []).map((period, idx) => ({
      index: period.index,
      expectedText: '🎁 待揭晓',
      progressText: `${idx + 1}/${total}`,
      unlockText: idx === 0 ? '今日可解锁' : '打卡后解锁',
    }));
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
    const isMysteryPreset = planUtil.isMysteryPreset(result);
    const table = isMysteryPreset
      ? this.buildMysteryTable(result.periods)
      : planUtil.buildCalcTable(result.periods);
    this.setData({ result, table, isMysteryPreset });
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

  /**
   * 分享计算结果给朋友
   */
  onShareAppMessage() {
    const { result } = this.data;
    if (!result) return {};

    const name = result.name || '存钱计划';
    const targetAmount = result.targetAmount || 0;
    const periodCount = result.periodCount || 0;

    return {
      title: `【${name}】目标 ¥${targetAmount}，共 ${periodCount} 期`,
      path: '/pages/calculator/calculator',
      imageUrl: '',
    };
  },
});
