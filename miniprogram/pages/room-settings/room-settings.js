/**
 * 房间设置页（仅房主可见）
 *
 * 功能：
 * - 修改房间基本信息（名称、简介、公告）
 * - 权限开关配置
 * - 人数上限管理
 * - 邀请凭证生成与管理
 * - 成员管理入口
 * - 危险操作（移交房主、解散房间）
 */

const roomUtil = require('../../utils/room');
const dateUtil = require('../../utils/date');

Page({
  data: {
    loading: true,
    roomId: null,
    room: null,

    // 设置表单数据
    settings: {
      roomName: '',
      roomDesc: '',
      roomNotice: '',
      maxMemberIndex: 1, // 默认100人
      allowFreeJoin: true,
      allowOuterCheckIn: true,
      openRank: true,
      autoReport: true,
      reportPush: true,
    },
    maxMemberOptions: [50, 100],

    // 统计数据
    stats: { memberCount: 0 },

    // 邀请凭证列表
    tokens: [],
    generating: false,

    // 状态
    saving: false,
  },

  onLoad(options) {
    this.roomId = options.roomId;
    if (!this.roomId) {
      wx.showToast({ title: '房间ID缺失', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1000);
      return;
    }
  },

  onShow() {
    if (this.roomId) {
      this.loadRoomSettings();
    }
  },

  /**
   * 加载房间设置
   */
  async loadRoomSettings() {
    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'room',
        data: { action: 'getRoomInfo', roomId: this.roomId },
      });

      if (res.result.code !== 0 || !res.result.data.isOwner) {
        wx.showToast({ title: '无权限访问', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1000);
        return;
      }

      const room = res.result.data;

      // 找到人数选项索引
      const maxMemberIndex = this.data.maxMemberOptions.indexOf(room.maxMember);
      const validIndex = maxMemberIndex >= 0 ? maxMemberIndex : 1;

      // 格式化邀请凭证列表
      const tokens = (room.inviteTokens || []).map(token => ({
        ...token,
        expireTimeStr: dateUtil.formatDateTime(token.expireTime),
      }));

      this.setData({
        loading: false,
        room,
        settings: {
          roomName: room.roomName || '',
          roomDesc: room.roomDesc || '',
          roomNotice: room.roomNotice || '',
          maxMemberIndex: validIndex,
          allowFreeJoin: room.allowFreeJoin !== false,
          allowOuterCheckIn: room.allowOuterCheckIn !== false,
          openRank: room.openRank !== false,
          autoReport: room.autoReport !== false,
          reportPush: room.reportPush !== false,
        },
        stats: res.result.data.stats || {},
        tokens,
      });
    } catch (err) {
      console.error('加载设置失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /**
   * 输入框事件处理
   */
  onInputRoomName(e) {
    this.setData({ 'settings.roomName': e.detail.value });
  },

  onInputRoomDesc(e) {
    this.setData({ 'settings.roomDesc': e.detail.value });
  },

  onInputRoomNotice(e) {
    this.setData({ 'settings.roomNotice': e.detail.value });
  },

  onSwitchChange(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;

    // 如果关闭自动周报，同时关闭推送通知
    if (key === 'autoReport' && !value) {
      this.setData({
        [`settings.${key}`]: value,
        'settings.reportPush': false,
      });

      wx.showToast({
        title: '已同步关闭周报推送',
        icon: 'none',
        duration: 1500,
      });
      return;
    }

    this.setData({ [`settings.${key}`]: value });
  },

  showMaxMemberPicker() {
    wx.showActionSheet({
      itemList: this.data.maxMemberOptions.map(n => `${n}人`),
      success: (res) => {
        if (!isNaN(res.tapIndex)) {
          this.setData({ 'settings.maxMemberIndex': res.tapIndex });
        }
      },
    });
  },

  /**
   * 生成邀请凭证
   */
  async generateToken() {
    this.setData({ generating: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'room',
        data: { action: 'generateInviteToken', roomId: this.roomId },
      });

      if (res.result.code === 0) {
        const newToken = res.result.data;

        // 添加到列表
        this.setData({
          tokens: [
            {
              token: newToken.token,
              used: false,
              createTime: new Date(),
              expireTime: new Date(newToken.expireTime),
              expireTimeStr: dateUtil.formatDateTime(newToken.expireTime),
            },
            ...this.data.tokens,
          ],
        });

        wx.showToast({ title: '生成成功', icon: 'success' });

        // 自动复制到剪贴板
        setTimeout(() => {
          this.copyToken(null, newToken.token);
        }, 500);
      } else {
        wx.showToast({ title: res.result.error || '生成失败', icon: 'none' });
      }
    } catch (err) {
      console.error('生成凭证失败', err);
      wx.showToast({ title: '生成失败', icon: 'none' });
    } finally {
      this.setData({ generating: false });
    }
  },

  /**
   * 复制邀请凭证
   */
  copyToken(e, directToken) {
    const token = directToken || e.currentTarget.dataset.token;
    if (!token) return;

    wx.setClipboardData({
      data: token,
      success: () => {
        wx.showToast({ title: '凭证已复制', icon: 'success' });
      },
    });
  },

  /**
   * 保存设置
   */
  async saveSettings() {
    const { settings, saving, roomId } = this.data;
    if (saving) return;

    // 校验必填项
    if (!settings.roomName.trim()) {
      wx.showToast({ title: '请输入房间名称', icon: 'none' });
      return;
    }

    this.setData({ saving: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'room',
        data: {
          action: 'updateRoomSettings',
          roomId,
          settings: {
            roomName: settings.roomName.trim(),
            roomDesc: settings.roomDesc.trim(),
            roomNotice: settings.roomNotice.trim(),
            maxMember: this.data.maxMemberOptions[settings.maxMemberIndex],
            allowFreeJoin: settings.allowFreeJoin,
            allowOuterCheckIn: settings.allowOuterCheckIn,
            openRank: settings.openRank,
            autoReport: settings.autoReport,
            reportPush: settings.reportPush,
          },
        },
      });

      if (res.result.code === 0) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1000);
      } else {
        wx.showToast({ title: res.result.error || '保存失败', icon: 'none' });
      }
    } catch (err) {
      console.error('保存设置失败', err);
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  /**
   * 跳转成员列表
   */
  goMemberList() {
    wx.navigateTo({
      url: `/pages/room-members/room-members?roomId=${this.roomId}`,
    });
  },

  /**
   * 确认重置统计
   */
  confirmResetStats() {
    wx.showModal({
      title: '重置打卡统计',
      content: '确定要重置所有成员的打卡统计数据吗？此操作不可撤销！\n\n注意：不会删除个人存钱数据。',
      confirmText: '确认重置',
      confirmColor: '#F53F3F',
      success: async (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: '重置中...' });

        try {
          const result = await wx.cloud.callFunction({
            name: 'room',
            data: { action: 'resetRoomStats', roomId: this.roomId },
          });

          wx.hideLoading();

          if (result.result.code === 0) {
            wx.showToast({ title: '重置成功', icon: 'success' });
            this.loadRoomSettings(); // 刷新页面
          } else {
            wx.showToast({ title: result.result.error || '重置失败', icon: 'none' });
          }
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '重置失败', icon: 'none' });
        }
      },
    });
  },

  /**
   * 确认移交房主
   */
  confirmTransferOwnership() {
    wx.showModal({
      title: '移交房主身份',
      content: '移交后您将失去房主权限，且无法撤销。请确保新房主是可信任的成员。',
      confirmText: '确认移交',
      confirmColor: '#F53F3F',
      success: () => {
        // TODO: 跳转选择成员页面或弹出成员选择器
        wx.showToast({ title: '功能开发中', icon: 'none' });
      },
    });
  },

  /**
   * 确认解散房间
   */
  confirmDissolveRoom() {
    wx.showModal({
      title: '解散房间',
      content: '解散后所有数据将清除且无法恢复，确定要解散吗？',
      confirmText: '解散',
      confirmColor: '#F53F3F',
      success: async (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: '解散中...' });

        try {
          const result = await wx.cloud.callFunction({
            name: 'room',
            data: { action: 'dissolveRoom', roomId: this.roomId },
          });

          wx.hideLoading();

          if (result.result.code === 0) {
            wx.showToast({ title: '房间已解散', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 1500);
          } else {
            wx.showToast({ title: result.result.error || '解散失败', icon: 'none' });
          }
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '解散失败', icon: 'none' });
        }
      },
    });
  },
});
