const savingChallengeService = require('../../utils/savingChallengeService');

function buildShareText(data) {
  const ongoing = Array.isArray(data.ongoingList) ? data.ongoingList.length : 0;
  const history = Array.isArray(data.historyList) ? data.historyList.length : 0;
  const totalSaved = (data.ongoingList || []).concat(data.historyList || [])
    .reduce((sum, item) => sum + (Number(item.savedAmount) || 0), 0);
  if (totalSaved > 0) {
    return `我在省钱挑战已累计省下¥${totalSaved.toFixed(2)}，这个小程序太好用了，来一起打卡！`;
  }
  return `我在这个小程序开了${ongoing + history}个省钱挑战，真的好用，来一起坚持打卡！`;
}

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

  goStats() {
    wx.navigateTo({ url: '/pages/saving-challenge-stats/saving-challenge-stats' });
  },

  onShareAppMessage() {
    return {
      title: buildShareText(this.data),
      path: '/pages/saving-challenge/saving-challenge',
      imageUrl: '',
    };
  },

  onShareTimeline() {
    return {
      title: buildShareText(this.data),
      query: '',
      imageUrl: '',
    };
  },
});
