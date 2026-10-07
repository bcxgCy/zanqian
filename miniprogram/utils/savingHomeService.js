function isReady() {
  return !!wx.cloud;
}

function getHomeData() {
  if (!isReady()) {
    return Promise.reject(new Error('当前基础库不支持云能力'));
  }
  return wx.cloud.callFunction({
    name: 'savingHomeService',
    data: {},
  }).then((res) => res.result || {});
}

module.exports = {
  getHomeData,
};

