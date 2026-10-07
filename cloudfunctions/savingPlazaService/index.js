const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

const APPROVAL_COLLECTION = 'saving_approvals';
const CHALLENGE_COLLECTION = 'saving_challenges';
const ensuredCollections = {};

function nowTs() {
  return Date.now();
}

function safeNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeText(value, maxLen) {
  return String(value || '').trim().slice(0, maxLen);
}

async function checkTextSecurity(text, fieldName) {
  const content = normalizeText(text, 2000);
  if (!content) return;
  try {
    await cloud.openapi.security.msgSecCheck({ content });
  } catch (err) {
    const msg = String((err && err.errMsg) || '');
    if (msg.includes('risky content')) {
      throw new Error((fieldName || '文本') + '包含敏感内容，请修改后再提交');
    }
    throw new Error((fieldName || '文本') + '安全校验失败，请稍后重试');
  }
}

async function ensureCollection(name) {
  if (ensuredCollections[name]) return;
  try {
    await db.createCollection(name);
    ensuredCollections[name] = true;
  } catch (err) {
    const msg = String(err.errMsg || '');
    if (msg.includes('collection exists')) {
      ensuredCollections[name] = true;
      return;
    }
    if (!msg.includes('collection exists')) {
      console.warn('创建集合失败：' + name, err);
    }
  }
}

function buildNick(openid) {
  return '用户' + String(openid || '').slice(-4);
}

function getApprovalStatus(doc) {
  if (doc.finalDecision === 'abandoned') return '已放弃';
  if (doc.finalDecision === 'purchased') return '已购买';
  if ((doc.reviews || []).length >= safeNumber(doc.targetVotes, 1)) return '已出结果';
  return '投票中';
}

function isApprovalInProgress(doc) {
  if (doc.finalDecision) return false;
  return getApprovalStatus(doc) === '投票中';
}

function isChallengeInProgress(doc) {
  const checkinMap = doc.checkinMap || {};
  const checkedDays = Object.keys(checkinMap).filter((key) => checkinMap[key] === 'checked' || checkinMap[key] === 'repair').length;
  const totalDays = Math.max(1, safeNumber(doc.days, 1));
  return checkedDays < totalDays;
}

function toPlazaApproval(doc, openid) {
  const voteCount = Array.isArray(doc.reviews) ? doc.reviews.length : 0;
  const targetVotes = Math.max(1, safeNumber(doc.targetVotes, 1));
  const reviewerOpenids = Array.isArray(doc.reviewerOpenids) ? doc.reviewerOpenids : [];
  return {
    id: doc._id,
    type: 'approval',
    author: buildNick(doc.openid),
    mine: doc.openid === openid,
    title: doc.itemName || '消费审批',
    desc: doc.reason || '',
    price: safeNumber(doc.price, 0),
    statusText: getApprovalStatus(doc),
    reviewedByMe: reviewerOpenids.includes(openid),
    voteCount,
    targetVotes,
    createdAt: safeNumber(doc.createdAt, 0),
    updatedAt: safeNumber(doc.updatedAt, 0),
  };
}

function toPlazaChallenge(doc, openid) {
  const checkinMap = doc.checkinMap || {};
  const checkedDays = Object.keys(checkinMap).filter((key) => checkinMap[key] === 'checked' || checkinMap[key] === 'repair').length;
  return {
    id: doc._id,
    type: 'challenge',
    author: buildNick(doc.openid),
    mine: doc.openid === openid,
    title: doc.name || '省钱挑战',
    desc: doc.note || '',
    periodDays: safeNumber(doc.days, 0),
    dailyAmount: safeNumber(doc.dailyAmount, 0),
    checkedDays,
    likeCount: safeNumber(doc.likeCount, 0),
    liked: Array.isArray(doc.likedOpenids) && doc.likedOpenids.includes(openid),
    createdAt: safeNumber(doc.createdAt, 0),
    updatedAt: safeNumber(doc.updatedAt, 0),
  };
}

async function createChallenge(openid, payload) {
  await ensureCollection(CHALLENGE_COLLECTION);

  const name = normalizeText(payload.name, 40);
  const days = safeNumber(payload.days, 0);
  const dailyAmount = safeNumber(payload.dailyAmount, 0);

  if (!name) return { ok: false, error: '挑战名称不能为空' };
  if (!days || days <= 0 || days > 365) return { ok: false, error: '挑战周期不合法' };
  if (!dailyAmount || dailyAmount <= 0) return { ok: false, error: '每日预估省钱不合法' };

  try {
    await checkTextSecurity(name, '挑战名称');
    await checkTextSecurity(payload.note, '挑战说明');
  } catch (err) {
    return { ok: false, error: err.message || '内容校验失败' };
  }

  const ts = nowTs();
  const doc = {
    openid,
    name,
    days,
    dailyAmount,
    note: normalizeText(payload.note, 300),
    syncToPlaza: !!payload.syncToPlaza,
    likeCount: 0,
    likedOpenids: [],
    createdAt: ts,
    updatedAt: ts,
  };

  const res = await db.collection(CHALLENGE_COLLECTION).add({ data: doc });
  return {
    ok: true,
    challengeId: res._id,
  };
}

async function getPlazaFeed(openid, page, pageSize) {
  await ensureCollection(APPROVAL_COLLECTION);
  await ensureCollection(CHALLENGE_COLLECTION);

  const currentPage = Math.max(1, safeNumber(page, 1));
  const size = Math.min(30, Math.max(10, safeNumber(pageSize, 20)));
  const needCount = currentPage * size;
  const perCollectionLimit = Math.min(120, Math.max(size * 2, needCount + 10));

  const [approvalRes, challengeRes] = await Promise.all([
    db.collection(APPROVAL_COLLECTION)
      .where({ syncToPlaza: true })
      .orderBy('updatedAt', 'desc')
      .limit(perCollectionLimit)
      .get(),
    db.collection(CHALLENGE_COLLECTION)
      .where({ syncToPlaza: true })
      .orderBy('updatedAt', 'desc')
      .limit(perCollectionLimit)
      .get(),
  ]);

  const merged = [];
  (approvalRes.data || [])
    .filter(isApprovalInProgress)
    .forEach((doc) => merged.push(toPlazaApproval(doc, openid)));

  (challengeRes.data || [])
    .filter(isChallengeInProgress)
    .forEach((doc) => merged.push(toPlazaChallenge(doc, openid)));

  merged.sort((a, b) => b.updatedAt - a.updatedAt);

  const start = (currentPage - 1) * size;
  const end = start + size;
  const list = merged.slice(start, end);

  return {
    ok: true,
    list,
    page: currentPage,
    hasMore: end < merged.length,
  };
}

async function toggleChallengeLike(openid, challengeId) {
  await ensureCollection(CHALLENGE_COLLECTION);
  if (!challengeId) return { ok: false, error: '缺少挑战ID' };

  const res = await db.collection(CHALLENGE_COLLECTION).doc(challengeId).get();
  const doc = res.data;
  if (doc.openid === openid) {
    return { ok: false, error: '不能给自己的挑战点赞' };
  }

  const likedOpenids = Array.isArray(doc.likedOpenids) ? doc.likedOpenids : [];
  const liked = likedOpenids.includes(openid);

  if (liked) {
    const nextLikedOpenids = likedOpenids.filter((item) => item !== openid);
    await db.collection(CHALLENGE_COLLECTION).doc(challengeId).update({
      data: {
        likedOpenids: nextLikedOpenids,
        likeCount: Math.max(0, safeNumber(doc.likeCount, 0) - 1),
        updatedAt: nowTs(),
      },
    });
    return { ok: true, liked: false };
  }

  await db.collection(CHALLENGE_COLLECTION).doc(challengeId).update({
    data: {
      likedOpenids: _.addToSet(openid),
      likeCount: _.inc(1),
      updatedAt: nowTs(),
    },
  });

  return { ok: true, liked: true };
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action || '';

  if (action === 'createChallenge') {
    return createChallenge(openid, event.payload || {});
  }

  if (action === 'getPlazaFeed') {
    return getPlazaFeed(openid, event.page, event.pageSize);
  }

  if (action === 'toggleChallengeLike') {
    return toggleChallengeLike(openid, event.challengeId);
  }

  return {
    ok: false,
    error: 'Unknown action: ' + action,
  };
};
