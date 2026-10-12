function isReady() {
  return !!wx.cloud;
}

function callBudgetChallengeService(data) {
  if (!isReady()) {
    return Promise.reject(new Error('当前基础库不支持云能力'));
  }

  return wx.cloud.callFunction({
    name: 'budgetChallengeService',
    data,
  }).then((res) => res.result || {});
}

function getBudgetChallenges() {
  return callBudgetChallengeService({ action: 'getBudgetChallenges' });
}

function getBudgetChallengeDetail(challengeId, options) {
  return callBudgetChallengeService({ action: 'getBudgetChallengeDetail', challengeId, options: options || {} });
}

function getHomeData() {
  return callBudgetChallengeService({ action: 'getHomeData' });
}

function createBudgetChallenge(payload) {
  return callBudgetChallengeService({ action: 'createBudgetChallenge', payload });
}

function updateBudgetChallenge(challengeId, payload) {
  return callBudgetChallengeService({ action: 'updateBudgetChallenge', challengeId, payload });
}

function deleteBudgetChallenge(challengeId) {
  return callBudgetChallengeService({ action: 'deleteBudgetChallenge', challengeId });
}

function archiveBudgetChallenge(challengeId) {
  return callBudgetChallengeService({ action: 'archiveBudgetChallenge', challengeId });
}

function addConsumeRecord(challengeId, payload) {
  return callBudgetChallengeService({ action: 'addConsumeRecord', challengeId, payload });
}

function updateConsumeRecord(recordId, payload) {
  return callBudgetChallengeService({ action: 'updateConsumeRecord', recordId, payload });
}

function deleteConsumeRecord(recordId) {
  return callBudgetChallengeService({ action: 'deleteConsumeRecord', recordId });
}

module.exports = {
  getBudgetChallenges,
  getBudgetChallengeDetail,
  getHomeData,
  createBudgetChallenge,
  updateBudgetChallenge,
  deleteBudgetChallenge,
  archiveBudgetChallenge,
  addConsumeRecord,
  updateConsumeRecord,
  deleteConsumeRecord,
};
