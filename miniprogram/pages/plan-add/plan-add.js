const dateUtil = require('../../utils/date');
const planUtil = require('../../utils/plan');
const storage = require('../../utils/storage');
const money = require('../../utils/money');
const cloudFile = require('../../utils/cloudFile');
const subscribe = require('../../utils/subscribe');

const HUNDRED_DAY_PRESET_ID = '100day';
const HUNDRED_DAY_FIXED_TARGET = planUtil.getFixedPresetTarget(HUNDRED_DAY_PRESET_ID) || 5050;
const HUNDRED_DAY_DEFAULT_NAME = '100天存钱挑战';

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
    presetReverse30Day: false,
    frequencyOptions: ['每天', '每周', '每月'],
    frequencyIndex: 0,
    startDate: dateUtil.today(),
    endDate: '',
    presetSheetShow: false,
    presetSheetContent: null,
    // 模板回填标记
    fromTemplate: false,
  },

  onLoad(options) {
    // 检查是否有模板需要回填
    if (options.templateKey) {
      this.fillFromTemplate(options.templateKey);
    }
  },

  /**
   * 从分享模板回填表单
   * @param {string} templateKey 本地缓存键名
   */
  fillFromTemplate(templateKey) {
    try {
      const template = wx.getStorageSync(templateKey);
      if (!template) return;

      // 清除缓存（一次性使用）
      wx.removeStorageSync(templateKey);

      console.log('【plan-add】从模板回填', template);

      // 回填基础信息
      const setData = {
        fromTemplate: true,
        name: (template.name || '') + ' (副本)',
        icon: template.icon || '💰',
        targetAmount: String(template.targetAmount || ''),
        startDate: template.startDate || dateUtil.today(),
        endDate: template.endDate || '',
      };

      // 回填计划类型
      if (template.planType === 'preset' && template.presetId) {
        setData.planMode = 'preset';
        setData.selectedPreset = template.presetId;
        setData.expandedPreset = template.presetId;
        if (template.presetId === '30day') {
          setData.presetReverse30Day = !!(template.customConfig && template.customConfig.reverse);
        }
        if (template.presetId === HUNDRED_DAY_PRESET_ID) {
          setData.targetAmount = String(HUNDRED_DAY_FIXED_TARGET);
          if (!(setData.name || '').trim()) setData.name = HUNDRED_DAY_DEFAULT_NAME;
        }
      } else if (template.customConfig) {
        setData.planMode = 'custom';
        if (template.customConfig.amountPerPeriod) {
          setData.customAmount = String(template.customConfig.amountPerPeriod);
        }
        if (template.customConfig.frequency) {
          const freqMap = { day: 0, week: 1, month: 2 };
          setData.frequencyIndex = freqMap[template.customConfig.frequency] || 0;
          setData.customFrequency = template.customConfig.frequency || 'day';
        }
        if (template.customConfig.endDate) {
          setData.endDate = template.customConfig.endDate;
        }
        // 判断是固定金额还是截止日期模式
        if (template.planType === 'custom_deadline') {
          // 需要结束日期才能用截止日期模式
          if (template.endDate) {
            setData.planMode = 'deadline';
          }
        } else {
          setData.planMode = 'fixed';
        }
      }

      this.setData(setData);

      // 显示提示
      setTimeout(() => {
        wx.showToast({
          title: '已从模板回填，可修改后提交',
          icon: 'none',
          duration: 2000,
        });
      }, 500);
    } catch (err) {
      console.warn('回填模板失败', err);
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    if (field === 'targetAmount' && this.data.planMode === 'preset' && this.data.selectedPreset === HUNDRED_DAY_PRESET_ID) {
      this.setData({ targetAmount: String(HUNDRED_DAY_FIXED_TARGET) });
      return;
    }
    this.setData({ [field]: e.detail.value });
  },

  onTargetAmountTap() {
    if (this.data.planMode === 'preset' && this.data.selectedPreset === HUNDRED_DAY_PRESET_ID) {
      wx.showToast({ title: '该方案为挑战类型，不可修改金额', icon: 'none' });
    }
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
    const nextData = {
      expandedPreset: expanded,
      selectedPreset: id,
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
    const {
      name,
      icon,
      avatarUrl,
      targetAmount,
      planMode,
      selectedPreset,
      presetReverse30Day,
      customAmount,
      customFrequency,
      startDate,
      endDate,
    } = this.data;
    const isHundredDayPreset = planMode === 'preset' && selectedPreset === HUNDRED_DAY_PRESET_ID;
    const finalName = name.trim() || (isHundredDayPreset ? HUNDRED_DAY_DEFAULT_NAME : '');
    if (!finalName) {
      wx.showToast({ title: '请输入存钱目的', icon: 'none' });
      return;
    }
    const target = isHundredDayPreset
      ? money.toMoney(HUNDRED_DAY_FIXED_TARGET)
      : money.toMoney(targetAmount);
    if (!money.isPositive(target)) {
      wx.showToast({ title: '请输入有效目标金额', icon: 'none' });
      return;
    }

    let planData = { name: finalName, icon, avatarUrl, targetAmount: target, startDate };

    if (planMode === 'preset') {
      // 预设计划只需要目标金额和方案 id，具体期数由 planUtil 统一生成。
      if (!selectedPreset) {
        wx.showToast({ title: '请选择预设方案', icon: 'none' });
        return;
      }
      planData.planType = 'preset';
      planData.presetId = selectedPreset;
      if (selectedPreset === '30day') {
        planData.customConfig = { reverse: !!presetReverse30Day };
      }
      if (selectedPreset === HUNDRED_DAY_PRESET_ID) {
        planData.targetAmount = money.toMoney(HUNDRED_DAY_FIXED_TARGET);
      }
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
      .then((savedPlan) => {
        wx.showToast({ title: '添加成功', icon: 'success' });
        // 场景一：新建心愿成功后触发订阅授权
        subscribe.triggerAfterCreate(savedPlan._id || plan.id);
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
