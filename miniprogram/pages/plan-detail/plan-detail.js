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

  loadPlan(showLoading = true) {
    if (showLoading) wx.showLoading({ title: '加载中' });
    return storage.getPlan(this.planId)
      .then((plan) => {
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
      })
      .catch((err) => {
        wx.showToast({ title: '计划加载失败', icon: 'none' });
        console.warn('计划加载失败', err);
      })
      .finally(() => {
        if (showLoading) wx.hideLoading();
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
    wx.showLoading({ title: '保存中' });
    storage.updatePeriod(this.planId, this.data.selectedPeriod.index, {
      savedAmount,
      date,
      note,
    }).then(() => {
      this.closeSheet();
      return this.loadPlan(false);
    }).then(() => {
      wx.showToast({ title: '存入成功', icon: 'success' });
    }).catch((err) => {
      wx.showToast({ title: '存入失败', icon: 'none' });
      console.warn('存入失败', err);
    }).finally(() => {
      wx.hideLoading();
    });
  },

  deletePlan() {
    wx.showModal({
      title: '确认删除',
      content: '删除后数据不可恢复',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中' });
          storage.deletePlan(this.planId).then(() => {
            wx.navigateBack();
          }).catch((err) => {
            wx.showToast({ title: '删除失败', icon: 'none' });
            console.warn('删除失败', err);
          }).finally(() => {
            wx.hideLoading();
          });
        }
      },
    });
  },
});
