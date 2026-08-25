let lastLogin = null;

function isReady() {
  return !!wx.cloud;
}

function callDataService(data) {
  if (!isReady()) {
    return Promise.reject(new Error('当前基础库不支持云能力'));
  }
  // 所有云端读写集中到 dataService，便于后续统一加重试、离线队列或错误上报。
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
  // login 同时承担拉取完整业务状态的职责，返回 user + plans。
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
  // 兼容旧版整包保存接口；新增/更新/删除计划优先使用下面的计划级接口。
  return callDataService({ action: 'savePlans', plans }).then((result) => {
    cacheLogin(result);
    return result;
  });
}

function addPlan(plan) {
  // 计划级写入，避免每次新增都从客户端覆盖全部 plans。
  return callDataService({ action: 'addPlan', plan }).then((result) => {
    cacheLogin(result);
    return result;
  });
}

function updatePlan(planId, updates) {
  // 只提交被修改计划的增量字段，云端负责合并为完整计划快照。
  return callDataService({ action: 'updatePlan', planId, updates }).then((result) => {
    cacheLogin(result);
    return result;
  });
}

function deletePlan(planId) {
  // 删除单个计划文档，避免整包过滤保存造成并发覆盖。
  return callDataService({ action: 'deletePlan', planId }).then((result) => {
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

// ==================== 新增接口（优化云函数调用） ====================

/**
 * 获取单个计划详情（避免拉取全部计划）
 * @param {string} planId 计划ID
 * @returns {Promise<object>} { openid, user, plan }
 */
function getPlanById(planId) {
  return callDataService({ action: 'getPlanById', planId }).then((result) => {
    cacheLogin(result);
    return result;
  });
}

/**
 * 原子化打卡操作（合并读+算+写为单次调用）
 * @param {string} planId 计划ID
 * @param {number} periodIndex 期数索引
 * @param {object} periodData 期数数据 { savedAmount, date, note, completePlan }
 * @returns {Promise<object>} { openid, plan } 更新后的完整计划
 */
function updatePeriod(planId, periodIndex, periodData) {
  return callDataService({
    action: 'updatePeriod',
    planId,
    periodIndex,
    periodData: periodData || {},
  }).then((result) => {
    cacheLogin(result);
    return result;
  });
}

/**
 * 原子化重启计划操作（合并读+算+写为单次调用）
 * @param {string} planId 计划ID
 * @returns {Promise<object>} { openid, plan } 重启后的完整计划
 */
function restartPlan(planId) {
  return callDataService({ action: 'restartPlan', planId }).then((result) => {
    cacheLogin(result);
    return result;
  });
}

module.exports = {
  getLoginState,
  login,
  saveUser,
  savePlans,
  addPlan,
  updatePlan,
  deletePlan,
  clearPlans,
  // 新增优化接口
  getPlanById,
  updatePeriod,
  restartPlan,
};
