/**
 * 房间详情页
 * 核心功能：
 * - 展示房间信息、统计数据
 * - 个人状态卡（昵称、连续天数、打卡按钮）
 * - 双榜单（连续榜 + 累计榜）
 * - 动态流
 * - 房主操作入口
 */

const roomUtil = require('../../utils/room');
const dateUtil = require('../../utils/date');

Page({
  data: {
    loading: true,
    roomId: null,

    // 房间信息
    room: null,
    isOwner: false,
    canOuterCheckin: true,

    // 统计数据
    stats: {
      memberCount: 0,
      todayCheckinCount: 0,
      weekCheckinCount: 0,
    },

    // 我的成员信息
    myInfo: null,

    // 榜单数据
    currentTab: 'continue', // 'continue' | 'total'
    rankingList: [],
    permissionDenied: false,

    // 动态流
    dynamics: [],

    // 昵称编辑弹窗
    showNicknameModal: false,
    newNickname: '',

    // 🆕 订阅状态
    subscribeStatus: {
      subscribed: false,
      status: 'none', // none | active | cancelled | expired
    },
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
      this.loadRoomDetail();
      this.loadRanking('continue');
      this.loadDynamics();
      this.loadSubscribeStatus(); // 🆕 加载订阅状态
    }
  },

  /**
   * 加载房间详情
   */
  async loadRoomDetail() {
    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'room',
        data: { action: 'getRoomInfo', roomId: this.roomId },
      });

      if (res.result.code !== 0) {
        wx.showToast({ title: res.result.error || '加载失败', icon: 'none' });
        return;
      }

      const data = res.result.data;
      const room = data;

      this.setData({
        loading: false,
        room: roomUtil.formatRoomForDisplay(room),
        isOwner: data.isOwner,
        canOuterCheckin: room.allowOuterCheckIn !== false,
        stats: data.stats || {},
        myInfo: data.myInfo ? {
          ...data.myInfo,
          isCheckedInToday: roomUtil.isCheckedInToday(data.myInfo.lastCheckinTime),
        } : null,
      });
    } catch (err) {
      console.error('加载房间详情失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /**
   * 加载榜单数据
   */
  async loadRanking(type) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'room',
        data: { action: 'getRanking', roomId: this.roomId, rankingType: type },
      });

      if (res.result.code === 0) {
        const { ranking, permissionDenied } = res.result.data;

        // 格式化榜单数据
        const formattedRanking = (ranking || []).map(item => ({
          ...item,
          lastCheckinTimeStr: item.lastCheckinTime ? dateUtil.formatDateTime(item.lastCheckinTime) : '',
        }));

        this.setData({
          currentTab: type,
          rankingList: formattedRanking,
          permissionDenied: permissionDenied || false,
        });
      }
    } catch (err) {
      console.error('加载榜单失败', err);
    }
  },

  /**
   * 加载动态流
   */
  async loadDynamics() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'room',
        data: { action: 'getDynamics', roomId: this.roomId, limit: 20 },
      });

      if (res.result.code === 0) {
        const dynamics = (res.result.data || []).map(item => ({
          ...item,
          timeStr: dateUtil.formatDateTime(item.time),
        }));

        this.setData({ dynamics });
      }
    } catch (err) {
      console.error('加载动态失败', err);
    }
  },

  /**
   * 切换榜单 Tab
   */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;

    this.setData({ currentTab: tab });
    this.loadRanking(tab);
  },

  /**
   * 复制房间码
   */
  copyRoomCode() {
    const code = this.data.room?.roomCode;
    if (!code) return;

    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: '房间码已复制', icon: 'success' });
      },
    });
  },

  /**
   * 外部打卡签到
   */
  async doOuterCheckin() {
    if (!this.data.myInfo) {
      wx.showToast({ title: '请先加入房间', icon: 'none' });
      return;
    }

    if (this.data.myInfo.isCheckedInToday) {
      wx.showToast({ title: '今日已打卡', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认打卡',
      content: '确认今日已完成存钱记录（使用外部工具）？',
      confirmText: '确认打卡',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: '打卡中...' });

        try {
          const result = await wx.cloud.callFunction({
            name: 'room',
            data: {
              action: 'checkin',
              roomId: this.roomId,
              type: 2, // 外部打卡
            },
          });

          wx.hideLoading();

          if (result.result.code === 0) {
            const data = result.result.data;
            if (data.alreadyCheckedIn) {
              wx.showToast({ title: '今日已打卡', icon: 'none' });
            } else {
              wx.showToast({ title: `打卡成功！连续${data.continueDay}天`, icon: 'success' });

              // 刷新页面数据
              this.loadRoomDetail();
              this.loadRanking(this.data.currentTab);
              this.loadDynamics();
            }
          } else {
            wx.showToast({ title: result.result.error || '打卡失败', icon: 'none' });
          }
        } catch (err) {
          wx.hideLoading();
          console.error('打卡异常', err);
          wx.showToast({ title: '打卡失败，请重试', icon: 'none' });
        }
      },
    });
  },

  /**
   * 显示修改昵称弹窗
   */
  showEditNickname() {
    this.setData({
      showNicknameModal: true,
      newNickname: this.data.myInfo?.roomNickname || '',
    });
  },

  /**
   * 关闭昵称弹窗
   */
  closeNicknameModal() {
    this.setData({ showNicknameModal: false, newNickname: '' });
  },

  /**
   * 输入昵称
   */
  onNicknameInput(e) {
    this.setData({ newNickname: e.detail.value });
  },

  /**
   * 确认修改昵称
   */
  async confirmEditNickname() {
    const nickname = this.data.newNickname.trim();

    // 前端校验
    const validation = roomUtil.validateNickname(nickname);
    if (!validation.valid) {
      wx.showToast({ title: validation.error, icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'room',
        data: {
          action: 'updateNickname',
          roomId: this.roomId,
          nickname: nickname,
        },
      });

      wx.hideLoading();

      if (res.result.code === 0) {
        wx.showToast({ title: '修改成功', icon: 'success' });
        this.closeNicknameModal();
        this.loadRoomDetail(); // 刷新数据
      } else {
        wx.showToast({ title: res.result.error || '修改失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('修改昵称失败', err);
      wx.showToast({ title: '修改失败', icon: 'none' });
    }
  },

  /**
   * 跳转加入房间
   */
  goJoinRoom() {
    wx.navigateTo({
      url: `/pages/room-join/room-join?roomId=${this.roomId}`,
    });
  },

  /**
   * 跳转房间设置（房主）
   */
  goRoomSettings() {
    wx.navigateTo({
      url: `/pages/room-settings/room-settings?roomId=${this.roomId}`,
    });
  },

  // ==================== 🆕 订阅消息相关方法 ====================

  /**
   * 加载订阅状态
   */
  async loadSubscribeStatus() {
    if (!this.data.myInfo) return; // 非成员不加载

    try {
      const res = await wx.cloud.callFunction({
        name: 'room',
        data: { action: 'getSubscribeStatus', roomId: this.roomId },
      });

      if (res.result.code === 0) {
        this.setData({ subscribeStatus: res.result.data });
      }
    } catch (err) {
      console.error('加载订阅状态失败', err);
    }
  },

  /**
   * 切换订阅状态（开启/取消）
   */
  async toggleSubscribe() {
    const { subscribed } = this.data.subscribeStatus;

    // 如果已订阅，则取消
    if (subscribed) {
      await this.unsubscribeRoom();
      return;
    }

    // 未订阅，先尝试调用微信订阅消息授权
    this.requestSubscribeAuth();
  },

  /**
   * 请求微信订阅消息授权
   * ⚠️ 必须在 TAP 手势的同步调用栈中调用
   */
  requestSubscribeAuth() {
    const that = this;

    wx.requestSubscribeMessage({
      tmplIds: ['sUAAtSpg266YBGZLK68uQBEDn7cr5S-Tsl1xDg4abHo'],
      success(res) {
        const templateId = 'sUAAtSpg266YBGZLK68uQBEDn7cr5S-Tsl1xDg4abHo';

        if (res[templateId] === 'accept') {
          // 用户同意，调用云函数记录订阅
          that.subscribeRoom();
        } else if (res[templateId] === 'reject') {
          // 用户拒绝
          wx.showToast({
            title: '已取消，可在设置中开启',
            icon: 'none',
            duration: 2000,
          });
        }
        // 'ban' 状态表示用户被禁止订阅，不做处理
      },
      fail(err) {
        console.error('请求订阅授权失败', err);
        // 静默失败，不影响用户体验
      },
    });
  },

  /**
   * 调用云函数订阅房间提醒
   */
  async subscribeRoom() {
    wx.showLoading({ title: '订阅中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'room',
        data: { action: 'subscribeRoom', roomId: this.roomId },
      });

      wx.hideLoading();

      if (res.result.code === 0) {
        const { message, renewed } = res.result.data;

        wx.showToast({
          title: renewed ? '已更新订阅' : message,
          icon: 'success',
          duration: 2000,
        });

        // 更新本地状态
        this.setData({
          subscribeStatus: { subscribed: true, status: 'active' },
        });
      } else {
        wx.showToast({ title: res.result.error || '订阅失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('订阅失败', err);
      wx.showToast({ title: '订阅失败，请重试', icon: 'none' });
    }
  },

  /**
   * 取消订阅
   */
  async unsubscribeRoom() {
    wx.showModal({
      title: '取消订阅',
      content: '确定要取消每日打卡提醒吗？',
      confirmText: '取消订阅',
      confirmColor: '#F53F3F',
      success: async (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: '处理中...' });

        try {
          const result = await wx.cloud.callFunction({
            name: 'room',
            data: { action: 'unsubscribeRoom', roomId: this.roomId },
          });

          wx.hideLoading();

          if (result.result.code === 0) {
            wx.showToast({ title: '已取消订阅', icon: 'success' });
            this.setData({
              subscribeStatus: { subscribed: false, status: 'cancelled' },
            });
          } else {
            wx.showToast({ title: result.result.error || '操作失败', icon: 'none' });
          }
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
    });
  },

  /**
   * 确认解散房间
   */
  confirmDissolve() {
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

  /**
   * 分享给朋友
   */
  onShareAppMessage() {
    const room = this.data.room;
    return {
      title: `${room?.roomName} - 来一起坚持存钱吧！`,
      path: `/pages/room-join/room-join?code=${room?.roomCode}`,
      imageUrl: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/other/share.jpg',
    };
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    const room = this.data.room;
    return {
      title: `我正在${room?.roomName}坚持存钱`,
      query: `roomId=${this.roomId}`,
      imageUrl: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/other/share.jpg',
    };
  },
});
