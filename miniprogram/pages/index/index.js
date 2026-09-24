const storage = require('../../utils/storage');
const planUtil = require('../../utils/plan');
const dateUtil = require('../../utils/date');
const quizUtil = require('../../utils/savingPersonaQuiz');
const statsUtil = require('../../utils/stats');
const money = require('../../utils/money');

let guideShown = false;
const QUIZ_POPUP_FREQ_KEY = 'saving_quiz_popup_freq_v1';
const QUIZ_DONE_KEY = 'saving_quiz_done_v1';
const QUIZ_POPUP_ENABLED = true;

Page({
  data: {
    overview: { targetTotal: 0, savedTotal: 0, remaining: 0 },
    monthIncreaseAmount: '0.00',
    streakDays: 0,
    selectedMonthKey: '',
    selectedMonthLabel: '',
    selectedMonthPickerValue: '',
    monthOverview: { targetAmount: '0.00', savedAmount: '0.00', ratio: 0 },
    allPlans: [],
    plans: [],
    showQuizPopup: false,
    quizPopupImage: quizUtil.QUIZ_POPUP_IMAGE,
  },

  onShow() {
    this.loadData();
    this.tryShowQuizPopup();
  },

  loadData() {
    wx.showLoading({ title: '加载中' });
    storage.getPlans()
      .then((rawPlans) => {
        const currentMonthKey = this.getCurrentMonthKey();
        const overview = storage.getOverviewFromPlans(rawPlans);
        const monthIncreaseAmount = this.getMonthIncreaseAmount(rawPlans);
        const streakDays = this.getMaxConsecutiveDays(rawPlans);
        const monthOverview = this.getMonthOverview(rawPlans, currentMonthKey);
        const today = dateUtil.today();
        const allPlans = rawPlans.map((plan) => {
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
        const plans = this.pickRecentCheckinPlans(allPlans, today);
        this.setData({
          overview,
          plans,
          allPlans,
          monthIncreaseAmount,
          streakDays,
          selectedMonthKey: currentMonthKey,
          selectedMonthLabel: this.formatMonthLabel(currentMonthKey),
          selectedMonthPickerValue: `${currentMonthKey}-01`,
          monthOverview,
        });
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

  getMonthIncreaseAmount(plans) {
    const records = statsUtil.getAllRecords(plans);
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${dateUtil.pad(today.getMonth() + 1)}`;
    const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${dateUtil.pad(lastMonthDate.getMonth() + 1)}`;

    const currentTotal = money.sum(records.filter((item) => item.date.slice(0, 7) === currentMonth), (item) => item.amount);
    const lastTotal = money.sum(records.filter((item) => item.date.slice(0, 7) === lastMonth), (item) => item.amount);
    const increase = money.max(0, money.sub(currentTotal, lastTotal));
    return increase.toFixed(2);
  },

  getMaxConsecutiveDays(plans) {
    return plans.reduce((maxDays, plan) => {
      const days = statsUtil.getConsecutiveDays(plan);
      return Math.max(maxDays, days);
    }, 0);
  },

  getCurrentMonthKey() {
    const current = new Date();
    return `${current.getFullYear()}-${dateUtil.pad(current.getMonth() + 1)}`;
  },

  pickRecentCheckinPlans(plans, today) {
    const actionablePlans = plans.filter((plan) => {
      if (!plan || !plan.nextSaveDate) return false;
      const daysToCheckin = dateUtil.diffDays(today, plan.nextSaveDate);
      if (daysToCheckin < 0) return true;
      return daysToCheckin <= 30;
    });

    if (actionablePlans.length) return actionablePlans;

    const fallbackPlans = plans.filter((plan) => plan && plan.nextSaveDate);
    if (!fallbackPlans.length) return [];

    fallbackPlans.sort((a, b) => {
      const diffA = dateUtil.diffDays(today, a.nextSaveDate);
      const diffB = dateUtil.diffDays(today, b.nextSaveDate);
      const absA = Math.abs(diffA);
      const absB = Math.abs(diffB);
      if (absA !== absB) return absA - absB;
      const aIsFuture = diffA >= 0 ? 0 : 1;
      const bIsFuture = diffB >= 0 ? 0 : 1;
      if (aIsFuture !== bIsFuture) return aIsFuture - bIsFuture;
      return a.nextSaveDate.localeCompare(b.nextSaveDate);
    });

    return [fallbackPlans[0]];
  },

  formatMonthLabel(monthKey) {
    return monthKey.replace('-', '年') + '月';
  },

  getMonthOverview(plans, monthKey) {
    let targetAmount = 0;
    let savedAmount = 0;

    plans.forEach((plan) => {
      (plan.periods || []).forEach((period) => {
        if (!period.date || period.date.slice(0, 7) !== monthKey) return;
        targetAmount = money.add(targetAmount, period.expectedAmount || 0);
        savedAmount = money.add(savedAmount, period.savedAmount || 0);
      });
    });

    const ratio = money.gt(targetAmount, 0)
      ? Math.round((Number(savedAmount) / Number(targetAmount)) * 100)
      : 0;

    return {
      targetAmount: money.toMoney(targetAmount).toFixed(2),
      savedAmount: money.toMoney(savedAmount).toFixed(2),
      ratio,
    };
  },

  handleMonthChange(e) {
    const pickerValue = (e && e.detail && e.detail.value) || '';
    const monthKey = pickerValue.slice(0, 7);
    const plans = this.data.allPlans || [];
    const monthOverview = this.getMonthOverview(plans, monthKey);
    this.setData({
      selectedMonthKey: monthKey,
      selectedMonthLabel: this.formatMonthLabel(monthKey),
      selectedMonthPickerValue: pickerValue,
      monthOverview,
    });
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

  tryShowQuizPopup() {
    if (!QUIZ_POPUP_ENABLED) return;
    const lastShowAt = Number(wx.getStorageSync(QUIZ_POPUP_FREQ_KEY) || 0);
    const hasCompletedQuiz = !!wx.getStorageSync(QUIZ_DONE_KEY);
    const intervalDays = hasCompletedQuiz ? 15 : 1;
    const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
    if (lastShowAt && Date.now() - lastShowAt < intervalMs) return;

    setTimeout(() => {
      this.setData({ showQuizPopup: true });
      wx.setStorageSync(QUIZ_POPUP_FREQ_KEY, Date.now());
    }, 350);
  },

  closeQuizPopup() {
    this.setData({ showQuizPopup: false });
  },

  openSavingQuiz() {
    this.setData({ showQuizPopup: false });
    wx.navigateTo({ url: '/pages/saving-quiz/saving-quiz' });
  },

  preventTouchMove() {},

  goStatistics() {
    wx.navigateTo({ url: '/pages/statistics/statistics' });
  },

  goReminderSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  goCalculator() {
    wx.navigateTo({ url: '/pages/calculator/calculator' });
  },

  goAddPlan() {
    wx.navigateTo({ url: '/pages/plan-add/plan-add' });
  },

  goAllPlans() {
    wx.navigateTo({ url: '/pages/all-plans/all-plans' });
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
