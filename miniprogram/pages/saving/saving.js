const savingHomeService = require('../../utils/savingHomeService');
const coolingService = require('../../utils/coolingService');

function formatCountdown(remainMs) {
  if (!(remainMs > 0)) return '已到期';
  const totalSeconds = Math.floor(remainMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const pad = (num) => String(num).padStart(2, '0');
  return pad(hours) + ':' + pad(minutes);
}

Page({
  data: {
    budgetModuleEnabled: true,
    summary: {
      challengeSaved: '0.00',
      coolingSaved: '0.00',
      budgetSaved: '0.00',
      totalSaved: '0.00',
      ongoingChallengeCount: 0,
      ongoingBudgetChallengeCount: 0,
    },
    ongoingChallenges: [],
    ongoingBudgetChallenges: [],
    coolingSummary: {
      activeCount: 0,
      pendingCount: 0,
      savedTotalText: '0.00',
    },
    coolingRecords: [],
    coolingMoreCount: 0,
  },

  onShow() {
    this.loadApprovalHomeData();
    this.startCoolingTimer();
  },

  onHide() {
    this.stopCoolingTimer();
  },

  onUnload() {
    this.stopCoolingTimer();
  },

  onPullDownRefresh() {
    this.loadApprovalHomeData().finally(() => {
      wx.stopPullDownRefresh();
      wx.showToast({ title: '已更新', icon: 'success' });
    });
  },

  async loadApprovalHomeData() {
    try {
      const [homeRes, coolingRes] = await Promise.all([
        savingHomeService.getHomeData(),
        coolingService.getRecords().catch(() => null),
      ]);
      if (!homeRes.ok) {
        wx.showToast({ title: homeRes.error || '加载失败', icon: 'none' });
        return;
      }
      const remoteSummary = homeRes.summary || {};
      const budgetModuleEnabled = homeRes.enableBudgetChallenge !== false;
      const summary = Object.assign({}, this.data.summary, {
        challengeSaved: this.formatAmount(remoteSummary.challengeSaved || 0),
        coolingSaved: this.formatAmount(remoteSummary.coolingSaved || 0),
        budgetSaved: this.formatAmount(remoteSummary.budgetSaved || 0),
        totalSaved: this.formatAmount(remoteSummary.totalSaved || 0),
        ongoingChallengeCount: remoteSummary.ongoingChallengeCount || 0,
        ongoingBudgetChallengeCount: budgetModuleEnabled ? (remoteSummary.ongoingBudgetChallengeCount || 0) : 0,
      });

      const budgetCards = budgetModuleEnabled && Array.isArray(homeRes.ongoingBudgetChallenges)
        ? homeRes.ongoingBudgetChallenges.map((item) => {
            const spentAmount = Number(item.spentAmount) || 0;
            const totalBudget = Number(item.totalBudget) || 0;
            const remainingBudget = Number(item.remainingBudget) || 0;
            const overAmount = Number(item.overAmount) || 0;
            return {
              id: item.id,
              name: item.name || '预算挑战',
              status: item.status,
              statusText: item.statusText || '进行中',
              spentAmount,
              totalBudget,
              remainingBudget,
              overAmount,
              leftDays: Number(item.leftDays) || 0,
              spentAmountText: this.formatAmount(spentAmount),
              totalBudgetText: this.formatAmount(totalBudget),
              remainingBudgetText: this.formatAmount(Math.max(remainingBudget, 0)),
              overAmountText: this.formatAmount(Math.max(overAmount, 0)),
            };
          })
        : [];

      this.setData({
        budgetModuleEnabled,
        summary,
        ongoingChallenges: Array.isArray(homeRes.ongoingChallenges) ? homeRes.ongoingChallenges : [],
        ongoingBudgetChallenges: budgetCards,
      });

      if (coolingRes && coolingRes.ok) {
        this.applyCoolingData(coolingRes.data || {});
      }
    } catch (err) {
      wx.showToast({ title: '省钱数据加载失败', icon: 'none' });
    }
  },

  applyCoolingData(data) {
    const now = Date.now();
    const active = Array.isArray(data.active) ? data.active : [];
    const decorated = active.slice(0, 3).map((item) => {
      const status = String(item.status || 'cooling');
      const endTime = Number(item.endTime) || 0;
      const isPending = status === 'pendingDecision';
      const price = Number(item.price) || 0;
      return {
        id: item.id,
        goodsName: item.goodsName || '想买的东西',
        status,
        priceText: this.formatAmount(price),
        statusText: isPending ? '待决策' : '三思中',
        isPending,
        endTime,
        countdownText: status === 'cooling' ? formatCountdown(endTime - now) : '已到期',
      };
    });
    const stats = data.stats || {};
    const activeCount = stats.activeCount || active.length;
    this.setData({
      coolingSummary: {
        activeCount,
        pendingCount: active.filter((item) => item.status === 'pendingDecision').length,
        savedTotalText: this.formatAmount(stats.savedTotal || 0),
      },
      coolingRecords: decorated,
      coolingMoreCount: Math.max(0, activeCount - decorated.length),
    });
  },

  startCoolingTimer() {
    if (this.coolingTimer) return;
    this.coolingTimer = setInterval(() => this.tickCoolingRecords(), 60000);
  },

  stopCoolingTimer() {
    if (this.coolingTimer) {
      clearInterval(this.coolingTimer);
      this.coolingTimer = null;
    }
  },

  tickCoolingRecords() {
    const now = Date.now();
    const records = (this.data.coolingRecords || []).map((item) => {
      if (item.status !== 'cooling') return item;
      return Object.assign({}, item, {
        countdownText: formatCountdown(item.endTime - now),
      });
    });
    this.setData({ coolingRecords });
  },

  formatAmount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '0.00';
    return amount.toFixed(2);
  },

  goChallengeList() {
    wx.navigateTo({ url: '/pages/saving-challenge/saving-challenge' });
  },

  goChallengeDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/saving-challenge-detail/saving-challenge-detail?id=' + id });
  },

  goChallengeCreate() {
    wx.navigateTo({ url: '/pages/saving-challenge-create/saving-challenge-create' });
  },

  goChallengeStats() {
    wx.navigateTo({ url: '/pages/saving-challenge-stats/saving-challenge-stats' });
  },

  goBudgetChallengeList() {
    if (!this.data.budgetModuleEnabled) {
      wx.showToast({ title: '预算挑战功能暂未开放', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/budget-challenge/budget-challenge' });
  },

  goBudgetChallengeCreate() {
    if (!this.data.budgetModuleEnabled) {
      wx.showToast({ title: '预算挑战功能暂未开放', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/budget-challenge-create/budget-challenge-create' });
  },

  goCooling() {
    wx.navigateTo({ url: '/pages/consumption-cooling/index' });
  },

  goBudgetChallengeDetail(e) {
    if (!this.data.budgetModuleEnabled) return;
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/budget-challenge-detail/budget-challenge-detail?id=' + id });
  },

  onPlaceholderTap() {
    wx.showToast({ title: '功能即将上线', icon: 'none' });
  },
});
