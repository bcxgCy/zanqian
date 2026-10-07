const savingApprovalService = require('../../utils/savingApprovalService');

const SHARE_POSTER = 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/other/shenpi-share.jpg';

Page({
  data: {
    detail: null,
    approvalId: '',
    loading: false,
    reviewForm: {
      vote: '',
      comment: '',
    },
  },

  onLoad(options) {
    this.setData({ approvalId: options.id || '' });
    if (wx.showShareMenu) {
      wx.showShareMenu({
        menus: ['shareAppMessage'],
      });
    }
  },

  onShareAppMessage() {
    const detail = this.data.detail || {};
    const title = detail.name
      ? `快来裁判一下：${detail.name} 该不该买？`
      : '我差点冲动下单，快来帮我踩刹车～';
    return {
      title,
      imageUrl: SHARE_POSTER,
      path: `/pages/saving-approval-detail/saving-approval-detail?id=${this.data.approvalId || ''}`,
    };
  },

  emitApprovalUpdated(detail) {
    if (!detail || !detail.id) return;
    const channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (!channel || !channel.emit) return;
    channel.emit('approvalUpdated', {
      id: detail.id,
      statusText: detail.statusText || detail.status,
      voteCount: Array.isArray(detail.replies) ? detail.replies.length : undefined,
      updatedAt: Date.now(),
    });
  },

  onShow() {
    this.loadDetail();
  },

  async loadDetail() {
    const id = this.data.approvalId;
    if (!id) {
      wx.showToast({ title: '审批不存在', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      const res = await savingApprovalService.getApprovalDetail(id);
      if (!res.ok || !res.detail) {
        wx.showToast({ title: res.error || '加载失败', icon: 'none' });
        return;
      }
      const detail = Object.assign({}, res.detail, {
        status: res.detail.statusText || res.detail.status,
      });
      this.setData({
        detail,
        reviewForm: {
          vote: '',
          comment: '',
        },
      });
      this.emitApprovalUpdated(detail);
    } catch (err) {
      wx.showToast({ title: '详情加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onVoteSelect(e) {
    const vote = e.currentTarget.dataset.vote || '';
    this.setData({ 'reviewForm.vote': vote });
  },

  onReviewInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [`reviewForm.${field}`]: e.detail.value });
  },

  onPreviewImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const detail = this.data.detail || {};
    const urls = Array.isArray(detail.images) ? detail.images.filter(Boolean) : [];
    if (!urls.length) return;
    const current = urls[index] || urls[0];
    wx.previewImage({
      current,
      urls,
    });
  },

  async submitReview() {
    const { approvalId, reviewForm } = this.data;
    if (!approvalId) return;
    if (!reviewForm.vote) {
      wx.showToast({ title: '请选择通过或驳回', icon: 'none' });
      return;
    }
    if (!(reviewForm.comment || '').trim()) {
      wx.showToast({ title: '请填写审批理由', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中', mask: true });
    try {
      const res = await savingApprovalService.submitReview(approvalId, {
        vote: reviewForm.vote,
        comment: (reviewForm.comment || '').trim(),
      });
      if (!res.ok) {
        wx.showToast({ title: res.error || '提交失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '提交成功', icon: 'success' });
      this.loadDetail();
    } catch (err) {
      wx.showToast({ title: '提交失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onRevokeReviewTap() {
    if (!this.data.approvalId) return;
    wx.showModal({
      title: '撤销评估',
      content: '确认撤销你的评估记录？',
      success: async (modalRes) => {
        if (!modalRes.confirm) return;
        wx.showLoading({ title: '处理中', mask: true });
        try {
          const res = await savingApprovalService.revokeReview(this.data.approvalId);
          if (!res.ok) {
            wx.showToast({ title: res.error || '撤销失败', icon: 'none' });
            return;
          }
          wx.showToast({ title: '已撤销', icon: 'success' });
          this.loadDetail();
        } catch (err) {
          wx.showToast({ title: '撤销失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },

  onDecisionTap(e) {
    const decision = e.currentTarget.dataset.decision;
    if (!decision || !this.data.approvalId) return;
    const text = decision === 'abandoned' ? '确认已放弃购买？' : '确认还是购买了？';

    wx.showModal({
      title: '确认最终结果',
      content: text,
      success: async (modalRes) => {
        if (!modalRes.confirm) return;
        try {
          const res = await savingApprovalService.setFinalDecision(this.data.approvalId, decision);
          if (!res.ok) {
            wx.showToast({ title: res.error || '提交失败', icon: 'none' });
            return;
          }
          wx.showToast({ title: '已更新', icon: 'success' });
          this.loadDetail();
        } catch (err) {
          wx.showToast({ title: '提交失败', icon: 'none' });
        }
      },
    });
  },

  onRevokeFinalDecisionTap() {
    if (!this.data.approvalId) return;
    wx.showModal({
      title: '撤销最终结果',
      content: '确认撤销已确认的最终结果？',
      success: async (modalRes) => {
        if (!modalRes.confirm) return;
        wx.showLoading({ title: '处理中', mask: true });
        try {
          const res = await savingApprovalService.revokeFinalDecision(this.data.approvalId);
          if (!res.ok) {
            wx.showToast({ title: res.error || '撤销失败', icon: 'none' });
            return;
          }
          wx.showToast({ title: '已撤销', icon: 'success' });
          this.loadDetail();
        } catch (err) {
          wx.showToast({ title: '撤销失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },
});
