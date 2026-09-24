Page({
  data: {
    summary: {
      challengeSaved: 45,
      approvalSaved: 83,
      totalSaved: 128,
      ongoingChallengeCount: 3,
      pendingApprovalCount: 2,
    },
    ongoingApprovals: [
      { id: 'a1', itemName: '无线耳机', price: 159, statusText: '冷静期中', remainingHours: 20 },
      { id: 'a2', itemName: '机械键盘', price: 399, statusText: '投票中', remainingHours: 12 },
    ],
    ongoingChallenges: [
      { id: 'c1', name: '7天不喝奶茶', leftDays: 4, streakDays: 3 },
      { id: 'c2', name: '7天不打车', leftDays: 5, streakDays: 2 },
    ],
  },

  onPullDownRefresh() {
    setTimeout(() => {
      wx.stopPullDownRefresh();
      wx.showToast({ title: '已更新', icon: 'success' });
    }, 300);
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
