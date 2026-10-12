function isReady() {
  return !!wx.cloud;
}

function callLightLedgerService(data) {
  if (!isReady()) {
    return Promise.reject(new Error('当前基础库不支持云能力'));
  }
  return wx.cloud.callFunction({
    name: 'lightLedgerService',
    data,
  }).then((res) => res.result || {});
}

function getHomeData(payload) {
  return callLightLedgerService({ action: 'getHomeData', payload: payload || {} });
}

function getBooks() {
  return callLightLedgerService({ action: 'getBooks' });
}

function createBook(payload) {
  return callLightLedgerService({ action: 'createBook', payload: payload || {} });
}

function updateBook(bookId, payload) {
  return callLightLedgerService({ action: 'updateBook', bookId, payload: payload || {} });
}

function deleteBook(bookId) {
  return callLightLedgerService({ action: 'deleteBook', bookId });
}

function setCurrentBook(bookId) {
  return callLightLedgerService({ action: 'setCurrentBook', bookId });
}

function saveBill(payload) {
  return callLightLedgerService({ action: 'saveBill', payload: payload || {} });
}

function deleteBill(billId) {
  return callLightLedgerService({ action: 'deleteBill', billId });
}

function getAllBills(payload) {
  return callLightLedgerService({ action: 'getAllBills', payload: payload || {} });
}

function createBillFromCooling(payload) {
  return callLightLedgerService({ action: 'createBillFromCooling', payload: payload || {} });
}

module.exports = {
  getHomeData,
  getBooks,
  createBook,
  updateBook,
  deleteBook,
  setCurrentBook,
  saveBill,
  deleteBill,
  getAllBills,
  createBillFromCooling,
};
