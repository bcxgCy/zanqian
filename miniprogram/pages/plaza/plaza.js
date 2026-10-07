const savingPlazaService = require('../../utils/savingPlazaService');

Page({
  data: {
    feedList: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    loaded: false,
  },

  decorateFeedItems(list) {
    const source = Array.isArray(list) ? list : [];
    return source.map((item) => {
      if (!item || !item.type) return item;

      if (item.type === 'approval') {
        const voteCount = Number(item.voteCount || 0);
        const targetVotes = Math.max(1, Number(item.targetVotes || 1));
        const progress = Math.min(1, voteCount / targetVotes);
        return Object.assign({}, item, {
          progress,
          progressText: `审批进度 ${voteCount}/${targetVotes}`,
        });
      }

      const totalDays = Math.max(1, Number(item.periodDays || 1));
      const checkedDays = Number(item.checkedDays || 0);
      const progress = Math.min(1, checkedDays / totalDays);
      return Object.assign({}, item, {
        progress,
        progressText: `挑战进度 ${checkedDays}/${totalDays}天`,
      });
    });
  },

  onLoad() {
    this.reload();
  },

  onPullDownRefresh() {
    this.reload().then((ok) => {
      if (ok) {
        wx.showToast({ title: '刷新成功', icon: 'success' });
      }
    }).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.loadMore();
  },

  async reload() {
    if (this.data.loading) return false;
    this.setData({ loading: true });

    try {
      const res = await savingPlazaService.getPlazaFeed(1, this.data.pageSize);
      if (!res.ok) {
        wx.showToast({ title: res.error || '加载失败', icon: 'none' });
        return false;
      }
      const nextItems = Array.isArray(res.list) ? res.list : [];
      const decorated = this.decorateFeedItems(nextItems);
      this.setData({
        feedList: decorated,
        page: 2,
        hasMore: !!res.hasMore,
        loaded: true,
      });
      return true;
    } catch (err) {
      wx.showToast({ title: '广场加载失败', icon: 'none' });
      return false;
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadMore() {
    if (this.data.loading || !this.data.hasMore) return;
    this.setData({ loading: true });

    try {
      const res = await savingPlazaService.getPlazaFeed(this.data.page, this.data.pageSize);
      if (!res.ok) {
        wx.showToast({ title: res.error || '加载失败', icon: 'none' });
        return;
      }

      const nextItems = Array.isArray(res.list) ? res.list : [];
      const decorated = this.decorateFeedItems(nextItems);

      this.setData({
        feedList: this.data.feedList.concat(decorated),
        page: this.data.page + 1,
        hasMore: !!res.hasMore,
        loaded: true,
      });
      return true;
    } catch (err) {
      wx.showToast({ title: '广场加载失败', icon: 'none' });
      return false;
    } finally {
      this.setData({ loading: false });
    }
  },

  goApproval(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/saving-approval-detail/saving-approval-detail?id=' + id,
      events: {
        approvalUpdated: (payload) => {
          this.applyApprovalUpdate(payload);
        },
      },
    });
  },

  applyApprovalUpdate(payload) {
    if (!payload || !payload.id) return;
    const index = (this.data.feedList || []).findIndex((item) => item.id === payload.id && item.type === 'approval');
    if (index < 0) return;

    const list = this.data.feedList.slice();
    const current = list[index];
    const nextVoteCount = typeof payload.voteCount === 'number' ? payload.voteCount : current.voteCount;
    const targetVotes = Math.max(1, Number(current.targetVotes || 1));
    list[index] = Object.assign({}, current, {
      statusText: payload.statusText || current.statusText,
      voteCount: nextVoteCount,
      progress: Math.min(1, Number(nextVoteCount || 0) / targetVotes),
      progressText: `审批进度 ${Number(nextVoteCount || 0)}/${targetVotes}`,
      updatedAt: payload.updatedAt || current.updatedAt,
    });
    this.setData({ feedList: list });
  },

  async toggleLike(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;

    const list = this.data.feedList || [];
    const index = list.findIndex((item) => item.id === id && item.type === 'challenge');
    if (index < 0) return;
    const current = list[index];
    if (current.mine) return;

    const optimistic = Object.assign({}, current, {
      liked: !current.liked,
      likeCount: Math.max(0, Number(current.likeCount || 0) + (current.liked ? -1 : 1)),
    });
    const nextList = list.slice();
    nextList[index] = optimistic;
    this.setData({ feedList: nextList });

    try {
      const res = await savingPlazaService.toggleChallengeLike(id);
      if (!res.ok) {
        wx.showToast({ title: res.error || '操作失败', icon: 'none' });
        const rollbackList = this.data.feedList.slice();
        rollbackList[index] = current;
        this.setData({ feedList: rollbackList });
        return;
      }

      if (typeof res.liked === 'boolean') {
        const confirmList = this.data.feedList.slice();
        const confirmed = Object.assign({}, confirmList[index], {
          liked: res.liked,
        });
        confirmList[index] = confirmed;
        this.setData({ feedList: confirmList });
      }
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
      const rollbackList = this.data.feedList.slice();
      rollbackList[index] = current;
      this.setData({ feedList: rollbackList });
    }
  },

  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    const type = e.currentTarget.dataset.type;
    if (!id) return;
    if (type === 'approval') {
      wx.navigateTo({ url: '/pages/saving-approval-detail/saving-approval-detail?id=' + id });
      return;
    }
    wx.showToast({ title: '挑战可直接点赞互动', icon: 'none' });
  },
});
