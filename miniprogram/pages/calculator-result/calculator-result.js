const planUtil = require('../../utils/plan');

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
    }
    if (!result && options.data) {
      // 兼容旧版 URL data 参数，避免已打开页面无法解析。
      try {
        result = JSON.parse(decodeURIComponent(options.data));
      } catch (err) {
        console.warn('解析旧版测算数据失败，已回退 mock', err);
      }
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
    if (!result) {
      wx.showToast({ title: '测算结果已失效', icon: 'none' });
      return;
    }

    const template = {
      name: result.name,
      icon: result.icon,
      targetAmount: result.targetAmount,
      startDate: result.startDate,
      endDate: result.endDate,
      planType: result.planType,
      presetId: result.presetId,
      customConfig: result.customConfig || {},
    };
    const templateKey = 'plan_template_from_calc_' + Date.now();
    wx.setStorageSync(templateKey, template);
    wx.navigateTo({ url: '/pages/plan-add/plan-add?templateKey=' + templateKey });
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
