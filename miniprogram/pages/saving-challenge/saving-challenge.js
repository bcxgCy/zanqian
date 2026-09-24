Page({
  data: {
    activeTab: 'ongoing',
    ongoingList: [
      { id: 'c1', name: '7天不点外卖', streakDays: 3, leftDays: 4, dailyAmount: 32, savedAmount: 96 },
      { id: 'c2', name: '7天不打车', streakDays: 2, leftDays: 5, dailyAmount: 22, savedAmount: 44 },
    ],
    historyList: [
      { id: 'h1', name: '7天不喝奶茶', periodDays: 7, resultText: '挑战成功', dailyAmount: 18, savedAmount: 126 },
      { id: 'h2', name: '30天不买非必需品', periodDays: 30, resultText: '挑战中断', dailyAmount: 50, savedAmount: 450 },
    ],
    currentList: [],
  },

  onLoad() {
    this.refreshList();
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab }, () => this.refreshList());
  },

  refreshList() {
    const currentList = this.data.activeTab === 'ongoing' ? this.data.ongoingList : this.data.historyList;
    this.setData({ currentList });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/saving-challenge-detail/saving-challenge-detail?id=' + id });
  },
});
