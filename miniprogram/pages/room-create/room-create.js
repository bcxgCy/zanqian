/**
 * 创建房间页
 */

Page({
  data: {
    formData: {
      roomName: '',
      roomDesc: '',
      maxMemberIndex: 1, // 默认100人
      allowFreeJoin: true,
      allowOuterCheckIn: true,
      openRank: true,
    },
    maxMemberOptions: [50, 100],
    canSubmit: false,
    submitting: false,
    roomDescLength: 0, // 🆕 预计算的字段数（WXML不支持复杂表达式）
  },

  /**
   * 监听表单变化，校验是否可提交
   */
  watchFormChange() {
    const { roomName } = this.data.formData;
    this.setData({
      canSubmit: roomName.trim().length > 0,
    });
  },

  onInputRoomName(e) {
    this.setData({ 'formData.roomName': e.detail.value });
    this.watchFormChange();
  },

  onInputRoomDesc(e) {
    const value = e.detail.value;
    // 🆕 同时更新字符数（WXML不支持 (str || '').length 这种复杂表达式）
    this.setData({
      'formData.roomDesc': value,
      roomDescLength: value.length,
    });
  },

  showMaxMemberPicker() {
    wx.showActionSheet({
      itemList: this.data.maxMemberOptions.map(n => `${n}人`),
      success: (res) => {
        if (!isNaN(res.tapIndex)) {
          this.setData({ 'formData.maxMemberIndex': res.tapIndex });
        }
      },
    });
  },

  onSwitchFreeJoin(e) {
    this.setData({ 'formData.allowFreeJoin': e.detail.value });
  },

  onSwitchOuterCheckin(e) {
    this.setData({ 'formData.allowOuterCheckIn': e.detail.value });
  },

  onSwitchOpenRank(e) {
    this.setData({ 'formData.openRank': e.detail.value });
  },

  /**
   * 创建房间
   */
  async createRoom() {
    const { formData, canSubmit, submitting } = this.data;

    if (!canSubmit || submitting) return;

    // 最终校验
    if (!formData.roomName.trim()) {
      wx.showToast({ title: '请输入房间名称', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'room',
        data: {
          action: 'createRoom',
          roomName: formData.roomName.trim(),
          roomDesc: formData.roomDesc.trim(),
          maxMember: this.data.maxMemberOptions[formData.maxMemberIndex],
          allowFreeJoin: formData.allowFreeJoin,
          allowOuterCheckIn: formData.allowOuterCheckIn,
          openRank: formData.openRank,
        },
      });

      if (res.result.code === 0) {
        const { roomId, roomCode } = res.result.data;

        wx.showToast({
          title: '创建成功！',
          icon: 'success',
          duration: 1500,
        });

        // 延迟跳转到房间详情
        setTimeout(() => {
          wx.redirectTo({
            url: `/pages/room-detail/room-detail?roomId=${roomId}`,
          });
        }, 1500);
      } else {
        wx.showToast({ title: res.result.error || '创建失败', icon: 'none' });
      }
    } catch (err) {
      console.error('创建房间失败', err);
      wx.showToast({ title: '创建失败，请重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
