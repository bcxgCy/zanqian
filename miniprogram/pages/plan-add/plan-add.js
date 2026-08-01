const dateUtil = require('../../utils/date');
const planUtil = require('../../utils/plan');
const storage = require('../../utils/storage');
const money = require('../../utils/money');

Page({
  data: {
    icons: planUtil.ICONS,
    presets: planUtil.PRESETS,
    name: '',
    icon: '💰',
    targetAmount: '',
    planMode: 'preset',
    expandedPreset: '',
    selectedPreset: '',
    customAmount: '',
    customFrequency: 'day',
    frequencyOptions: ['每天', '每周', '每月'],
    frequencyIndex: 0,
    startDate: dateUtil.today(),
    endDate: '',
    presetSheetShow: false,
    presetSheetContent: null,
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  selectIcon(e) {
    this.setData({ icon: e.currentTarget.dataset.icon });
  },

  switchPlanMode(e) {
    this.setData({ planMode: e.currentTarget.dataset.mode, expandedPreset: '' });
  },

  togglePreset(e) {
    const id = e.currentTarget.dataset.id;
    const expanded = this.data.expandedPreset === id ? '' : id;
    this.setData({
      expandedPreset: expanded,
      selectedPreset: id,
    });
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

  showPresetSheet(e) {
    const id = e.currentTarget.dataset.id;
    const preset = planUtil.getPreset(id);
    this.setData({ presetSheetShow: true, presetSheetContent: preset });
  },

  closePresetSheet() {
    this.setData({ presetSheetShow: false });
  },

  submit() {
    const { name, icon, targetAmount, planMode, selectedPreset, customAmount, customFrequency, startDate, endDate } = this.data;
    if (!name.trim()) {
      wx.showToast({ title: '请输入存钱目的', icon: 'none' });
      return;
    }
    const target = money.toMoney(targetAmount);
    if (!money.isPositive(target)) {
      wx.showToast({ title: '请输入有效目标金额', icon: 'none' });
      return;
    }

    let planData = { name, icon, targetAmount: target, startDate };

    if (planMode === 'preset') {
      if (!selectedPreset) {
        wx.showToast({ title: '请选择预设方案', icon: 'none' });
        return;
      }
      planData.planType = 'preset';
      planData.presetId = selectedPreset;
    } else {
      if (!customAmount) {
        wx.showToast({ title: '请输入每期金额', icon: 'none' });
        return;
      }
      if (endDate) {
        planData.planType = 'custom_deadline';
        planData.customConfig = {
          endDate,
          frequency: customFrequency,
          randomAmount: false,
        };
      } else {
        planData.planType = 'custom_fixed';
        planData.customConfig = {
          amountPerPeriod: money.toMoney(customAmount),
          frequency: customFrequency,
        };
      }
    }

    const plan = planUtil.buildPlanFromCalc(planData);
    storage.addPlan(plan);
    wx.showToast({ title: '添加成功', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 500);
  },
});
