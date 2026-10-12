function isReady() {
  return !!wx.cloud;
}

function callCoolingService(data) {
  if (!isReady()) {
    return Promise.reject(new Error('当前基础库不支持云能力'));
  }
  return wx.cloud.callFunction({
    name: 'coolingService',
    data,
  }).then((res) => res.result || {});
}

function getRecords() {
  return callCoolingService({ action: 'list' });
}

function createRecord(payload) {
  return callCoolingService({ action: 'create', payload });
}

function updateRecord(recordId, payload) {
  return callCoolingService({ action: 'update', recordId, payload });
}

function deleteRecord(recordId) {
  return callCoolingService({ action: 'delete', recordId });
}

function resetCooling(recordId) {
  return callCoolingService({ action: 'reset', recordId });
}

function extendCooling(recordId, hours) {
  return callCoolingService({ action: 'extend', recordId, hours });
}

function confirmBuy(recordId) {
  return callCoolingService({ action: 'confirmBuy', recordId });
}

function giveUp(recordId) {
  return callCoolingService({ action: 'giveUp', recordId });
}

function cancelRecord(recordId) {
  return callCoolingService({ action: 'cancel', recordId });
}

module.exports = {
  getRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  resetCooling,
  extendCooling,
  confirmBuy,
  giveUp,
  cancelRecord,
};
