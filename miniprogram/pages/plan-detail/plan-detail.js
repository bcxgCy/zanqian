const dateUtil = require('../../utils/date');
const planUtil = require('../../utils/plan');
const storage = require('../../utils/storage');

Page({
  data: {
    plan: null,
    summary: {},
    planTypeName: '',
    persistDays: 0,
    today: '',
    showSheet: false,
    sheetReadonly: false,
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
        const today = dateUtil.today();
        const summary = planUtil.getPlanSummary(plan);
        const persistDays = dateUtil.diffDays(plan.startDate, today) + 1;
        const viewPlan = Object.assign({}, plan, {
          periods: (plan.periods || []).map((period) => this.formatPeriod(period, today)),
        });
        this.setData({
          plan: viewPlan,
          summary,
          planTypeName: planUtil.getPlanTypeName(plan),
          persistDays,
          today,
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

  formatPeriod(period, today) {
    const isToday = period.date === today;
    const isOverdue = !period.completed && period.date < today;
    const isEarly = !period.completed && period.date > today;
    const dateClass = period.completed ? 'is-completed' : isToday ? 'is-today' : isOverdue ? 'is-overdue' : 'is-early';
    const dateStatus = period.completed
      ? '已打卡'
      : isToday
        ? '待打卡'
        : isOverdue
          ? '已过期'
          : '未到时间';
    const displayAmount = period.completed ? period.savedAmount : period.expectedAmount;
    return Object.assign({}, period, {
      isToday,
      isOverdue,
      isEarly,
      dateClass,
      dateStatus,
      displayAmount,
    });
  },

  openDeposit(e) {
    const index = Number(e.currentTarget.dataset.index);
    const period = this.data.plan.periods.find((p) => p.index === index);
    this.handlePeriodTap(period);
  },

  handlePeriodTap(period) {
    if (!period) return;
    const isToday = period.date === this.data.today;

    if (period.completed) {
      this.showDepositSheet(period, !isToday);
      return;
    }

    if (isToday) {
      this.showDepositSheet(period, false);
      return;
    }

    const isOverdue = period.date < this.data.today;
    wx.showModal({
      title: isOverdue ? '确认补打卡' : '确认提前打卡',
      content: isOverdue ? '该计划日期已过期，是否继续补打卡？' : '该计划还没到时间，是否继续提前打卡？',
      confirmText: isOverdue ? '补打卡' : '提前打卡',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.showDepositSheet(period, false);
        }
      },
    });
  },

  showDepositSheet(period, readonly) {
    this.setData({ showSheet: true, sheetReadonly: !!readonly, selectedPeriod: period });
  },

  openCheckinSheet() {
    const periods = this.data.plan.periods || [];
    const period =
      periods.find((p) => p.index === this.autoPeriodIndex) ||
      periods.find((p) => !p.completed) ||
      periods[0];
    if (!period) return;
    this.handlePeriodTap(period);
  },

  closeSheet() {
    this.setData({ showSheet: false, sheetReadonly: false, selectedPeriod: null });
  },

  onDepositConfirm(e) {
    const { savedAmount, note } = e.detail;
    wx.showLoading({ title: '保存中' });
    storage.updatePeriod(this.planId, this.data.selectedPeriod.index, {
      savedAmount,
      date: this.data.selectedPeriod.date,
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
