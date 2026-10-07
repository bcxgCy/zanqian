const savingHomeService = require('../../utils/savingHomeService');

Page({
  data: {
    summary: {
      challengeSaved: 0,
      approvalSaved: 0,
      totalSaved: 0,
      ongoingChallengeCount: 0,
      pendingApprovalCount: 0,
    },
    ongoingApprovals: [],
    ongoingChallenges: [],
  },

  onShow() {
    this.loadApprovalHomeData();
  },

  onPullDownRefresh() {
    this.loadApprovalHomeData().finally(() => {
      wx.stopPullDownRefresh();
      wx.showToast({ title: '已更新', icon: 'success' });
    });
  },

  async loadApprovalHomeData() {
    try {
      const homeRes = await savingHomeService.getHomeData();
      if (!homeRes.ok) {
        wx.showToast({ title: homeRes.error || '加载失败', icon: 'none' });
        return;
      }
      const remoteSummary = homeRes.summary || {};
      const summary = Object.assign({}, this.data.summary, {
        approvalSaved: remoteSummary.approvalSaved || 0,
        pendingApprovalCount: remoteSummary.pendingApprovalCount || 0,
        challengeSaved: remoteSummary.challengeSaved || 0,
        ongoingChallengeCount: remoteSummary.ongoingChallengeCount || 0,
      });
      summary.totalSaved = (summary.challengeSaved || 0) + (summary.approvalSaved || 0);
      this.setData({
        summary,
        ongoingApprovals: Array.isArray(homeRes.ongoingApprovals) ? homeRes.ongoingApprovals : [],
        ongoingChallenges: Array.isArray(homeRes.ongoingChallenges) ? homeRes.ongoingChallenges : [],
      });
    } catch (err) {
      wx.showToast({ title: '省钱数据加载失败', icon: 'none' });
    }
  },

  goApprovalList() {
    wx.navigateTo({ url: '/pages/saving-approval/saving-approval' });
  },

  goApprovalDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/saving-approval-detail/saving-approval-detail?id=' + id });
  },

  goApprovalCreate() {
    wx.navigateTo({ url: '/pages/saving-approval-create/saving-approval-create' });
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
});
