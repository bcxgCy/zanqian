// app.js
const { envList } = require('./envList');

const DEFAULT_SHARE = {
  title: '存钱计划：管理目标，轻松攒钱',
  path: '/pages/index/index',
  imageUrl: ''
};

const getQueryFromPath = (path) => {
  if (!path || path.indexOf('?') === -1) {
    return '';
  }
  return path.split('?')[1] || '';
};

const ensureGlobalShare = () => {
  const originalPage = Page;
  if (originalPage.__shareInjected__) {
    return;
  }

  const wrappedPage = (options = {}) => {
    const pageOptions = { ...options };

    if (typeof pageOptions.onShareAppMessage !== 'function') {
      pageOptions.onShareAppMessage = function () {
        const app = getApp();
        const globalShare = (app && app.globalData && app.globalData.shareConfig) || {};
        return {
          title: globalShare.title || DEFAULT_SHARE.title,
          path: globalShare.path || DEFAULT_SHARE.path,
          imageUrl: globalShare.imageUrl || DEFAULT_SHARE.imageUrl
        };
      };
    }

    if (typeof pageOptions.onShareTimeline !== 'function') {
      pageOptions.onShareTimeline = function () {
        const app = getApp();
        const globalShare = (app && app.globalData && app.globalData.shareConfig) || {};
        return {
          title: globalShare.title || DEFAULT_SHARE.title,
          query: getQueryFromPath(globalShare.path || DEFAULT_SHARE.path),
          imageUrl: globalShare.imageUrl || DEFAULT_SHARE.imageUrl
        };
      };
    }

    return originalPage(pageOptions);
  };

  wrappedPage.__shareInjected__ = true;
  wrappedPage.__originalPage__ = originalPage;
  Page = wrappedPage;
};

ensureGlobalShare();

App({
  onLaunch: function () {
    const env = envList && envList.length ? envList[0].envId : "";
    this.globalData = {
      // env 参数说明：
      // env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会请求到哪个云环境的资源
      // 此处请填入环境 ID, 环境 ID 可在微信开发者工具右上顶部工具栏点击云开发按钮打开获取
      env,
      shareConfig: {
        title: DEFAULT_SHARE.title,
        path: DEFAULT_SHARE.path,
        imageUrl: DEFAULT_SHARE.imageUrl
      }
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
});
