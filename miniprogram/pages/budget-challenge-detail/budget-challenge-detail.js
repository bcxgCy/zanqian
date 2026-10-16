const budgetChallengeService = require('../../utils/budgetChallengeService');

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTimeKey(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatDateTime(ts) {
  const num = Number(ts);
  if (!Number.isFinite(num) || num <= 0) return '--';
  const date = new Date(num);
  const dateKey = formatDateKey(date);
  const timeKey = formatTimeKey(date);
  return `${dateKey} ${timeKey}`;
}

function splitDateTime(ts) {
  const num = Number(ts);
  if (!Number.isFinite(num) || num <= 0) {
    const now = new Date();
    return { date: formatDateKey(now), time: formatTimeKey(now) };
  }
  const date = new Date(num);
  return {
    date: formatDateKey(date),
    time: formatTimeKey(date),
  };
}

function combineDateTime(dateKey, timeKey) {
  const [y, m, d] = String(dateKey || '').split('-').map((item) => Number(item));
  const [h, mm] = String(timeKey || '').split(':').map((item) => Number(item));
  if (!y || !m || !d) return 0;
  const date = new Date(y, m - 1, d, Number.isFinite(h) ? h : 0, Number.isFinite(mm) ? mm : 0, 0);
  return date.getTime();
}

function toAmountText(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0.00';
  return num.toFixed(2);
}

function hasMoreThanTwoDecimals(value) {
  const text = String(value || '').trim();
  const decimal = text.split('.')[1] || '';
  return decimal.length > 2;
}

function getProgressClass(challenge) {
  const status = challenge.status;
  if (status === 'notStart') return 'is-notstart';
  const total = Number(challenge.totalBudget) || 0;
  const spent = Number(challenge.spentAmount) || 0;
  const progress = Number(challenge.progressPercent) || 0;
  if (spent > total) return 'is-over';
  if (progress >= 80) return 'is-warning';
  return 'is-safe';
}

Page({
  data: {
    challengeId: '',
    loading: false,
    challenge: null,
    records: [],
    showActionMenu: false,
    recordsPaging: {
      hasMore: false,
      nextCursorTs: 0,
      nextCursorId: '',
      loadingMore: false,
    },

    showRecordSheet: false,
    recordMode: 'create',
    editingRecordId: '',
    submittingRecord: false,
    recordForm: {
      amount: '',
      remark: '',
      consumeDate: formatDateKey(new Date()),
      consumeTime: formatTimeKey(new Date()),
    },
  },

  onLoad(options) {
    this.setData({ challengeId: (options && options.id) || '' });
  },

  onShow() {
    this.loadDetail();
  },

  onPullDownRefresh() {
    this.loadDetail().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  noop() {},

  decorateChallenge(challenge) {
    const totalBudget = Number(challenge.totalBudget) || 0;
    const spentAmount = Number(challenge.spentAmount) || 0;
    const remainingBudget = Number(challenge.remainingBudget) || 0;
    const overAmount = Number(challenge.overAmount) || 0;
    const rawProgress = Number(challenge.progressPercentRaw);
    const progressRaw = Number.isFinite(rawProgress)
      ? Math.max(0, rawProgress)
      : Math.max(0, Number(challenge.progressPercent) || 0);
    const progressPercent = Math.min(100, progressRaw);
    const replay = challenge.replay || null;
    const isRunning = challenge.status === 'running';
    let consumeEmptyText = '暂无消费记录';
    if (isRunning) {
      consumeEmptyText = '暂无消费记录，快去录入第一笔吧';
    } else if (challenge.status === 'notStart') {
      consumeEmptyText = '预算还未开始，开始后可录入消费';
    } else if (challenge.status === 'finished' || challenge.status === 'archived') {
      consumeEmptyText = '本次预算周期没有录入消费';
    }

    return Object.assign({}, challenge, {
      totalBudget,
      spentAmount,
      remainingBudget,
      overAmount,
      totalBudgetText: toAmountText(totalBudget),
      spentAmountText: toAmountText(spentAmount),
      remainingBudgetText: toAmountText(Math.max(remainingBudget, 0)),
      overAmountText: toAmountText(Math.max(overAmount, 0)),
      progressPercentText: progressRaw.toFixed(2),
      progressWidth: `${progressPercent}%`,
      progressClass: getProgressClass(challenge),
      timeTagText: challenge.timeTagText || (challenge.leftDays > 0 ? `剩余 ${challenge.leftDays} 天` : ''),
      canAddConsume: isRunning && !!challenge.canAddConsume,
      canEditBudget: !!challenge.canEditBudget,
      canDeleteBudget: !!challenge.canDeleteBudget,
      canArchive: !!challenge.canArchive,
      canManageConsume: !!challenge.canManageConsume,
      hasMoreActions: !!(challenge.canEditBudget || challenge.canArchive || challenge.canDeleteBudget),
      recommendedDailyBudgetText: toAmountText(challenge.recommendedDailyBudget || 0),
      consumeEmptyText,
      replayTitle: replay ? replay.title : '',
      replayDescription: replay ? replay.description : '',
      replayTotalBudgetText: replay ? toAmountText(replay.totalBudget) : '0.00',
      replaySpentAmountText: replay ? toAmountText(replay.spentAmount) : '0.00',
      replayRemainingBudgetText: replay ? toAmountText(replay.remainingBudget) : '0.00',
      replayOverAmountText: replay ? toAmountText(replay.overAmount) : '0.00',
      replayConsumeCount: replay ? (Number(replay.consumeCount) || 0) : 0,
      replayPeriodDays: replay ? (Number(replay.periodDays) || 0) : 0,
    });
  },

  decorateRecord(record) {
    return Object.assign({}, record, {
      amountText: toAmountText(record.amount),
      consumeTimeText: formatDateTime(record.consumeTime),
    });
  },

  applyDetailData(challenge, consumeRecords, paging, append) {
    const decoratedChallenge = this.decorateChallenge(challenge || {});
    const incoming = Array.isArray(consumeRecords) ? consumeRecords.map((item) => this.decorateRecord(item)) : [];
    const records = append ? (this.data.records || []).concat(incoming) : incoming;
    const pagingData = paging || {};

    this.setData({
      challenge: decoratedChallenge,
      records,
      showActionMenu: false,
      recordsPaging: {
        hasMore: !!pagingData.hasMore,
        nextCursorTs: Number(pagingData.nextCursorTs) || 0,
        nextCursorId: pagingData.nextCursorId || '',
        loadingMore: false,
      },
    });
  },

  async loadDetail() {
    const challengeId = this.data.challengeId;
    if (!challengeId) {
      wx.showToast({ title: '预算不存在', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const res = await budgetChallengeService.getBudgetChallengeDetail(challengeId, { pageSize: 20 });
      if (!res.ok || !res.challenge) {
        wx.showToast({ title: res.error || '加载失败', icon: 'none' });
        return;
      }
      this.applyDetailData(res.challenge, res.consumeRecords, res.paging, false);
    } catch (err) {
      wx.showToast({ title: '预算详情加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadMoreRecords() {
    const paging = this.data.recordsPaging || {};
    if (!paging.hasMore || paging.loadingMore) return;
    this.setData({ 'recordsPaging.loadingMore': true });
    try {
      const res = await budgetChallengeService.getBudgetChallengeDetail(this.data.challengeId, {
        pageSize: 20,
        cursorTs: paging.nextCursorTs,
        cursorId: paging.nextCursorId,
      });
      if (!res.ok || !res.challenge) {
        wx.showToast({ title: res.error || '加载失败', icon: 'none' });
        this.setData({ 'recordsPaging.loadingMore': false });
        return;
      }
      this.applyDetailData(res.challenge, res.consumeRecords, res.paging, true);
    } catch (err) {
      this.setData({ 'recordsPaging.loadingMore': false });
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' });
    }
  },

  onOpenActionMenu() {
    const challenge = this.data.challenge || {};
    if (!challenge.hasMoreActions) return;
    this.setData({ showActionMenu: true });
  },

  closeActionMenu() {
    this.setData({ showActionMenu: false });
  },

  onActionMenuTap(e) {
    const action = e.currentTarget.dataset.action;
    this.setData({ showActionMenu: false }, () => {
      if (action === 'edit') this.onEditBudgetTap();
      if (action === 'archive') this.onArchiveTap();
      if (action === 'delete') this.onDeleteBudgetTap();
    });
  },

  onEditBudgetTap() {
    const challenge = this.data.challenge || {};
    if (!challenge.canEditBudget) {
      wx.showToast({ title: '当前状态不可编辑预算', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/budget-challenge-create/budget-challenge-create?id=' + this.data.challengeId });
  },

  onArchiveTap() {
    const challenge = this.data.challenge || {};
    if (!challenge.canArchive) {
      wx.showToast({ title: '当前状态不可归档', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '归档预算',
      content: '归档后会下沉到历史预算中，且无法再次编辑，确认继续吗？',
      success: async (modalRes) => {
        if (!modalRes.confirm) return;
        wx.showLoading({ title: '归档中', mask: true });
        try {
          const res = await budgetChallengeService.archiveBudgetChallenge(this.data.challengeId);
          if (!res.ok || !res.challenge) {
            wx.showToast({ title: res.error || '归档失败', icon: 'none' });
            return;
          }
          this.applyDetailData(res.challenge, res.consumeRecords, res.paging, false);
          wx.showToast({ title: '已归档', icon: 'success' });
        } catch (err) {
          wx.showToast({ title: '归档失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },

  onDeleteBudgetTap() {
    const challenge = this.data.challenge || {};
    if (!challenge.canDeleteBudget) {
      wx.showToast({ title: '当前状态不可删除预算', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '删除预算',
      content: '删除后预算与消费记录都将清空，且无法恢复，确认删除吗？',
      confirmColor: '#D65A5A',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        try {
          const ret = await budgetChallengeService.deleteBudgetChallenge(this.data.challengeId);
          if (!ret.ok) {
            wx.showToast({ title: ret.error || '删除失败', icon: 'none' });
            return;
          }
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 320);
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },

  onOpenAddRecordTap() {
    const challenge = this.data.challenge || {};
    if (!challenge.canAddConsume) {
      wx.showToast({ title: '当前状态不可录入消费', icon: 'none' });
      return;
    }

    const now = new Date();
    this.setData({
      showRecordSheet: true,
      recordMode: 'create',
      editingRecordId: '',
      recordForm: {
        amount: '',
        remark: '',
        consumeDate: formatDateKey(now),
        consumeTime: formatTimeKey(now),
      },
    });
  },

  onEditRecordTap(e) {
    const challenge = this.data.challenge || {};
    if (!challenge.canManageConsume) {
      wx.showToast({ title: '当前状态不可编辑消费记录', icon: 'none' });
      return;
    }

    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const target = (this.data.records || []).find((item) => item.id === id);
    if (!target) return;

    const split = splitDateTime(target.consumeTime);

    this.setData({
      showRecordSheet: true,
      recordMode: 'edit',
      editingRecordId: id,
      recordForm: {
        amount: String(target.amountText || target.amount || ''),
        remark: target.remark || '',
        consumeDate: split.date,
        consumeTime: split.time,
      },
    });
  },

  onDeleteRecordTap(e) {
    const challenge = this.data.challenge || {};
    if (!challenge.canManageConsume) {
      wx.showToast({ title: '当前状态不可删除消费记录', icon: 'none' });
      return;
    }

    const id = e.currentTarget.dataset.id;
    if (!id) return;

    wx.showModal({
      title: '删除消费记录',
      content: '确认删除这笔消费记录吗？删除后不可恢复。',
      confirmColor: '#D65A5A',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        try {
          const ret = await budgetChallengeService.deleteConsumeRecord(id);
          if (!ret.ok || !ret.challenge) {
            wx.showToast({ title: ret.error || '删除失败', icon: 'none' });
            return;
          }
          this.applyDetailData(ret.challenge, ret.consumeRecords, ret.paging, false);
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },

  closeRecordSheet() {
    if (this.data.submittingRecord) return;
    this.setData({ showRecordSheet: false });
  },

  onRecordInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`recordForm.${field}`]: e.detail.value });
  },

  onRecordDateChange(e) {
    this.setData({ 'recordForm.consumeDate': e.detail.value });
  },

  onRecordTimeChange(e) {
    this.setData({ 'recordForm.consumeTime': e.detail.value });
  },

  async submitRecord() {
    if (this.data.submittingRecord) return;

    const amount = Number(this.data.recordForm.amount);
    const remark = String(this.data.recordForm.remark || '').trim();
    const consumeDate = this.data.recordForm.consumeDate;
    const consumeTime = this.data.recordForm.consumeTime;

    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入有效消费金额', icon: 'none' });
      return;
    }

    if (hasMoreThanTwoDecimals(this.data.recordForm.amount)) {
      wx.showToast({ title: '金额最多保留两位小数', icon: 'none' });
      return;
    }

    if (remark.length > 30) {
      wx.showToast({ title: '消费备注最多30字', icon: 'none' });
      return;
    }

    if (!consumeDate || !consumeTime) {
      wx.showToast({ title: '请选择消费时间', icon: 'none' });
      return;
    }

    const consumeTs = combineDateTime(consumeDate, consumeTime);
    if (!consumeTs) {
      wx.showToast({ title: '消费时间不合法', icon: 'none' });
      return;
    }

    const payload = {
      amount,
      remark,
      consumeTime: consumeTs,
    };

    this.setData({ submittingRecord: true });
    wx.showLoading({ title: this.data.recordMode === 'edit' ? '保存中' : '提交中', mask: true });

    try {
      const isEdit = this.data.recordMode === 'edit';
      const res = isEdit
        ? await budgetChallengeService.updateConsumeRecord(this.data.editingRecordId, payload)
        : await budgetChallengeService.addConsumeRecord(this.data.challengeId, payload);

      if (!res.ok || !res.challenge) {
        wx.showToast({ title: res.error || (isEdit ? '保存失败' : '录入失败'), icon: 'none' });
        return;
      }

      this.applyDetailData(res.challenge, res.consumeRecords, res.paging, false);
      this.setData({ showRecordSheet: false });
      wx.showToast({ title: isEdit ? '已保存' : '已录入', icon: 'success' });

      if (res.overflowTriggered) {
        wx.showModal({
          title: '⚠️ 预算已超额',
          content: `本次消费后，【${res.challengeName || '预算挑战'}】已超额！注意克制消费`,
          showCancel: false,
          confirmText: '我知道了',
        });
      }
    } catch (err) {
      wx.showToast({ title: '操作失败，请稍后重试', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ submittingRecord: false });
    }
  },

  onShareAppMessage() {
    const challenge = this.data.challenge || {};
    const name = challenge.name || '预算挑战';
    const budget = Number(challenge.totalBudget) || 0;
    const spent = Number(challenge.spentAmount) || 0;
    const remaining = Number(challenge.remainingBudget) || 0;
    const title = budget > 0
      ? `${name}预算¥${budget.toFixed(2)}，已花¥${spent.toFixed(2)}，剩余¥${remaining.toFixed(2)}，这个小程序真好用！`
      : `我在用这个小程序做预算挑战，记账控支特别方便！`;
    return {
      title,
      path: '/pages/budget-challenge/budget-challenge',
      imageUrl: '',
    };
  },

  onShareTimeline() {
    const challenge = this.data.challenge || {};
    const spent = Number(challenge.spentAmount) || 0;
    return {
      title: `预算挑战已记录支出¥${spent.toFixed(2)}，这个小程序超好用！`,
      query: '',
      imageUrl: '',
    };
  },
});
