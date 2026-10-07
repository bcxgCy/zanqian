const savingChallengeService = require('../../utils/savingChallengeService');

Page({
  data: {
    activeTab: 'ongoing',
    ongoingList: [],
    historyList: [],
    currentList: [],
  },

  onLoad() {
    this.loadChallenges();
  },

  onShow() {
    this.loadChallenges();
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab }, () => this.refreshList());
  },

  async loadChallenges() {
    try {
      const res = await savingChallengeService.getChallenges();
      if (!res.ok) {
        wx.showToast({ title: res.error || '加载失败', icon: 'none' });
        return;
      }
      this.setData({
        ongoingList: Array.isArray(res.ongoingList) ? res.ongoingList : [],
        historyList: Array.isArray(res.historyList) ? res.historyList : [],
      }, () => this.refreshList());
    } catch (err) {
      wx.showToast({ title: '挑战列表加载失败', icon: 'none' });
    }
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
