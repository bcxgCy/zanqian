const dateUtil = require('../../utils/date');
const planUtil = require('../../utils/plan');
const storage = require('../../utils/storage');
const money = require('../../utils/money');
const cloudFile = require('../../utils/cloudFile');

Page({
  data: {
    icons: planUtil.ICONS,
    presets: planUtil.PRESETS,
    name: '',
    icon: '💰',
    avatarUrl: '',
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

  chooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        wx.showLoading({ title: '上传中' });
        // 计划头像保存云文件 ID，避免本地路径跨设备不可用。
        cloudFile.uploadImage(file.tempFilePath, 'plan-avatars')
          .then((fileID) => {
            this.setData({ avatarUrl: fileID });
          })
          .catch((err) => {
            wx.showToast({ title: '头像上传失败', icon: 'none' });
            console.warn('计划头像上传失败', err);
          })
          .finally(() => {
            wx.hideLoading();
          });
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') !== -1) return;
        wx.showToast({ title: '选择图片失败', icon: 'none' });
      },
    });
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
    const { name, icon, avatarUrl, targetAmount, planMode, selectedPreset, customAmount, customFrequency, startDate, endDate } = this.data;
    if (!name.trim()) {
      wx.showToast({ title: '请输入存钱目的', icon: 'none' });
      return;
    }
    const target = money.toMoney(targetAmount);
    if (!money.isPositive(target)) {
      wx.showToast({ title: '请输入有效目标金额', icon: 'none' });
      return;
    }

    let planData = { name, icon, avatarUrl, targetAmount: target, startDate };

    if (planMode === 'preset') {
      // 预设计划只需要目标金额和方案 id，具体期数由 planUtil 统一生成。
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
        // 设置结束时间时按目标金额和期数自动分摊，不使用“每期金额”作为生成依据。
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
    // 保存时只提交单个计划，云端按计划文档增量写入。
    wx.showLoading({ title: '保存中' });
    storage.addPlan(plan)
      .then(() => {
        wx.showToast({ title: '添加成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 500);
      })
      .catch((err) => {
        wx.showToast({ title: '添加失败', icon: 'none' });
        console.warn('添加计划失败', err);
      })
      .finally(() => {
        wx.hideLoading();
      });
  },
});
