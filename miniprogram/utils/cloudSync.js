let lastLogin = null;

function isReady() {
  return !!wx.cloud;
}

function callDataService(data) {
  if (!isReady()) {
    return Promise.reject(new Error('当前基础库不支持云能力'));
  }
  return wx.cloud.callFunction({
    name: 'dataService',
    data,
  }).then((res) => res.result || {});
}

function cacheLogin(result) {
  lastLogin = {
    openid: result.openid,
    loggedIn: !!result.openid,
  };
  return lastLogin;
}

function getLoginState() {
  return lastLogin || { loggedIn: false, openid: '' };
}

function login() {
  return callDataService({ action: 'login' }).then((result) => {
    cacheLogin(result);
    return result;
  });
}

function saveUser(user) {
  return callDataService({ action: 'saveUser', user }).then((result) => {
    cacheLogin(result);
    return result;
  });
}

function savePlans(plans) {
  return callDataService({ action: 'savePlans', plans }).then((result) => {
    cacheLogin(result);
    return result;
  });
}

function clearPlans() {
  return callDataService({ action: 'clear' }).then((result) => {
    cacheLogin(result);
    return result;
  });
}

module.exports = {
  getLoginState,
  login,
  saveUser,
  savePlans,
  clearPlans,
};
