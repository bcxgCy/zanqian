const storage = require('../../utils/storage');

Page({
  clearData() {
    wx.showModal({
      title: '清除所有数据',
      content: '此操作不可恢复，确认清除所有存钱计划？',
      success: (res) => {
        if (res.confirm) {
          storage.savePlans([]);
          wx.showToast({ title: '已清除', icon: 'success' });
        }
      },
    });
  },
});
