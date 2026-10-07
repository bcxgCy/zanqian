function isReady() {
  return !!wx.cloud;
}

function callSavingPlazaService(data) {
  if (!isReady()) {
    return Promise.reject(new Error('当前基础库不支持云能力'));
  }
  return wx.cloud.callFunction({
    name: 'savingPlazaService',
    data,
  }).then((res) => res.result || {});
}

function createChallenge(payload) {
  return callSavingPlazaService({ action: 'createChallenge', payload });
}

function getPlazaFeed(page, pageSize) {
  return callSavingPlazaService({ action: 'getPlazaFeed', page, pageSize });
}

function toggleChallengeLike(challengeId) {
  return callSavingPlazaService({ action: 'toggleChallengeLike', challengeId });
}

module.exports = {
  createChallenge,
  getPlazaFeed,
  toggleChallengeLike,
};

