const dateUtil = require('../../utils/date');
const planUtil = require('../../utils/plan');
const storage = require('../../utils/storage');
const statsUtil = require('../../utils/stats');

Page({
  data: {
    mode: 'month',
    currentKey: '',
    keyOptions: [],
    keyIndex: 0,
    summary: {},
    barData: [],
    lineData: [],
    ringData: [],
    ringTotal: 0,
  },

  onLoad() {
    this.initKeys();
    this.loadStats();
  },

  initKeys() {
    const now = new Date();
    const monthKey = dateUtil.getMonthKey(dateUtil.formatDate(now));
    const yearKey = dateUtil.getYearKey(dateUtil.formatDate(now));
    this.setData({
      currentKey: monthKey,
      keyOptions: [monthKey, yearKey],
      keyIndex: 0,
    });
  },

  loadStats() {
    wx.showLoading({ title: '加载中' });
    storage.getPlans()
      .then((plans) => {
        const summary = statsUtil.getStatsSummary(plans, this.data.mode, this.data.currentKey);
        this.setData({
          summary,
          barData: summary.barData,
          lineData: summary.lineData,
          ringData: summary.ringData,
          ringTotal: summary.ringTotal,
        });
      })
      .catch((err) => {
        wx.showToast({ title: '统计加载失败', icon: 'none' });
        console.warn('统计加载失败', err);
      })
      .finally(() => {
        wx.hideLoading();
      });
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    const now = dateUtil.formatDate(new Date());
    const key = mode === 'month' ? dateUtil.getMonthKey(now) : dateUtil.getYearKey(now);
    this.setData({ mode, currentKey: key, keyIndex: 0, keyOptions: [key] }, () => this.loadStats());
  },

  onKeyChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ keyIndex: idx, currentKey: this.data.keyOptions[idx] }, () => this.loadStats());
  },
});
