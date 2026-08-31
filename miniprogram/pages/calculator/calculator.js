const dateUtil = require('../../utils/date');
const planUtil = require('../../utils/plan');
const money = require('../../utils/money');

const HUNDRED_DAY_PRESET_ID = '100day';
const HUNDRED_DAY_FIXED_TARGET = planUtil.getFixedPresetTarget(HUNDRED_DAY_PRESET_ID) || 5050;
const HUNDRED_DAY_DEFAULT_NAME = '100天存钱挑战';

Page({
  data: {
    icons: planUtil.ICONS,
    presets: planUtil.PRESETS,
    name: '',
    icon: '💰',
    targetAmount: '',
    calcMode: 'fixed',
    expandedPreset: '',
    presetReverse30Day: false,
    customAmount: '',
    customFrequency: 'day',
    frequencyOptions: ['每天', '每周', '每月'],
    frequencyIndex: 0,
    startDate: dateUtil.today(),
    endDate: '',
    randomAmount: false,
    presetSheetShow: false,
    presetSheetContent: null,
    galleryShow: false,
    expandedPresetName: '',
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    if (field === 'targetAmount' && this.data.calcMode === 'preset' && this.data.expandedPreset === HUNDRED_DAY_PRESET_ID) {
      this.setData({ targetAmount: String(HUNDRED_DAY_FIXED_TARGET) });
      return;
    }
    this.setData({ [field]: e.detail.value });
  },

  onTargetAmountTap() {
    if (this.data.calcMode === 'preset' && this.data.expandedPreset === HUNDRED_DAY_PRESET_ID) {
      wx.showToast({ title: '该方案为挑战类型，不可修改金额', icon: 'none' });
    }
  },

  selectIcon(e) {
    this.setData({ icon: e.currentTarget.dataset.icon });
  },

  switchCalcMode(e) {
    this.setData({ calcMode: e.currentTarget.dataset.mode });
  },

  togglePreset(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ expandedPreset: this.data.expandedPreset === id ? '' : id });
  },

  onFrequencyChange(e) {
    const map = ['day', 'week', 'month'];
    this.setData({ frequencyIndex: Number(e.detail.value), customFrequency: map[e.detail.value] });
  },

  onStartChange(e) {
    this.setData({ startDate: e.detail.value });
  },

  onEndChange(e) {
    this.setData({ endDate: e.detail.value });
  },

  onRandomChange(e) {
    this.setData({ randomAmount: e.detail.value });
  },

  onFreqTap(e) {
    const map = ['day', 'week', 'month'];
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({ frequencyIndex: idx, customFrequency: map[idx] });
  },

  openGallery() {
    this.setData({ galleryShow: true });
  },

  closeSheets() {
    this.setData({ galleryShow: false, presetSheetShow: false });
  },

  showPresetSheet(e) {
    const id = e.currentTarget.dataset.id;
    const preset = planUtil.getPreset(id);
    const nextData = {
      presetSheetShow: true,
      presetSheetContent: preset,
      expandedPreset: id,
      expandedPresetName: preset.name,
      presetReverse30Day: id === '30day' ? this.data.presetReverse30Day : false,
      calcMode: 'preset',
      galleryShow: false,
    };

    if (id === HUNDRED_DAY_PRESET_ID) {
      nextData.targetAmount = String(HUNDRED_DAY_FIXED_TARGET);
      if (!this.data.name.trim()) {
        nextData.name = HUNDRED_DAY_DEFAULT_NAME;
      }
    }

    this.setData(nextData);
  },

  onPresetReverse30DayChange(e) {
    this.setData({ presetReverse30Day: !!e.detail.value });
  },

  closePresetSheet() {
    this.setData({ presetSheetShow: false });
  },

  calculate() {
    const {
      name,
      icon,
      targetAmount,
      calcMode,
      expandedPreset,
      presetReverse30Day,
      customAmount,
      customFrequency,
      startDate,
      endDate,
      randomAmount,
    } = this.data;
    let result = null;
    let planType = '';
    let presetId = null;
    let customConfig = {};
    let target = money.toMoney(targetAmount);

    if (calcMode === 'preset') {
      if (!expandedPreset) {
        wx.showToast({ title: '请选择存钱方案', icon: 'none' });
        return;
      }
      planType = 'preset';
      presetId = expandedPreset;
      if (presetId === HUNDRED_DAY_PRESET_ID) {
        target = money.toMoney(HUNDRED_DAY_FIXED_TARGET);
      }
      if (presetId === '30day') {
        customConfig = { reverse: !!presetReverse30Day };
      }
      if (!money.isPositive(target)) {
        wx.showToast({ title: '目标金额异常', icon: 'none' });
        return;
      }
      const periods = planUtil.generatePeriods({ planType, presetId, targetAmount: target, startDate, customConfig });
      result = { periods, endDate: periods[periods.length - 1].date, periodCount: periods.length };
    } else if (calcMode === 'fixed') {
      if (!money.isPositive(target)) {
        wx.showToast({ title: '请输入目标金额', icon: 'none' });
        return;
      }
      const amount = money.toMoney(customAmount);
      if (!money.isPositive(amount)) {
        wx.showToast({ title: '请输入每期金额', icon: 'none' });
        return;
      }
      planType = 'custom_fixed';
      customConfig = { amountPerPeriod: amount, frequency: customFrequency };
      result = planUtil.calculateFixedResult(target, amount, customFrequency, startDate);
    } else {
      if (!money.isPositive(target)) {
        wx.showToast({ title: '请输入目标金额', icon: 'none' });
        return;
      }
      if (!endDate) {
        wx.showToast({ title: '请选择结束时间', icon: 'none' });
        return;
      }
      planType = 'custom_deadline';
      customConfig = { endDate, frequency: customFrequency, randomAmount };
      result = planUtil.calculateDeadlineResult(target, startDate, endDate, customFrequency, randomAmount);
    }

    const payload = {
      name: name || (presetId === HUNDRED_DAY_PRESET_ID ? HUNDRED_DAY_DEFAULT_NAME : '存钱计划'),
      icon,
      targetAmount: target,
      planType,
      presetId,
      customConfig,
      startDate,
      periods: result.periods,
      endDate: result.endDate,
      periodCount: result.periodCount,
    };
    // periods 数据较大，放 URL 容易超长；这里只传临时缓存 key 到结果页。
    const resultKey = 'calc_result_' + Date.now();
    wx.setStorageSync(resultKey, payload);
    wx.navigateTo({
      url: '/pages/calculator-result/calculator-result?key=' + resultKey,
    });
  },

  /**
   * 分享计算器给朋友
   */
  onShareAppMessage() {
    return {
      title: '存钱计算器 - 帮你制定专属存钱方案',
      path: '/pages/calculator/calculator',
      imageUrl: '',
    };
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '用存钱计算器，轻松规划你的理财目标',
      query: '',
      imageUrl: '',
    };
  },
});
