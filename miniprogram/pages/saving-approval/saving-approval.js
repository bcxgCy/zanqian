const savingApprovalService = require('../../utils/savingApprovalService');

Page({
  data: {
    activeTab: 'created',
    createdList: [],
    reviewedList: [],
    currentList: [],
  },

  onLoad() {
    this.loadApprovals();
  },

  onShow() {
    this.loadApprovals();
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab }, () => this.refreshList());
  },

  async loadApprovals() {
    try {
      const res = await savingApprovalService.getApprovals();
      if (!res.ok) {
        wx.showToast({ title: res.error || '加载失败', icon: 'none' });
        return;
      }
      this.setData({
        createdList: Array.isArray(res.createdList) ? res.createdList : [],
        reviewedList: Array.isArray(res.reviewedList) ? res.reviewedList : [],
      }, () => this.refreshList());
    } catch (err) {
      wx.showToast({ title: '审批列表加载失败', icon: 'none' });
    }
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
