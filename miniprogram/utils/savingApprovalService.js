function isReady() {
  return !!wx.cloud;
}

function callSavingApprovalService(data) {
  if (!isReady()) {
    return Promise.reject(new Error('当前基础库不支持云能力'));
  }
  return wx.cloud.callFunction({
    name: 'savingApprovalService',
    data,
  }).then((res) => res.result || {});
}

function getHomeData() {
  return callSavingApprovalService({ action: 'getHomeData' });
}

function getApprovals() {
  return callSavingApprovalService({ action: 'getApprovals' });
}

function getApprovalDetail(approvalId) {
  return callSavingApprovalService({ action: 'getApprovalDetail', approvalId });
}

function createApproval(payload) {
  return callSavingApprovalService({ action: 'createApproval', payload });
}

function setFinalDecision(approvalId, decision) {
  return callSavingApprovalService({ action: 'setFinalDecision', approvalId, decision });
}

function submitReview(approvalId, payload) {
  return callSavingApprovalService({ action: 'submitReview', approvalId, payload });
}

function revokeFinalDecision(approvalId) {
  return callSavingApprovalService({ action: 'revokeFinalDecision', approvalId });
}

function revokeReview(approvalId) {
  return callSavingApprovalService({ action: 'revokeReview', approvalId });
}

module.exports = {
  getHomeData,
  getApprovals,
  getApprovalDetail,
  createApproval,
  setFinalDecision,
  submitReview,
  revokeFinalDecision,
  revokeReview,
};
