/**
 * 房间列表页（第3个Tab）
 * 展示用户加入的所有房间
 */

const roomUtil = require('../../utils/room');

Page({
  data: {
    loading: true,
    myRooms: [], // 我加入的房间列表
  },

  onShow() {
    this.loadMyRooms();
  },

  /**
   * 加载我加入的房间列表
   */
  async loadMyRooms() {
    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'room',
        data: { action: 'getMyRooms' },
      });

      if (res.result.code === 0) {
        const rooms = (res.result.data || []).map(room => roomUtil.formatRoomForDisplay(room));

        // 批量查询每个房间的今日状态
        const roomsWithStatus = await Promise.all(
          rooms.map(async (room) => {
            try {
              const statusRes = await wx.cloud.callFunction({
                name: 'room',
                data: { action: 'getTodayStatus', roomId: room._id },
              });

              return {
                ...room,
                myStatus: statusRes.result.data || null,
                isOwner: room.ownerOpenid === wx.getStorageSync('openid'), // 简化处理，实际应从云函数返回
              };
            } catch (e) {
              return { ...room, myStatus: null };
            }
          })
        );

        this.setData({ myRooms: roomsWithStatus });
      } else {
        console.error('加载房间失败', res.result.error);
        // 如果云函数还没有 getMyRooms action，使用备用方案
        await this.loadMyRoomsFallback();
      }
    } catch (err) {
      console.error('加载房间异常', err);
      this.loadMyRoomsFallback();
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 备用方案：通过查询 room_user 表获取房间列表
   */
  async loadMyRoomsFallback() {
    try {
      const openid = await this.getOpenid();

      // 查询我加入的房间成员记录
      const db = wx.cloud.database();
      const memberRes = await db.collection('room_user')
        .where({ openid, status: 'active' })
        .get();

      if (memberRes.data.length === 0) {
        this.setData({ myRooms: [] });
        return;
      }

      // 批量查询房间详情
      const roomIds = memberRes.data.map(m => m.roomId);
      const roomRes = await db.collection('rooms')
        .where({ _id: db.command.in(roomIds), status: 'active' })
        .get();

      const roomMap = {};
      roomRes.data.forEach(r => { roomMap[r._id] = r; });

      // 组装数据
      const rooms = memberRes.data
        .map(member => {
          const room = roomMap[member.roomId];
          if (!room) return null;
          return {
            ...roomUtil.formatRoomForDisplay(room),
            myStatus: {
              nickname: member.roomNickname,
              continueDay: member.continueDay || 0,
              totalCheckinCount: member.totalCheckinCount || 0,
              isCheckedInToday: roomUtil.isCheckedInToday(member.lastCheckinTime),
            },
            isOwner: room.ownerOpenid === openid,
          };
        })
        .filter(Boolean);

      this.setData({ myRooms: rooms });
    } catch (err) {
      console.error('备用方案也失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /**
   * 获取当前用户 openid
   */
  getOpenid() {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'getOpenid' },
      }).then(res => {
        resolve(res.result.openid);
      }).catch(reject);
    });
  },

  /**
   * 跳转房间详情
   */
  goRoomDetail(e) {
    const roomId = e.currentTarget.dataset.roomId;
    wx.navigateTo({
      url: `/pages/room-detail/room-detail?roomId=${roomId}`,
    });
  },

  /**
   * 跳转创建房间
   */
  goCreateRoom() {
    wx.navigateTo({
      url: '/pages/room-create/room-create',
    });
  },

  /**
   * 跳转加入房间
   */
  goJoinRoom() {
    wx.navigateTo({
      url: '/pages/room-join/room-join',
    });
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    return {
      title: '来存钱监督群一起坚持存钱吧！',
      path: '/pages/room/room',
      imageUrl: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/other/share.jpg',
    };
  },
});
