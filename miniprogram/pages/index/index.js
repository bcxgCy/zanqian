const storage = require('../../utils/storage');
const planUtil = require('../../utils/plan');
const statsUtil = require('../../utils/stats');
const dateUtil = require('../../utils/date');

const GUIDE_KEY = 'home_new_plan_guide_shown';

Page({
  data: {
    overview: { targetTotal: 0, savedTotal: 0, remaining: 0 },
    plans: [],
    checkin: {
      todayAmount: 0,
      streakDays: 0,
      hasTodayRecord: false,
      todayText: '暂无记录',
    },
  },

  onShow() {
    this.loadData();
    this.showNewUserGuide();
  },

  loadData() {
    const rawPlans = storage.getPlans();
    const today = dateUtil.today();
    const records = statsUtil.getAllRecords(rawPlans);
    const todayAmount = records
      .filter((record) => record.date === today)
      .reduce((sum, record) => sum + record.amount, 0);
    const plans = rawPlans.map((plan) => {
      const summary = planUtil.getPlanSummary(plan);
      return Object.assign({}, plan, summary, {
        planTypeName: planUtil.getPlanTypeName(plan),
      });
    });
    this.setData({
      overview: storage.getOverview(),
      plans,
      checkin: {
        todayAmount,
        streakDays: this.getStreakDays(records),
        hasTodayRecord: todayAmount > 0,
        todayText: todayAmount > 0 ? '已记录 ¥' + todayAmount : '暂无记录',
      },
    });
  },

  getStreakDays(records) {
    const dates = [...new Set(records.map((record) => record.date))].sort().reverse();
    if (!dates.length) return 0;
    let cursor = new Date(dateUtil.today().replace(/-/g, '/'));
    let streak = 0;
    const dateSet = dates.reduce((map, date) => {
      map[date] = true;
      return map;
    }, {});
    while (dateSet[dateUtil.formatDate(cursor)]) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  },

  showNewUserGuide() {
    if (wx.getStorageSync(GUIDE_KEY) || storage.getPlans().length) return;
    wx.setStorageSync(GUIDE_KEY, true);
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
});
