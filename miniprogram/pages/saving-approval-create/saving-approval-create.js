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
    cooldownOptions: ['24小时', '48小时', '72小时'],
    cooldownIndex: 0,
    multiCountOptions: [3, 5, 7],
    multiCountIndex: 0,
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onCooldownChange(e) {
    this.setData({ cooldownIndex: Number(e.detail.value) || 0 });
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

  submit() {
    const { itemName, price, approvalMode, multiCount } = this.data.form;
    if (!itemName.trim()) {
      wx.showToast({ title: '请输入物品名称', icon: 'none' });
      return;
    }
    if (!price || Number(price) <= 0) {
      wx.showToast({ title: '请输入有效价格', icon: 'none' });
      return;
    }

    const tip = approvalMode === 'single'
      ? '单人审批将由1人评估后自动结束并汇总结果'
      : `多人审批将在${multiCount}人投票完成后自动结束并汇总结果`;

    wx.showModal({
      title: '提交成功（前端演示）',
      content: tip,
      showCancel: false,
      confirmText: '知道了',
      success: () => {
        wx.navigateBack();
      },
    });
  },
});
