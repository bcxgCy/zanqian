/**
 * 数据库初始化工具页面
 *
 * 功能：
 * - 一键创建所有集合
 * - 检查数据库状态
 * - 插入/清理测试数据
 * - 清空所有数据（危险操作）
 */

Page({
  data: {
    loading: false,
    statusChecked: false,
    dbReady: false,
    collectionsStatus: [],
    lastResult: null,
    resultText: '',
  },

  onLoad() {
    // 页面加载时自动检查状态
    this.checkStatus();
  },

  onShow() {
    // 每次显示时刷新状态（如果已经检查过）
    if (this.data.statusChecked) {
      this.checkStatus();
    }
  },

  /**
   * 🚀 一键初始化全部（推荐）
   */
  async initAll() {
    if (this.data.loading) return;

    const res = await this.confirmAction(
      '一键初始化',
      '将自动创建5个集合并配置索引，确定继续吗？'
    );
    if (!res) return;

    await this.callCloudFunction('initAll', {});
  },

  /**
   * 仅创建集合
   */
  async createCollectionsOnly() {
    if (this.data.loading) return;

    const res = await this.confirmAction(
      '创建集合',
      '将创建 rooms、room_user、room_checkin、room_subscribe、room_weekly_reports 共5个集合'
    );
    if (!res) return;

    await this.callCloudFunction('createCollections', {});

    // 创建完成后重新检查状态
    setTimeout(() => this.checkStatus(), 1000);
  },

  /**
   * 检查状态
   */
  async checkStatus() {
    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'dbInit',
        data: { action: 'checkStatus' },
      });

      if (res.result.code === 0) {
        const data = res.result.data;
        const collections = Object.entries(data.collections).map(([name, info]) => ({
          name,
          ...info,
        }));

        this.setData({
          statusChecked: true,
          dbReady: data.ready,
          collectionsStatus: collections,
          loading: false,
        });
      } else {
        this.setData({ loading: false });
        wx.showToast({ title: '检查失败', icon: 'none' });
      }
    } catch (err) {
      console.error('检查状态失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  /**
   * 插入测试数据
   */
  async insertTestData() {
    if (this.data.loading) return;

    const res = await this.confirmAction(
      '插入测试数据',
      '将创建一个测试房间、测试用户和打卡记录，可在测试后清理'
    );
    if (!res) return;

    await this.callCloudFunction('insertTestData', {});

    // 刷新状态
    setTimeout(() => this.checkStatus(), 1000);
  },

  /**
   * 清理测试数据
   */
  async clearTestData() {
    if (this.data.loading) return;

    const res = await this.confirmAction(
      '清理测试数据',
      '将删除所有名称包含"🧪"的测试房间及其关联数据，确定吗？'
    );
    if (!res) return;

    await this.callCloudFunction('clearTestData', {});

    // 刷新状态
    setTimeout(() => this.checkStatus(), 1000);
  },

  /**
   * 确认清空所有数据（危险操作）
   */
  async confirmDropAll() {
    if (this.data.loading) return;

    wx.showModal({
      title: '⚠️ 危险操作确认',
      content: '此操作将清空所有集合中的数据！\n\n包括：\n- 所有房间及成员数据\n- 所有打卡记录\n- 所有订阅记录\n- 所有周报数据\n\n⚠️ 此操作不可恢复！',
      confirmText: '确认清空',
      confirmColor: '#F53F3F',
      cancelText: '取消',
      success: async (modalRes) => {
        if (!modalRes.confirm) return;

        // 二次确认
        wx.showModal({
          title: '最后确认',
          content: '真的要清空所有数据吗？请输入"DELETE"确认',
          editable: true,
          placeholderText: '输入 DELETE 确认',
          confirmText: '永久删除',
          confirmColor: '#F53F3F',
          success: async (finalRes) => {
            if (!finalRes.confirm || finalRes.content !== 'DELETE') {
              wx.showToast({ title: '已取消', icon: 'none' });
              return;
            }

            await this.callCloudFunction('dropAll', {});

            // 刷新状态
            setTimeout(() => this.checkStatus(), 1500);
          },
        });
      },
    });
  },

  /**
   * 调用云函数的通用方法
   */
  async callCloudFunction(action, extraData = {}) {
    this.setData({
      loading: true,
      lastResult: null,
      resultText: '',
    });

    try {
      console.log('【前端调试】准备调用云函数 dbInit, action=', action);

      const res = await wx.cloud.callFunction({
        name: 'dbInit',
        data: { action, ...extraData },
      });

      console.log('【前端调试】云函数原始返回:', JSON.stringify(res));
      console.log('【前端调试】result:', JSON.stringify(res.result));

      const result = res.result;

      // 格式化结果显示（更详细）
      let resultText = '';
      try {
        resultText = JSON.stringify(result, null, 2);
      } catch (e) {
        resultText = String(result);
      }

      this.setData({
        loading: false,
        lastResult: result,
        resultText: resultText,
      });

      if (result.code === 0) {
        wx.showToast({
          title: result.data?.message || '✅ 操作成功',
          icon: 'success',
          duration: 2000,
        });
      } else {
        // 显示具体错误信息
        const errorMsg = result.error || result.errMsg || '未知错误';
        console.error('【前端调试】操作失败:', errorMsg);

        wx.showModal({
          title: '⚠️ 操作失败',
          content: `错误码: ${result.code}\n\n错误信息:\n${errorMsg}\n\n详情请查看下方结果区域`,
          showCancel: false,
          confirmText: '知道了',
        });
      }

      return result;
    } catch (err) {
      console.error('【前端调试】调用异常:', err);
      console.error('【前端调试】错误堆栈:', err.stack);

      this.setData({
        loading: false,
        lastResult: { code: -1, error: err.message },
        resultText: `❌ 请求异常\n\n错误类型: ${err.constructor.name}\n错误消息: ${err.message}\n\n堆栈信息:\n${err.stack || '无'}`,
      });

      wx.showModal({
        title: '❌ 请求失败',
        content: `${err.message}\n\n请查看控制台 Console 和下方结果区域获取详细信息`,
        showCancel: false,
        confirmText: '知道了',
      });

      return null;
    }
  },

  /**
   * 通用确认弹窗
   */
  confirmAction(title, content) {
    return new Promise((resolve) => {
      wx.showModal({
        title,
        content,
        confirmText: '确认',
        cancelText: '取消',
        success(res) {
          resolve(!!res.confirm);
        },
        fail() {
          resolve(false);
        },
      });
    });
  },
});
