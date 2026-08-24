const storage = require('../../utils/storage');
const planUtil = require('../../utils/plan');
const dateUtil = require('../../utils/date');

let guideShown = false;

Page({
  data: {
    overview: { targetTotal: 0, savedTotal: 0, remaining: 0 },
    plans: [],
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    wx.showLoading({ title: '加载中' });
    storage.getPlans()
      .then((rawPlans) => {
        const overview = storage.getOverviewFromPlans(rawPlans);
        const today = dateUtil.today();
        const plans = rawPlans.map((plan) => {
          const summary = planUtil.getPlanSummary(plan);
          // 暂停/完成计划不提供首页快捷打卡，只允许进入详情查看。
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
          // 排序优先级：今日待打卡、逾期补打卡、未来计划、已完成、已暂停。
          if (a.sortGroup !== b.sortGroup) return a.sortGroup - b.sortGroup;
          if (a.sortGroup === 1) return b.nextSaveDate.localeCompare(a.nextSaveDate);
          return a.nextSaveDate.localeCompare(b.nextSaveDate);
        });
        this.setData({ overview, plans });
        this.showNewUserGuide(plans);
      })
      .catch((err) => {
        wx.showToast({ title: '云端数据加载失败', icon: 'none' });
        console.warn('首页数据加载失败', err);
      })
      .finally(() => {
        wx.hideLoading();
      });
  },

  getActionPeriod(plan, today) {
    // 首页只露出一个最需要处理的期数：优先今天，其次最早未完成期。
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

  showNewUserGuide(plans) {
    // 新用户引导只在本次小程序生命周期内弹一次，避免反复打扰。
    if (guideShown || plans.length) return;
    guideShown = true;
    setTimeout(() => {
      wx.showModal({
        title: '创建第一份心愿',
        content: '点击右下角加号，创建你的第一个存钱心愿。',
        confirmText: '去创建',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) this.goAddPlan();
        },
      });
    }, 500);
  },

  goStatistics() {
    wx.navigateTo({ url: '/pages/statistics/statistics' });
  },

  goAddPlan() {
    wx.navigateTo({ url: '/pages/plan-add/plan-add' });
  },

  goPlanDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/plan-detail/plan-detail?id=' + id });
  },

  handlePlanAction(e) {
    const { id, action, periodIndex } = e.currentTarget.dataset;
    if (action === 'checkin') {
      wx.navigateTo({
        url:
          '/pages/plan-detail/plan-detail?id=' +
          id +
          '&checkin=1&periodIndex=' +
          periodIndex,
      });
      return;
    }
    wx.navigateTo({ url: '/pages/plan-detail/plan-detail?id=' + id });
  },

  /**
   * 分享给朋友
   */
  onShareAppMessage() {
    const { overview, plans } = this.data;
    const planCount = plans.length;
    const savedTotal = overview.savedTotal || 0;

    return {
      title: `我已存入 ¥${savedTotal}，一起养成存钱好习惯吧！`,
      path: '/pages/index/index',
      imageUrl: '', // 使用默认截图
    };
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '每日存钱打卡，养成理财好习惯',
      query: '',
      imageUrl: '',
    };
  },
});
