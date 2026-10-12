const budgetChallengeService = require('../../utils/budgetChallengeService');

function toAmountText(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0.00';
  return num.toFixed(2);
}

function getProgressClass(item) {
  const status = item.status;
  if (status === 'notStart') return 'is-notstart';
  const total = Number(item.totalBudget) || 0;
  const spent = Number(item.spentAmount) || 0;
  const progress = Number(item.progressPercent) || 0;
  if (spent > total) return 'is-over';
  if (progress >= 80) return 'is-warning';
  return 'is-safe';
}

Page({
  data: {
    activeTab: 'ongoing',
    enableBudgetChallenge: true,
    ongoingList: [],
    historyList: [],
    currentList: [],
    summary: {
      ongoingBudgetChallengeCount: 0,
      totalBudgetChallengeCount: 0,
    },
  },

  onLoad(options) {
    const tab = options && options.tab;
    if (tab === 'history') {
      this.setData({ activeTab: 'history' });
    }
  },

  onShow() {
    this.loadBudgetChallenges();
  },

  onPullDownRefresh() {
    this.loadBudgetChallenges().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab }, () => this.refreshList());
  },

  async loadBudgetChallenges() {
    try {
      const res = await budgetChallengeService.getBudgetChallenges();
      if (!res.ok) {
        wx.showToast({ title: res.error || '加载失败', icon: 'none' });
        return;
      }

      const enableBudgetChallenge = res.enableBudgetChallenge !== false;
      if (!enableBudgetChallenge) {
        this.setData({
          enableBudgetChallenge: false,
          ongoingList: [],
          historyList: [],
          currentList: [],
          summary: {
            ongoingBudgetChallengeCount: 0,
            totalBudgetChallengeCount: 0,
          },
        });
        return;
      }

      const ongoingList = Array.isArray(res.ongoingList) ? res.ongoingList.map((item) => this.decorateItem(item)) : [];
      const historyList = Array.isArray(res.historyList) ? res.historyList.map((item) => this.decorateItem(item)) : [];

      this.setData({
        enableBudgetChallenge: true,
        ongoingList,
        historyList,
        summary: {
          ongoingBudgetChallengeCount: Number(res.summary && res.summary.ongoingBudgetChallengeCount) || ongoingList.length,
          totalBudgetChallengeCount: Number(res.summary && res.summary.totalBudgetChallengeCount) || (ongoingList.length + historyList.length),
        },
      }, () => this.refreshList());
    } catch (err) {
      wx.showToast({ title: '预算挑战加载失败', icon: 'none' });
    }
  },

  refreshList() {
    const currentList = this.data.activeTab === 'ongoing' ? this.data.ongoingList : this.data.historyList;
    this.setData({ currentList });
  },

  decorateItem(item) {
    const totalBudget = Number(item.totalBudget) || 0;
    const spentAmount = Number(item.spentAmount) || 0;
    const remainingBudget = Number(item.remainingBudget) || 0;
    const overAmount = Number(item.overAmount) || 0;
    const consumeCount = Number(item.consumeCount) || 0;

    const rawProgress = Number(item.progressPercentRaw);
    const progressRaw = Number.isFinite(rawProgress)
      ? Math.max(0, rawProgress)
      : Math.max(0, Number(item.progressPercent) || 0);
    const progressPercent = Math.min(100, progressRaw);

    return Object.assign({}, item, {
      totalBudget,
      spentAmount,
      remainingBudget,
      overAmount,
      consumeCount,
      totalBudgetText: toAmountText(totalBudget),
      spentAmountText: toAmountText(spentAmount),
      remainingBudgetText: toAmountText(Math.max(remainingBudget, 0)),
      overAmountText: toAmountText(Math.max(overAmount, 0)),
      progressPercentText: progressRaw.toFixed(2),
      progressWidth: `${progressPercent}%`,
      progressClass: getProgressClass(item),
      timeTagText: item.timeTagText || (item.leftDays > 0 ? `剩余 ${item.leftDays} 天` : ''),
    });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/budget-challenge-detail/budget-challenge-detail?id=' + id });
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/budget-challenge-create/budget-challenge-create' });
  },

  showArchiveList() {
    if (this.data.activeTab === 'history') return;
    this.setData({ activeTab: 'history' }, () => this.refreshList());
  },
});
