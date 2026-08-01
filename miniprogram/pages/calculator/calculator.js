const dateUtil = require('../../utils/date');
const planUtil = require('../../utils/plan');
const money = require('../../utils/money');

Page({
  data: {
    icons: planUtil.ICONS,
    presets: planUtil.PRESETS,
    name: '',
    icon: '💰',
    targetAmount: '',
    calcMode: 'fixed',
    expandedPreset: '',
    customAmount: '',
    customFrequency: 'day',
    frequencyOptions: ['每天', '每周', '每月'],
    frequencyIndex: 0,
    startDate: dateUtil.today(),
    endDate: '',
    randomAmount: false,
    presetSheetShow: false,
    presetSheetContent: null,
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
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

  showPresetSheet(e) {
    const id = e.currentTarget.dataset.id;
    const preset = planUtil.getPreset(id);
    this.setData({ presetSheetShow: true, presetSheetContent: preset, expandedPreset: id });
  },

  closePresetSheet() {
    this.setData({ presetSheetShow: false });
  },

  calculate() {
    const { name, icon, targetAmount, calcMode, expandedPreset, customAmount, customFrequency, startDate, endDate, randomAmount } = this.data;
    const target = money.toMoney(targetAmount);
    if (!money.isPositive(target)) {
      wx.showToast({ title: '请输入目标金额', icon: 'none' });
      return;
    }

    let result = null;
    let planType = '';
    let presetId = null;
    let customConfig = {};

    if (calcMode === 'preset') {
      if (!expandedPreset) {
        wx.showToast({ title: '请选择存钱方案', icon: 'none' });
        return;
      }
      planType = 'preset';
      presetId = expandedPreset;
      const periods = planUtil.generatePeriods({ planType, presetId, targetAmount: target, startDate, customConfig: {} });
      result = { periods, endDate: periods[periods.length - 1].date, periodCount: periods.length };
    } else if (calcMode === 'fixed') {
      const amount = money.toMoney(customAmount);
      if (!money.isPositive(amount)) {
        wx.showToast({ title: '请输入每期金额', icon: 'none' });
        return;
      }
      planType = 'custom_fixed';
      customConfig = { amountPerPeriod: amount, frequency: customFrequency };
      result = planUtil.calculateFixedResult(target, amount, customFrequency, startDate);
    } else {
      if (!endDate) {
        wx.showToast({ title: '请选择结束时间', icon: 'none' });
        return;
      }
      planType = 'custom_deadline';
      customConfig = { endDate, frequency: customFrequency, randomAmount };
      result = planUtil.calculateDeadlineResult(target, startDate, endDate, customFrequency, randomAmount);
    }

    const payload = {
      name: name || '存钱计划',
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
    wx.navigateTo({
      url: '/pages/calculator-result/calculator-result?data=' + encodeURIComponent(JSON.stringify(payload)),
    });
  },
});
