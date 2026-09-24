Page({
  data: {
    activeTab: 'created',
    createdList: [
      { id: 'a1', name: '无线耳机', price: 599, status: '冷静中', reason: '通勤听歌，想提升体验' },
      { id: 'a2', name: '咖啡机', price: 899, status: '投票中', reason: '希望在家自制咖啡' },
      { id: 'a3', name: '球鞋', price: 699, status: '已放弃', reason: '款式好看但非刚需' },
    ],
    reviewedList: [
      { id: 'a2', name: '咖啡机', price: 899, status: '投票中', reason: '希望在家自制咖啡' },
      { id: 'a4', name: '机械键盘', price: 399, status: '已出结果', reason: '想提升办公输入体验' },
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
    const list = this.data.activeTab === 'created' ? this.data.createdList : this.data.reviewedList;
    this.setData({ currentList: list });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/saving-approval-detail/saving-approval-detail?id=' + id });
  },
});
