/**
 * 加入房间页
 *
 * 支持两种加入方式：
 * 1. 房间码加入（6位纯数字）
 * 2. 邀请凭证加入（8位纯数字，一次性使用）
 *
 * 所有入房路径强制设置昵称（无跳过）
 */

const roomUtil = require('../../utils/room');

Page({
  data: {
    // 加入模式：'code' | 'invite'
    joinMode: 'code',

    // 房间码相关
    roomCode: '',
    searchedRoom: null,

    // 邀请凭证相关
    inviteToken: '',
    inviteRoomInfo: null,

    // 昵称设置步骤
    showNicknameStep: false,
    nickname: '',
    nicknameError: '',

    // 状态
    joined: false,       // 是否已是成员
    joining: false,      // 正在加入
    canJoin: false,      // 可以提交加入
    targetRoomId: null,  // 目标房间ID
  },

  onLoad(options) {
    // 支持从分享链接带入参数
    if (options.code) {
      this.setData({ roomCode: options.code, joinMode: 'code' });
      this.searchRoom();
    }
    if (options.token) {
      this.setData({ inviteToken: options.token, joinMode: 'invite' });
      this.validateToken();
    }
    if (options.roomId) {
      this.setData({ targetRoomId: options.roomId });
      // 直接进入昵称设置步骤
      this.showNicknameInput();
    }
  },

  /**
   * 切换加入方式
   */
  switchJoinMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      joinMode: mode,
      showNicknameStep: false,
      nickname: '',
      nicknameError: '',
    });
  },

  /**
   * 输入房间码
   */
  onInputRoomCode(e) {
    let value = e.detail.value.replace(/\D/g, ''); // 只保留数字
    if (value.length > 6) value = value.slice(0, 6);
    this.setData({
      roomCode: value,
      searchedRoom: null,
      showNicknameStep: false,
    });
  },

  /**
   * 输入邀请凭证
   */
  onInputInviteToken(e) {
    let value = e.detail.value;
    if (value.length > 8) value = value.slice(0, 8);
    this.setData({
      inviteToken: value,
      inviteRoomInfo: null,
      showNicknameStep: false,
    });
  },

  /**
   * 从剪贴板粘贴
   */
  pasteFromClipboard() {
    wx.getClipboardData({
      success: (res) => {
        const text = (res.data || '').trim();

        if (this.data.joinMode === 'code') {
          // 尝试提取6位数字
          const codeMatch = text.match(/\d{6}/);
          if (codeMatch) {
            this.setData({ roomCode: codeMatch[0] });
            return;
          }
        }

        if (this.data.joinMode === 'invite') {
          // 尝试提取8位数字或字母数字组合
          const tokenMatch = text.match(/\w{8}/);
          if (tokenMatch) {
            this.setData({ inviteToken: tokenMatch[0] });
            return;
          }
        }

        wx.showToast({ title: '剪贴板内容格式不正确', icon: 'none' });
      },
      fail: () => {
        wx.showToast({ title: '读取剪贴板失败', icon: 'none' });
      },
    });
  },

  /**
   * 搜索房间（通过房间码）
   */
  async searchRoom() {
    const { roomCode } = this.data;

    if (!roomUtil.isValidRoomCode(roomCode)) {
      wx.showToast({ title: '请输入6位数字房间码', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '搜索中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'room',
        data: { action: 'getRoomByCode', roomCode },
      });

      wx.hideLoading();

      if (res.result.code === 0) {
        const room = res.result.data;

        this.setData({
          searchedRoom: roomUtil.formatRoomForDisplay(room),
          targetRoomId: room._id,
          joined: room.isMember,
        });

        if (room.isMember) {
          // 已是成员，显示提示
          this.setData({ showNicknameStep: false });
        }
      } else if (res.result.code === -3) {
        wx.showToast({ title: res.result.error, icon: 'none' });
      } else {
        wx.showToast({ title: res.result.error || '房间不存在', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('搜索房间失败', err);
      wx.showToast({ title: '搜索失败，请重试', icon: 'none' });
    }
  },

  /**
   * 验证邀请凭证
   */
  async validateToken() {
    const { inviteToken } = this.data;

    if (!inviteToken || inviteToken.length < 8) {
      wx.showToast({ title: '请输入完整的8位凭证', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '验证中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'room',
        data: { action: 'getRoomByCode', inviteToken }, // 复用接口，云函数会自动识别
      });

      wx.hideLoading();

      if (res.result.code === 0) {
        const room = res.result.data;

        this.setData({
          inviteRoomInfo: roomUtil.formatRoomForDisplay(room),
          targetRoomId: room._id,
          joined: room.isMember,
        });
      } else {
        wx.showToast({ title: res.result.error || '凭证无效', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('验证凭证失败', err);
      wx.showToast({ title: '验证失败', icon: 'none' });
    }
  },

  /**
   * 显示昵称输入界面
   */
  showNicknameInput() {
    this.setData({
      showNicknameStep: true,
      nickname: '',
      nicknameError: '',
    });
  },

  /**
   * 输入昵称
   */
  onInputNickname(e) {
    const nickname = e.detail.value;

    // 实时校验
    const validation = roomUtil.validateNickname(nickname);

    this.setData({
      nickname,
      nicknameError: validation.valid ? '' : validation.error,
      canJoin: validation.valid && nickname.trim().length > 0,
    });
  },

  /**
   * 确认加入房间
   */
  async confirmJoin() {
    const { nickname, canJoin, joining, joinMode, roomCode, inviteToken, targetRoomId } = this.data;

    if (!canJoin || joining) return;

    // 最终校验
    const validation = roomUtil.validateNickname(nickname);
    if (!validation.valid) {
      this.setData({ nicknameError: validation.error });
      return;
    }

    this.setData({ joining: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'room',
        data: {
          action: 'joinRoom',
          roomId: targetRoomId,
          roomCode: joinMode === 'code' ? roomCode : undefined,
          inviteToken: joinMode === 'invite' ? inviteToken : undefined,
          nickname: nickname.trim(),
        },
      });

      if (res.result.code === 0) {
        const data = res.result.data;

        if (data.alreadyMember) {
          wx.showToast({ title: '您已在房间中', icon: 'none' });
          setTimeout(() => this.goRoomDetail(), 1000);
        } else {
          wx.showToast({
            title: '成功加入！',
            icon: 'success',
            duration: 1500,
          });

          // 延迟跳转到房间详情
          setTimeout(() => {
            wx.redirectTo({
              url: `/pages/room-detail/room-detail?roomId=${data.roomId}`,
            });
          }, 1500);
        }
      } else {
        wx.showToast({ title: res.result.error || '加入失败', icon: 'none' });
      }
    } catch (err) {
      console.error('加入房间失败', err);
      wx.showToast({ title: '加入失败，请重试', icon: 'none' });
    } finally {
      this.setData({ joining: false });
    }
  },

  /**
   * 跳转房间详情
   */
  goRoomDetail() {
    const roomId = this.data.targetRoomId || (this.data.searchedRoom?._id) || (this.data.inviteRoomInfo?._id);
    if (roomId) {
      wx.redirectTo({
        url: `/pages/room-detail/room-detail?roomId=${roomId}`,
      });
    } else {
      wx.navigateBack();
    }
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    return {
      title: '来一起坚持存钱吧！',
      path: '/pages/room-join/room-join',
      imageUrl: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/other/share.jpg',
    };
  },
});
