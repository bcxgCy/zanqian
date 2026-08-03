const dateUtil = require('../../utils/date');
const planUtil = require('../../utils/plan');
const storage = require('../../utils/storage');

Page({
  data: {
    plan: null,
    summary: {},
    planTypeName: '',
    persistDays: 0,
    showSheet: false,
    selectedPeriod: null,
  },

  onLoad(options) {
    this.planId = options.id;
    this.autoCheckin = options.checkin === '1';
    this.autoPeriodIndex = Number(options.periodIndex || 0);
  },

  onShow() {
    this.loadPlan();
  },

  loadPlan() {
    const plan = storage.getPlan(this.planId);
    if (!plan) {
      wx.showToast({ title: '计划不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const summary = planUtil.getPlanSummary(plan);
    const persistDays = dateUtil.diffDays(plan.startDate, dateUtil.today()) + 1;
    this.setData({
      plan,
      summary,
      planTypeName: planUtil.getPlanTypeName(plan),
      persistDays,
    }, () => {
      if (this.autoCheckin) {
        this.openCheckinSheet();
        this.autoCheckin = false;
      }
    });
  },

  openDeposit(e) {
    const index = Number(e.currentTarget.dataset.index);
    const period = this.data.plan.periods.find((p) => p.index === index);
    this.setData({ showSheet: true, selectedPeriod: period });
  },

  openCheckinSheet() {
    const periods = this.data.plan.periods || [];
    const period =
      periods.find((p) => p.index === this.autoPeriodIndex) ||
      periods.find((p) => !p.completed) ||
      periods[0];
    if (!period) return;
    this.setData({
      showSheet: true,
      selectedPeriod: period,
    });
  },

  closeSheet() {
    this.setData({ showSheet: false, selectedPeriod: null });
  },

  onDepositConfirm(e) {
    const { savedAmount, date, note } = e.detail;
    storage.updatePeriod(this.planId, this.data.selectedPeriod.index, {
      savedAmount,
      date,
      note,
    });
    this.closeSheet();
    this.loadPlan();
    wx.showToast({ title: '存入成功', icon: 'success' });
  },

  deletePlan() {
    wx.showModal({
      title: '确认删除',
      content: '删除后数据不可恢复',
      success: (res) => {
        if (res.confirm) {
          storage.deletePlan(this.planId);
          wx.navigateBack();
        }
      },
    });
  },
});
