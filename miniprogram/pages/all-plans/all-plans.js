const storage = require('../../utils/storage');
const planUtil = require('../../utils/plan');
const dateUtil = require('../../utils/date');

Page({
  data: {
    activeTab: 'ongoing',
    ongoingPlans: [],
    completedPlans: [],
    displayPlans: [],
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    wx.showLoading({ title: '加载中' });
    storage.getPlans()
      .then((rawPlans) => {
        const today = dateUtil.today();
        const allPlans = rawPlans.map((plan) => {
          const summary = planUtil.getPlanSummary(plan);
          const isReadonlyPlan = plan.paused || plan.completed || summary.progress >= 100;
          const actionPeriod = isReadonlyPlan ? null : this.getActionPeriod(plan, today);
          return Object.assign({}, plan, summary, {
            planTypeName: planUtil.getPlanTypeName(plan),
            nextSaveDate: actionPeriod ? actionPeriod.date : '',
            nextSaveText: plan.paused
              ? '已暂停'
              : plan.completed
                ? '已完成'
                : actionPeriod
                  ? '下次存钱 ' + actionPeriod.date
                  : '计划已完成',
            nextPeriodIndex: actionPeriod ? actionPeriod.index : 0,
            actionText: isReadonlyPlan ? '查看' : this.getPlanActionText(actionPeriod, today),
            actionType: isReadonlyPlan ? 'view' : this.getPlanActionType(actionPeriod, today),
            sortGroup: plan.paused ? 4 : this.getPlanSortGroup(actionPeriod, today),
          });
        }).sort((a, b) => {
          if (a.sortGroup !== b.sortGroup) return a.sortGroup - b.sortGroup;
          if (a.sortGroup === 1) return b.nextSaveDate.localeCompare(a.nextSaveDate);
          return a.nextSaveDate.localeCompare(b.nextSaveDate);
        });

        const completedPlans = allPlans.filter((item) => item.completed || item.progress >= 100);
        const ongoingPlans = allPlans.filter((item) => !(item.completed || item.progress >= 100));
        const displayPlans = this.data.activeTab === 'completed' ? completedPlans : ongoingPlans;
        this.setData({ ongoingPlans, completedPlans, displayPlans });
      })
      .catch((err) => {
        wx.showToast({ title: '数据加载失败', icon: 'none' });
        console.warn('全部计划加载失败', err);
      })
      .finally(() => {
        wx.hideLoading();
      });
  },

  switchTab(e) {
    const activeTab = e.currentTarget.dataset.tab;
    if (!activeTab || activeTab === this.data.activeTab) return;
    const displayPlans = activeTab === 'completed' ? this.data.completedPlans : this.data.ongoingPlans;
    this.setData({ activeTab, displayPlans });
  },

  getActionPeriod(plan, today) {
    const periods = plan.periods || [];
    const todayPeriod = periods.find((period) => !period.completed && period.date === today);
    if (todayPeriod) return todayPeriod;
    return periods.find((period) => !period.completed);
  },

  getPlanActionText(period, today) {
    if (!period) return '查看';
    if (period.date === today) return '去打卡';
    if (period.date < today) return '补打卡';
    return '查看';
  },

  getPlanActionType(period, today) {
    if (!period) return 'view';
    return period.date <= today ? 'checkin' : 'view';
  },

  getPlanSortGroup(period, today) {
    if (!period) return 3;
    if (period.date === today) return 0;
    if (period.date < today) return 1;
    return 2;
  },

  goPlanDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/plan-detail/plan-detail?id=' + id });
  },

  handlePlanAction(e) {
    const { id, action, periodIndex } = e.currentTarget.dataset;
    if (action === 'checkin') {
      wx.navigateTo({
        url: '/pages/plan-detail/plan-detail?id=' + id + '&checkin=1&periodIndex=' + periodIndex,
      });
      return;
    }
    wx.navigateTo({ url: '/pages/plan-detail/plan-detail?id=' + id });
  },
});
