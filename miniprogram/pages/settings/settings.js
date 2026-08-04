const storage = require('../../utils/storage');

Page({
  testCloud() {
    if (!wx.cloud) {
      wx.showToast({ title: '当前基础库不支持云能力', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '连接中' });
    wx.cloud.callFunction({
      name: 'dataService',
      data: {
        action: 'login',
      },
      success: (res) => {
        const openid = res.result && res.result.openid ? res.result.openid : '未获取到 openid';
        wx.showModal({
          title: '云服务连接成功',
          content: 'openid：' + openid,
          showCancel: false,
        });
      },
      fail: (err) => {
        wx.showModal({
          title: '云服务连接失败',
          content: err.errMsg || '请确认已开通云开发，并上传 dataService 云函数。',
          showCancel: false,
        });
      },
      complete: () => {
        wx.hideLoading();
      },
    });
  },

  clearData() {
    wx.showModal({
      title: '清除所有数据',
      content: '此操作不可恢复，确认清除所有存钱计划？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '清除中' });
          storage.savePlans([])
            .then(() => {
              wx.showToast({ title: '已清除', icon: 'success' });
            })
            .catch((err) => {
              wx.showToast({ title: '清除失败', icon: 'none' });
              console.warn('清除数据失败', err);
            })
            .finally(() => {
              wx.hideLoading();
            });
        }
      },
    });
  },
});
