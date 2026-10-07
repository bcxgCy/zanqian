function isReady() {
  return !!wx.cloud;
}

function callSavingChallengeService(data) {
  if (!isReady()) {
    return Promise.reject(new Error('当前基础库不支持云能力'));
  }
  return wx.cloud.callFunction({
    name: 'savingChallengeService',
    data,
  }).then((res) => res.result || {});
}

function createChallenge(payload) {
  return callSavingChallengeService({ action: 'createChallenge', payload });
}

function getChallenges() {
  return callSavingChallengeService({ action: 'getChallenges' });
}

function getChallengeDetail(challengeId) {
  return callSavingChallengeService({ action: 'getChallengeDetail', challengeId });
}

function checkinChallenge(challengeId, dateKey, mode) {
  return callSavingChallengeService({ action: 'checkinChallenge', challengeId, dateKey, mode });
}

function getHomeData() {
  return callSavingChallengeService({ action: 'getHomeData' });
}

module.exports = {
  createChallenge,
  getChallenges,
  getChallengeDetail,
  checkinChallenge,
  getHomeData,
};

