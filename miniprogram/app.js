// app.js
const { envList } = require('./envList');

App({
  onLaunch: function () {
    const env = envList && envList.length ? envList[0].envId : "";
    this.globalData = {
      // env 参数说明：
      // env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会请求到哪个云环境的资源
      // 此处请填入环境 ID, 环境 ID 可在微信开发者工具右上顶部工具栏点击云开发按钮打开获取
      env,

      // ✅ 新增：数据版本号（用于 TabBar 页面智能刷新）
      _dataVersion: 0,       // 数据版本号（写操作后递增）
      _lastFetchTime: 0,     // 上次拉取时间戳
    };
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      const cloudConfig = {
        traceUser: true,
      };
      if (this.globalData.env) cloudConfig.env = this.globalData.env;
      wx.cloud.init(cloudConfig);
    }
  },

  /**
   * ✅ 新增：更新数据版本号（写操作成功后调用）
   * 用于通知 TabBar 页面数据已变化，需要刷新
   */
  bumpVersion() {
    this.globalData._dataVersion++;
    this.globalData._lastFetchTime = Date.now();
    console.log(`[App] 数据版本号递增: ${this.globalData._dataVersion}`);
  },
});
