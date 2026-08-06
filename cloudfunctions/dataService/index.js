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

  return {
    openid,
    error: 'Unknown action: ' + action,
  };
};
