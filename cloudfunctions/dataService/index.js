const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const USER_COLLECTION = 'users';
const PLAN_COLLECTION = 'plans';

function getDefaultUser() {
  return {
    nickName: '存钱达人',
    avatarUrl: '',
    savingDays: 0,
  };
}

function getDefaultState(openid) {
  return {
    openid,
    user: getDefaultUser(),
    plans: [],
    updatedAt: db.serverDate(),
  };
}

function getPlanDocId(openid, planId) {
  // 用 openid 拼接计划 id，避免不同用户创建同名计划时文档 id 冲突。
  return openid + '_' + planId;
}

async function ensureCollection(name) {
  // 云开发没有显式迁移脚本，这里按需创建集合，重复创建时忽略 exists 错误。
  try {
    await db.createCollection(name);
  } catch (err) {
    if (!String(err.errMsg || '').includes('collection exists')) {
      console.warn('创建集合失败：' + name, err);
    }
  }
}

async function getUserState(openid) {
  try {
    const res = await db.collection(USER_COLLECTION).doc(openid).get();
    return res.data;
  } catch (err) {
    // 首次登录时初始化用户文档；计划数据会单独存到 plans 集合。
    await ensureCollection(USER_COLLECTION);
    const state = getDefaultState(openid);
    await db.collection(USER_COLLECTION).doc(openid).set({
      data: state,
    });
    return state;
  }
}

async function updateUserState(openid, data) {
  const state = await getUserState(openid);
  const next = Object.assign({}, state, data, {
    openid,
    updatedAt: db.serverDate(),
  });
  delete next._id;
  await db.collection(USER_COLLECTION).doc(openid).set({
    data: next,
  });
  return next;
}

function toClientPlan(doc) {
  // plans 集合里的服务端字段不暴露给前端，前端只关心计划本体。
  const plan = Object.assign({}, doc);
  delete plan._id;
  delete plan.openid;
  delete plan.sortOrder;
  delete plan.updatedAt;
  return plan;
}

async function getPlanDocs(openid) {
  await ensureCollection(PLAN_COLLECTION);
  const pageSize = 100;
  let skip = 0;
  let docs = [];

  while (true) {
    // 云数据库单次查询有数量限制，分页拉取保证计划较多时也能完整返回。
    const res = await db.collection(PLAN_COLLECTION)
      .where({ openid })
      .orderBy('sortOrder', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();
    docs = docs.concat(res.data || []);
    if (!res.data || res.data.length < pageSize) break;
    skip += pageSize;
  }

  return docs;
}

async function getPlans(openid) {
  const docs = await getPlanDocs(openid);
  return docs.map(toClientPlan);
}

async function setPlan(openid, plan, sortOrder) {
  // 所有计划写入都走 set，既支持新增，也支持覆盖单个计划的完整快照。
  const planId = plan && plan.id ? plan.id : 'plan_' + Date.now();
  const data = Object.assign({}, plan, {
    id: planId,
    openid,
    sortOrder: sortOrder !== undefined ? sortOrder : Date.now(),
    updatedAt: db.serverDate(),
  });
  delete data._id;
  await db.collection(PLAN_COLLECTION).doc(getPlanDocId(openid, planId)).set({
    data,
  });
  return toClientPlan(data);
}

async function migrateLegacyPlans(openid, state, currentPlans) {
  // 旧版本把 plans 整包存在 users 文档里；新版本首次读取时迁移到 plans 集合。
  const legacyPlans = state && Array.isArray(state.plans) ? state.plans : [];
  if (currentPlans.length || !legacyPlans.length) return currentPlans;

  const baseSort = Date.now();
  for (let i = 0; i < legacyPlans.length; i++) {
    await setPlan(openid, legacyPlans[i], baseSort + legacyPlans.length - i);
  }

  return getPlans(openid);
}

async function getFullState(openid) {
  // 前端仍以 { user, plans } 消费数据，云函数内部负责屏蔽新旧存储结构差异。
  const state = await getUserState(openid);
  const plans = await migrateLegacyPlans(openid, state, await getPlans(openid));
  return {
    openid,
    user: state.user || getDefaultUser(),
    plans,
  };
}

async function replacePlans(openid, plans) {
  // 保留整包替换接口给“清空数据”和旧前端兼容使用；日常更新应走计划级接口。
  await ensureCollection(PLAN_COLLECTION);
  await db.collection(PLAN_COLLECTION).where({ openid }).remove();

  const nextPlans = Array.isArray(plans) ? plans : [];
  const baseSort = Date.now();
  for (let i = 0; i < nextPlans.length; i++) {
    await setPlan(openid, nextPlans[i], baseSort + nextPlans.length - i);
  }

  await updateUserState(openid, { plans: [] });
  return getFullState(openid);
}

async function addPlan(openid, plan) {
  await getFullState(openid);
  const savedPlan = await setPlan(openid, plan, Date.now());
  const state = await getFullState(openid);
  return Object.assign({}, state, { plan: savedPlan });
}

async function updatePlan(openid, planId, updates) {
  // 更新计划时保留原 sortOrder，避免打卡/暂停等操作意外改变列表顺序。
  await getFullState(openid);
  const planDocs = await getPlanDocs(openid);
  const currentDoc = planDocs.find((plan) => plan.id === planId);
  const current = currentDoc ? toClientPlan(currentDoc) : null;
  if (!current) {
    const state = await getFullState(openid);
    return Object.assign({}, state, { plan: null });
  }

  const nextPlan = Object.assign({}, current, updates || {}, {
    id: planId,
  });
  const savedPlan = await setPlan(openid, nextPlan, currentDoc.sortOrder);
  const nextState = await getFullState(openid);
  return Object.assign({}, nextState, { plan: savedPlan });
}

async function deletePlan(openid, planId) {
  await getFullState(openid);
  try {
    await db.collection(PLAN_COLLECTION).doc(getPlanDocId(openid, planId)).remove();
  } catch (err) {
    console.warn('删除计划失败', err);
  }
  return getFullState(openid);
}

// ==================== 新增接口：优化云函数调用次数 ====================

/**
 * 获取单个计划详情（避免拉取全部计划）
 * @param {string} openid 用户openid
 * @param {string} planId 计划ID
 * @returns {object} { openid, user, plan }
 */
async function getPlanById(openid, planId) {
  try {
    const docId = getPlanDocId(openid, planId);
    const res = await db.collection(PLAN_COLLECTION).doc(docId).get();
    const plan = toClientPlan(res.data);

    // 只获取用户信息，不获取全部 plans
    const state = await getUserState(openid);
    return {
      openid,
      user: state.user || getDefaultUser(),
      plan,
    };
  } catch (err) {
    // 计划不存在时返回 null
    if (err.errMsg && err.errMsg.includes('doc not exist')) {
      const state = await getUserState(openid);
      return {
        openid,
        user: state.user || getDefaultUser(),
        plan: null,
      };
    }
    console.warn('查询单个计划失败', err);
    throw err;
  }
}

/**
 * 原子化打卡操作：合并读取→计算→写入为单次调用
 * @param {string} openid 用户openid
 * @param {string} planId 计划ID
 * @param {number} periodIndex 期数索引
 * @param {object} periodData 期数更新数据 { savedAmount, date, note, completePlan }
 * @returns {object} { openid, plan } 更新后的完整计划
 */
async function updatePeriodAction(openid, planId, periodIndex, periodData) {
  // 1. 读取单个计划的文档（保留 sortOrder）
  const planDocs = await getPlanDocs(openid);
  const currentDoc = planDocs.find((p) => p.id === planId);
  if (!currentDoc) {
    return { plan: null };
  }

  const current = toClientPlan(currentDoc);

  // 2. 找到目标期数
  const period = (current.periods || []).find((p) => p.index === periodIndex);
  if (!period) {
    console.warn(`未找到期数: planId=${planId}, index=${periodIndex}`);
    return { plan: null };
  }

  // 3. 合并更新数据（金额计算逻辑与前端保持一致）
  const savedAmount = periodData.savedAmount !== undefined
    ? Number(periodData.savedAmount)
    : (Number(period.savedAmount) || 0);

  const updatedPeriod = Object.assign({}, period, periodData, {
    savedAmount,
    completed: savedAmount > 0,
  });

  // 删除临时控制字段
  delete updatedPeriod.completePlan;

  // 4. 重算后续未完成期数的期望金额（保持目标可达）
  const periods = rebalancePeriodsForCloud(current, updatedPeriod);
  const updates = { periods };

  // 5. 如果标记完成计划，设置完成状态
  if (periodData.completePlan) {
    updates.completed = true;
    updates.completedAt = new Date().toISOString();
    updates.paused = false;
    updates.pausedAt = '';
  }

  // 6. 写入数据库并返回结果（无需再次查询！）
  const nextPlan = Object.assign({}, current, updates, { id: planId });
  const savedPlan = await setPlan(openid, nextPlan, currentDoc.sortOrder);

  console.log(`[updatePeriod] 打卡成功`, { openid, planId, periodIndex, savedAmount });

  return {
    openid,
    plan: savedPlan,
  };
}

/**
 * 原子化重启计划操作：合并读取→重算→写入为单次调用
 * @param {string} openid 用户openid
 * @param {string} planId 计划ID
 * @returns {object} { openid, plan } 重启后的完整计划
 */
async function restartPlanAction(openid, planId) {
  // 1. 读取当前计划
  const planDocs = await getPlanDocs(openid);
  const currentDoc = planDocs.find((p) => p.id === planId);
  if (!currentDoc) {
    return { plan: null };
  }

  const current = toClientPlan(currentDoc);

  // 2. 重排未完成的期数日期（从今天开始重新计算）
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const frequency = current.planType === 'daily' ? 1
    : current.planType === 'weekly' ? 7
    : current.planType === 'monthly' ? 30
    : 1; // 默认每日

  let pendingIndex = 0;
  const periods = (current.periods || []).map((period) => {
    if (period.completed) {
      return period; // 已完成的期数保持原日期不变
    }
    // 未完成的期数从今天开始重新计算日期
    const daysToAdd = pendingIndex * frequency;
    const newDate = addDays(today, daysToAdd);
    pendingIndex++;
    return Object.assign({}, period, { date: newDate });
  });

  // 3. 构建更新数据
  const updates = {
    paused: false,
    pausedAt: '',
    restartedAt: new Date().toISOString(),
    periods,
  };

  // 4. 如果是截止日期型计划，自动更新截止日期
  if (current.planType === 'custom_deadline' && current.customConfig) {
    const lastPeriod = periods[periods.length - 1];
    updates.customConfig = Object.assign({}, current.customConfig, {
      endDate: lastPeriod ? lastPeriod.date : (current.customConfig.endDate || today),
    });
  }

  // 5. 写入并返回
  const nextPlan = Object.assign({}, current, updates, { id: planId });
  const savedPlan = await setPlan(openid, nextPlan, currentDoc.sortOrder);

  console.log(`[restartPlan] 重启成功`, { openid, planId });

  return {
    openid,
    plan: savedPlan,
  };
}

// ==================== 云端辅助函数 ====================

/**
 * 云端版期数重算：根据已存入金额调整后续未完成期数的期望金额
 * 简化版本：只做基本的金额分配，复杂逻辑由前端保证一致性
 *
 * @param {object} plan 完整计划对象
 * @param {object} updatedPeriod 已更新的期数
 * @returns {array} 重算后的所有期数数组
 */
function rebalancePeriodsForCloud(plan, updatedPeriod) {
  const periods = (plan.periods || []).map((p) => Object.assign({}, p));

  // 找到更新的期数索引
  const updateIndex = periods.findIndex((p) => p.index === updatedPeriod.index);
  if (updateIndex === -1) return periods;

  // 替换更新的期数
  periods[updateIndex] = updatedPeriod;

  // 计算当前总已存金额
  let totalSaved = 0;
  let completedCount = 0;
  periods.forEach((p) => {
    totalSaved += (Number(p.savedAmount) || 0);
    if (p.completed) completedCount++;
  });

  // 剩余需要达到的目标金额
  const remainingTarget = (Number(plan.targetAmount) || 0) - totalSaved;

  // 后续未完成期数
  const pendingPeriods = periods.filter((p) => !p.completed && p.index > updatedPeriod.index);

  if (pendingPeriods.length > 0 && remainingTarget > 0) {
    // 平均分配剩余目标金额到后续期数
    const avgAmount = Math.ceil(remainingTarget / pendingPeriods.length);
    pendingPeriods.forEach((p) => {
      p.expectedAmount = avgAmount;
    });
  }

  return periods;
}

/**
 * 日期计算辅助函数：给指定日期加上 N 天
 * @param {string} dateStr YYYY-MM-DD 格式日期
 * @param {number} days 要加的天数
 * @returns {string} 新的日期字符串
 */
function addDays(dateStr, days) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action || 'login';

  if (action === 'login' || action === 'getState') {
    return getFullState(openid);
  }

  if (action === 'saveUser') {
    await updateUserState(openid, {
      user: event.user || getDefaultUser(),
    });
    return getFullState(openid);
  }

  if (action === 'savePlans') {
    return replacePlans(openid, event.plans || []);
  }

  if (action === 'addPlan') {
    return addPlan(openid, event.plan || {});
  }

  if (action === 'updatePlan') {
    return updatePlan(openid, event.planId, event.updates || {});
  }

  if (action === 'deletePlan') {
    return deletePlan(openid, event.planId);
  }

  if (action === 'clear') {
    return replacePlans(openid, []);
  }

  // ==================== 新增路由（优化接口） ====================

  if (action === 'getPlanById') {
    return getPlanById(openid, event.planId);
  }

  if (action === 'updatePeriod') {
    return updatePeriodAction(
      openid,
      event.planId,
      event.periodIndex,
      event.periodData || {}
    );
  }

  if (action === 'restartPlan') {
    return restartPlanAction(openid, event.planId);
  }

  return {
    openid,
    error: 'Unknown action: ' + action,
  };
};
