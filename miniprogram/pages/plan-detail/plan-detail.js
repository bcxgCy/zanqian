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
    canPause: false,
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
          canPause: !plan.paused && summary.progress < 100,
        }, () => {
          // 首页快捷打卡参数只消费一次；暂停计划不会自动弹出打卡面板。
          if (!this.autoCheckin) return;
          this.autoCheckin = false;
          if (!plan.paused) this.openCheckinSheet();
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
    // 期数状态只影响展示和交互提示，真实完成状态仍以 completed 为准。
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
    // 暂停计划进入只读模式，历史和未来期数都不能编辑。
    if (this.data.plan.paused) {
      this.showDepositSheet(period, true);
      return;
    }

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
    if (this.data.plan && this.data.plan.paused) return;
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
    // 防止暂停前已打开的弹层在暂停后仍提交打卡。
    if (this.data.plan && this.data.plan.paused) {
      wx.showToast({ title: '计划已暂停', icon: 'none' });
      this.closeSheet();
      return;
    }
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

  pausePlan() {
    // 暂停不改日期和金额，只改变计划状态，方便之后重启重新排期。
    wx.showModal({
      title: '暂停计划',
      content: '暂停后该计划会排到首页底部，期间只能查看，不能打卡。确认暂停吗？',
      confirmText: '暂停',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '暂停中' });
        storage.pausePlan(this.planId)
          .then(() => this.loadPlan(false))
          .then(() => {
            wx.showToast({ title: '已暂停', icon: 'success' });
          })
          .catch((err) => {
            wx.showToast({ title: '暂停失败', icon: 'none' });
            console.warn('暂停计划失败', err);
          })
          .finally(() => {
            wx.hideLoading();
          });
      },
    });
  },

  restartPlan() {
    // 重启会把未完成期数从今天开始重排，已完成流水保持不变。
    wx.showModal({
      title: '重启计划',
      content: '重启后会从今天开始重新安排未完成期数的预计完成时间。确认重启吗？',
      confirmText: '重启',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '重启中' });
        storage.restartPlan(this.planId)
          .then(() => this.loadPlan(false))
          .then(() => {
            wx.showToast({ title: '已重启', icon: 'success' });
          })
          .catch((err) => {
            wx.showToast({ title: '重启失败', icon: 'none' });
            console.warn('重启计划失败', err);
          })
          .finally(() => {
            wx.hideLoading();
          });
      },
    });
  },
});
