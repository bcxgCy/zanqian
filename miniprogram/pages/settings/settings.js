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

  /**
   * 测试打卡提醒推送
   * 调用 reminderSender 云函数的 dailyCheckin 接口进行测试
   */
  testSubscribeMessage() {
    if (!wx.cloud) {
      wx.showToast({ title: '当前基础库不支持云能力', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '测试打卡提醒推送',
      content: '将立即执行一次打卡提醒推送任务，仅推送给今日有待打卡且已授权的用户。是否继续？',
      confirmText: '开始测试',
      success: (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: '正在测试推送...', mask: true });

        wx.cloud.callFunction({
          name: 'reminderSender',
          data: {
            type: 'dailyCheckin',
          },
          success: (result) => {
            const data = result.result || {};
            console.log('推送测试结果:', data);

            const content = [
              `✅ 成功推送：${data.successCount || 0} 条`,
              `❌ 推送失败：${data.failCount || 0} 条`,
              `⏭️ 跳过（无额度/无需打卡）：${data.skipCount || 0} 条`,
              '',
              data.failCount > 0 ? '部分推送失败，请查看云函数日志了解详情' : '测试完成！'
            ].join('\n');

            wx.showModal({
              title: '推送测试结果',
              content: content,
              showCancel: false,
            });
          },
          fail: (err) => {
            console.error('推送测试失败:', err);
            wx.showModal({
              title: '测试失败',
              content: err.errMsg || '未知错误，请检查云函数是否已部署',
              showCancel: false,
            });
          },
          complete: () => {
            wx.hideLoading();
          },
        });
      },
    });
  },
});
