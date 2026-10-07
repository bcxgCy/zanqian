const savingApprovalService = require('../../utils/savingApprovalService');

const SHARE_POSTER = 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/other/shenpi-share.jpg';

Page({
  data: {
    form: {
      itemName: '',
      price: '',
      reason: '',
      alternative: '',
      images: [],
      approvalMode: 'single', // single | multi
      multiCount: 3,
      syncToPlaza: true,
    },
    multiCountOptions: [3, 5, 7],
    multiCountIndex: 0,
    showSharePopup: false,
    createdApprovalId: '',
  },

  onLoad() {
    if (wx.showShareMenu) {
      wx.showShareMenu({
        menus: ['shareAppMessage'],
      });
    }
  },

  onShareAppMessage() {
    const id = this.data.createdApprovalId;
    if (!id) {
      return {
        title: '救命！我又想买东西了，快来当我的理性搭子～',
        imageUrl: SHARE_POSTER,
        path: '/pages/saving/saving',
      };
    }
    return {
      title: '我钱包发来求救：这单到底该不该冲？',
      imageUrl: SHARE_POSTER,
      path: `/pages/saving-approval-detail/saving-approval-detail?id=${id}`,
    };
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onMultiCountChange(e) {
    const index = Number(e.detail.value) || 0;
    this.setData({
      multiCountIndex: index,
      'form.multiCount': this.data.multiCountOptions[index],
    });
  },

  onApprovalModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode) return;
    this.setData({ 'form.approvalMode': mode });
  },

  onSyncChange(e) {
    this.setData({ 'form.syncToPlaza': !!e.detail.value });
  },

  noop() {},

  chooseImages() {
    const left = 2 - this.data.form.images.length;
    if (left <= 0) return;
    wx.chooseMedia({
      count: left,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const files = (res.tempFiles || []).map((item) => item.tempFilePath).filter(Boolean);
        if (!files.length) return;
        this.setData({
          'form.images': this.data.form.images.concat(files).slice(0, 2),
        });
      },
      fail: (err) => {
        if (String(err && err.errMsg || '').includes('cancel')) return;
        wx.showToast({ title: '选择图片失败', icon: 'none' });
      },
    });
  },

  removeImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const list = this.data.form.images.slice();
    if (Number.isNaN(index) || index < 0 || index >= list.length) return;
    list.splice(index, 1);
    this.setData({ 'form.images': list });
  },

  async uploadImages() {
    const images = this.data.form.images || [];
    if (!images.length) return [];

    const tasks = images.map((filePath) => {
      const ext = (filePath.split('.').pop() || 'jpg').toLowerCase();
      const cloudPath = `saving-approval/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      return wx.cloud.uploadFile({ cloudPath, filePath }).then((res) => res.fileID).catch(() => '');
    });

    const uploaded = await Promise.all(tasks);
    return uploaded.filter(Boolean);
  },

  async submit() {
    const { itemName, price, approvalMode, multiCount } = this.data.form;
    if (!itemName.trim()) {
      wx.showToast({ title: '请输入物品名称', icon: 'none' });
      return;
    }
    if (!price || Number(price) <= 0) {
      wx.showToast({ title: '请输入有效价格', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中', mask: true });
    try {
      const images = await this.uploadImages();
      const payload = {
        itemName: itemName.trim(),
        price: Number(price),
        reason: (this.data.form.reason || '').trim(),
        alternative: (this.data.form.alternative || '').trim(),
        approvalMode,
        multiCount,
        syncToPlaza: !!this.data.form.syncToPlaza,
        images,
      };

      const res = await savingApprovalService.createApproval(payload);
      if (!res.ok) {
        wx.showToast({ title: res.error || '提交失败', icon: 'none' });
        return;
      }
      const approvalId = (res.approval && res.approval.id) || '';
      this.setData({
        createdApprovalId: approvalId,
        showSharePopup: true,
      });
      wx.showToast({ title: '提交成功', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: '提交失败，请稍后重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  closeSharePopup() {
    this.setData({ showSharePopup: false });
  },

  goToCreatedDetail() {
    const id = this.data.createdApprovalId;
    if (!id) {
      this.closeSharePopup();
      return;
    }
    this.closeSharePopup();
    wx.redirectTo({
      url: `/pages/saving-approval-detail/saving-approval-detail?id=${id}`,
    });
  },
});
