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
    const mine = !!e.currentTarget.dataset.mine;
    if (!id) return;
    if (type === 'challenge' && mine) {
      wx.navigateTo({ url: '/pages/saving-challenge-detail/saving-challenge-detail?id=' + id });
      return;
    }
    wx.showToast({ title: '挑战可直接点赞互动', icon: 'none' });
  },
});
