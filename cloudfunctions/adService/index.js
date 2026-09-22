const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const PLAN_COLLECTION = 'plans';
const AD_REWARD_COLLECTION = 'ad_reward_logs';
const AD_QUOTA_COLLECTION = 'ad_user_quota';
const PLAN_ADD_AD_UNIT = 'adunit-f86047ca07ec5daa';
const FREE_PLAN_LIMIT = 3;

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (err) {
    if (!String(err.errMsg || '').includes('collection exists')) {
      console.warn('创建集合失败：' + name, err);
    }
  }
}

async function getPlanCount(openid) {
  await ensureCollection(PLAN_COLLECTION);
  const pageSize = 100;
  let skip = 0;
  let total = 0;

  while (true) {
    const res = await db.collection(PLAN_COLLECTION)
      .where({ openid })
      .skip(skip)
      .limit(pageSize)
      .get();
    const rows = res.data || [];
    total += rows.length;
    if (rows.length < pageSize) break;
    skip += pageSize;
  }

  return total;
}

function normalizeQuotaDoc(doc) {
  const quota = Object.assign({}, doc || {});
  quota.plan_add_quota = Number(quota.plan_add_quota) > 0 ? Number(quota.plan_add_quota) : 0;
  quota.updatedAt = quota.updatedAt || null;
  return quota;
}

async function getQuotaDoc(openid) {
  await ensureCollection(AD_QUOTA_COLLECTION);
  try {
    const res = await db.collection(AD_QUOTA_COLLECTION).doc(openid).get();
    return normalizeQuotaDoc(res.data);
  } catch (err) {
    const initial = {
      openid,
      plan_add_quota: 0,
      updatedAt: db.serverDate(),
    };
    await db.collection(AD_QUOTA_COLLECTION).doc(openid).set({ data: initial });
    return normalizeQuotaDoc(initial);
  }
}

async function setQuotaDoc(openid, quotaDoc) {
  const next = {
    openid,
    plan_add_quota: Number(quotaDoc.plan_add_quota) > 0 ? Number(quotaDoc.plan_add_quota) : 0,
    updatedAt: db.serverDate(),
  };
  await db.collection(AD_QUOTA_COLLECTION).doc(openid).set({ data: next });
  return next;
}

function buildPlanLimitInfo(usedPlanCount, extraPlanQuota) {
  const freePlanLimit = FREE_PLAN_LIMIT;
  const needAd = usedPlanCount >= freePlanLimit && extraPlanQuota <= 0;
  return {
    freePlanLimit,
    usedPlanCount,
    extraPlanQuota,
    needAd,
  };
}

async function addAdRewardLog(openid, payload) {
  await ensureCollection(AD_REWARD_COLLECTION);
  const rewardToken = payload.rewardToken ? String(payload.rewardToken) : '';
  const scene = payload.scene || 'plan_add_unlock';
  const logId = rewardToken ? `${openid}_${scene}_${rewardToken}` : `${openid}_${scene}_${Date.now()}`;

  try {
    await db.collection(AD_REWARD_COLLECTION).doc(logId).set({
      data: {
        openid,
        scene,
        adUnitId: payload.adUnitId || '',
        rewardContent: payload.rewardContent || 'plan_add_quota:+1',
        rewardGranted: true,
        consumed: false,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    });
    return { duplicated: false };
  } catch (err) {
    if (String(err.errMsg || '').includes('already exists')) {
      return { duplicated: true };
    }
    throw err;
  }
}

async function getPlanAddAccess(openid) {
  const usedPlanCount = await getPlanCount(openid);
  const quotaDoc = await getQuotaDoc(openid);
  const planLimit = buildPlanLimitInfo(usedPlanCount, quotaDoc.plan_add_quota);

  return {
    openid,
    planLimit,
  };
}

async function grantPlanAddQuotaByAd(openid, event) {
  const adUnitId = event && event.adUnitId ? String(event.adUnitId) : '';
  if (adUnitId && adUnitId !== PLAN_ADD_AD_UNIT) {
    return { openid, error: 'INVALID_AD_UNIT' };
  }

  const logResult = await addAdRewardLog(openid, {
    scene: 'plan_add_unlock',
    adUnitId: adUnitId || PLAN_ADD_AD_UNIT,
    rewardContent: 'plan_add_quota:+1',
    rewardToken: event && event.rewardToken,
  });

  if (logResult.duplicated) {
    const access = await getPlanAddAccess(openid);
    return Object.assign({}, access, {
      rewarded: false,
      duplicated: true,
    });
  }

  const quotaDoc = await getQuotaDoc(openid);
  quotaDoc.plan_add_quota += 1;
  await setQuotaDoc(openid, quotaDoc);
  const access = await getPlanAddAccess(openid);

  return Object.assign({}, access, {
    rewarded: true,
    duplicated: false,
  });
}

async function consumePlanAddQuota(openid) {
  const usedPlanCount = await getPlanCount(openid);
  const quotaDoc = await getQuotaDoc(openid);
  const freePlanLimit = FREE_PLAN_LIMIT;

  if (usedPlanCount < freePlanLimit) {
    return {
      openid,
      allowed: true,
      consumed: false,
      planLimit: buildPlanLimitInfo(usedPlanCount, quotaDoc.plan_add_quota),
    };
  }

  if (quotaDoc.plan_add_quota <= 0) {
    return {
      openid,
      allowed: false,
      consumed: false,
      planLimit: buildPlanLimitInfo(usedPlanCount, quotaDoc.plan_add_quota),
    };
  }

  quotaDoc.plan_add_quota -= 1;
  await setQuotaDoc(openid, quotaDoc);
  return {
    openid,
    allowed: true,
    consumed: true,
    planLimit: buildPlanLimitInfo(usedPlanCount, quotaDoc.plan_add_quota),
  };
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action || '';

  if (action === 'getPlanAddAccess') {
    return getPlanAddAccess(openid);
  }

  if (action === 'grantPlanAddQuotaByAd') {
    return grantPlanAddQuotaByAd(openid, event || {});
  }

  if (action === 'consumePlanAddQuota') {
    return consumePlanAddQuota(openid);
  }

  return {
    openid,
    error: 'Unknown action: ' + action,
  };
};
