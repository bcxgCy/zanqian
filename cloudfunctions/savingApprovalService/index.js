const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

const APPROVAL_COLLECTION = 'saving_approvals';

const STATUS_TEXT_MAP = {
  voting: '投票中',
  result: '已出结果',
  abandoned: '已放弃',
  purchased: '已购买',
};

const VOTE_OPTIONS = {
  buy: '值得买',
  reject: '没必要买',
  alternative: '可以买但找替代',
  wait: '建议再等等',
};

function safeNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function nowTs() {
  return Date.now();
}

function normalizeText(value, maxLen) {
  const text = String(value || '').trim();
  return text.slice(0, maxLen);
}

function inferImageContentType(fileID) {
  const lower = String(fileID || '').toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.gif')) return 'image/gif';
  return 'image/jpeg';
}

async function checkImageSecurity(fileID, fieldName) {
  if (!fileID) return;
  try {
    const downloadRes = await cloud.downloadFile({ fileID });
    const buffer = downloadRes && downloadRes.fileContent;
    if (!buffer) {
      throw new Error((fieldName || '图片') + '读取失败');
    }
    await cloud.openapi.security.imgSecCheck({
      media: {
        contentType: inferImageContentType(fileID),
        value: buffer,
      },
    });
  } catch (err) {
    const msg = String((err && err.errMsg) || err.message || '');
    if (msg.includes('risky content')) {
      throw new Error((fieldName || '图片') + '包含敏感内容，请更换后再提交');
    }
    throw new Error((fieldName || '图片') + '安全校验失败，请稍后重试');
  }
}

async function checkImagesSecurity(fileIDs, fieldName) {
  const list = Array.isArray(fileIDs) ? fileIDs.filter(Boolean) : [];
  for (let i = 0; i < list.length; i++) {
    await checkImageSecurity(list[i], fieldName);
  }
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

async function checkTextsSecurity(items) {
  const list = Array.isArray(items) ? items : [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i] || {};
    await checkTextSecurity(item.text, item.fieldName);
  }
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (err) {
    if (!String(err.errMsg || '').includes('collection exists')) {
      console.warn('创建集合失败：' + name, err);
    }
  }
}

function getRuntimeStatus(doc) {
  if (doc.finalDecision === 'abandoned') return 'abandoned';
  if (doc.finalDecision === 'purchased') return 'purchased';

  const votes = Array.isArray(doc.reviews) ? doc.reviews.length : 0;
  const targetVotes = safeNumber(doc.targetVotes, 1);
  if (votes >= targetVotes) return 'result';

  return 'voting';
}

function getVoteStats(doc) {
  const reviews = Array.isArray(doc.reviews) ? doc.reviews : [];
  const stats = {
    buy: 0,
    reject: 0,
    alternative: 0,
    wait: 0,
  };
  reviews.forEach((item) => {
    if (stats[item.vote] !== undefined) {
      stats[item.vote] += 1;
    }
  });
  return stats;
}

function toListItem(doc) {
  const status = getRuntimeStatus(doc);
  return {
    id: doc._id,
    name: doc.itemName,
    price: safeNumber(doc.price, 0),
    reason: doc.reason || '',
    status,
    statusText: STATUS_TEXT_MAP[status] || '未知状态',
    createdAt: safeNumber(doc.createdAt, 0),
    updatedAt: safeNumber(doc.updatedAt, 0),
  };
}

function toHomeOngoingItem(doc) {
  const status = getRuntimeStatus(doc);
  return {
    id: doc._id,
    itemName: doc.itemName,
    price: safeNumber(doc.price, 0),
    statusText: STATUS_TEXT_MAP[status] || '未知状态',
    updatedAt: safeNumber(doc.updatedAt, 0),
  };
}

function toDetail(doc) {
  const status = getRuntimeStatus(doc);
  const voteStats = getVoteStats(doc);
  const reviews = Array.isArray(doc.reviews) ? doc.reviews : [];

  return {
    id: doc._id,
    name: doc.itemName,
    price: safeNumber(doc.price, 0),
    status,
    statusText: STATUS_TEXT_MAP[status] || '未知状态',
    reason: doc.reason || '',
    alternative: doc.alternative || '',
    images: Array.isArray(doc.images) ? doc.images : [],
    approvalMode: doc.approvalMode || 'single',
    targetVotes: safeNumber(doc.targetVotes, 1),
    passVotes: voteStats.buy,
    rejectVotes: voteStats.reject + voteStats.wait,
    voteStats,
    replies: reviews.map((item) => ({
      id: item.id,
      side: item.vote === 'buy' ? '通过' : '驳回',
      voteText: VOTE_OPTIONS[item.vote] || item.vote,
      user: item.userName || '匿名用户',
      content: item.comment || '',
      alternative: item.alternative || '',
      createdAt: safeNumber(item.createdAt, 0),
    })),
    finalDecision: doc.finalDecision || '',
    createdAt: safeNumber(doc.createdAt, 0),
    updatedAt: safeNumber(doc.updatedAt, 0),
  };
}

function canSubmitReview(doc, openid) {
  if (!doc || !openid) return false;
  if (doc.openid === openid) return false;
  if (doc.finalDecision) return false;
  const reviews = Array.isArray(doc.reviews) ? doc.reviews : [];
  if (reviews.length >= safeNumber(doc.targetVotes, 1)) return false;
  const reviewerOpenids = Array.isArray(doc.reviewerOpenids) ? doc.reviewerOpenids : [];
  if (reviewerOpenids.includes(openid)) return false;
  return true;
}

async function createApproval(openid, payload) {
  await ensureCollection(APPROVAL_COLLECTION);

  const itemName = normalizeText(payload.itemName, 30);
  const price = safeNumber(payload.price, 0);
  const reason = normalizeText(payload.reason, 300);
  const alternative = normalizeText(payload.alternative, 300);
  const approvalMode = payload.approvalMode === 'multi' ? 'multi' : 'single';
  const targetVotes = approvalMode === 'multi'
    ? ([3, 5, 7].includes(safeNumber(payload.multiCount, 3)) ? safeNumber(payload.multiCount, 3) : 3)
    : 1;

  if (!itemName) {
    return { ok: false, error: '物品名称不能为空' };
  }
  if (!price || price <= 0) {
    return { ok: false, error: '价格必须大于0' };
  }

  try {
    await checkTextsSecurity([
      { text: itemName, fieldName: '物品名称' },
      { text: reason, fieldName: '购买理由' },
      { text: alternative, fieldName: '替代方案' },
    ]);
    await checkImagesSecurity(payload.images, '审批图片');
  } catch (err) {
    return { ok: false, error: err.message || '内容校验失败' };
  }

  const ts = nowTs();
  const images = Array.isArray(payload.images) ? payload.images.filter(Boolean).slice(0, 2) : [];

  const doc = {
    openid,
    itemName,
    price,
    reason,
    alternative,
    images,
    approvalMode,
    targetVotes,
    syncToPlaza: !!payload.syncToPlaza,
    reviews: [],
    reviewerOpenids: [],
    finalDecision: '',
    createdAt: ts,
    updatedAt: ts,
  };

  const res = await db.collection(APPROVAL_COLLECTION).add({ data: doc });
  const created = await db.collection(APPROVAL_COLLECTION).doc(res._id).get();
  return {
    ok: true,
    approval: toDetail(created.data),
  };
}

async function getApprovals(openid) {
  await ensureCollection(APPROVAL_COLLECTION);

  const createdRes = await db.collection(APPROVAL_COLLECTION)
    .where({ openid })
    .orderBy('updatedAt', 'desc')
    .limit(60)
    .get();

  const recentRes = await db.collection(APPROVAL_COLLECTION)
    .orderBy('updatedAt', 'desc')
    .limit(200)
    .get();

  const reviewedList = (recentRes.data || [])
    .filter((item) => item.openid !== openid && Array.isArray(item.reviewerOpenids) && item.reviewerOpenids.includes(openid))
    .map(toListItem);

  const createdList = (createdRes.data || []).map(toListItem);

  return {
    ok: true,
    createdList,
    reviewedList,
  };
}

async function getApprovalDetail(openid, approvalId) {
  await ensureCollection(APPROVAL_COLLECTION);
  if (!approvalId) return { ok: false, error: '缺少审批ID' };

  try {
    const res = await db.collection(APPROVAL_COLLECTION).doc(approvalId).get();
    const doc = res.data;
    const detail = toDetail(doc);
    detail.canFinalize = doc.openid === openid && !doc.finalDecision;
    detail.canRevokeFinalDecision = doc.openid === openid && !!doc.finalDecision;
    detail.canReview = canSubmitReview(doc, openid);
    detail.canRevokeReview = doc.openid !== openid
      && !doc.finalDecision
      && Array.isArray(doc.reviewerOpenids)
      && doc.reviewerOpenids.includes(openid);
    return {
      ok: true,
      detail,
    };
  } catch (err) {
    return {
      ok: false,
      error: '审批不存在或已删除',
    };
  }
}

async function submitReview(openid, approvalId, payload) {
  await ensureCollection(APPROVAL_COLLECTION);
  if (!approvalId) return { ok: false, error: '缺少审批ID' };

  const vote = normalizeText(payload.vote, 20);
  if (!['buy', 'reject'].includes(vote)) {
    return { ok: false, error: '请选择通过或驳回' };
  }

  const comment = normalizeText(payload.comment, 300);
  if (!comment) {
    return { ok: false, error: '请填写审批理由' };
  }
  const alternative = normalizeText(payload.alternative, 300);

  try {
    await checkTextsSecurity([
      { text: comment, fieldName: '审批理由' },
      { text: alternative, fieldName: '替代建议' },
    ]);
  } catch (err) {
    return { ok: false, error: err.message || '内容校验失败' };
  }

  const res = await db.collection(APPROVAL_COLLECTION).doc(approvalId).get();
  const doc = res.data;

  if (!canSubmitReview(doc, openid)) {
    return { ok: false, error: '当前状态不可投票或你已投过票' };
  }

  const review = {
    id: 'rv_' + nowTs() + '_' + Math.random().toString(36).slice(2, 6),
    openid,
    userName: '评估用户',
    vote,
    comment,
    alternative,
    createdAt: nowTs(),
  };

  await db.collection(APPROVAL_COLLECTION).doc(approvalId).update({
    data: {
      reviews: _.push([review]),
      reviewerOpenids: _.addToSet(openid),
      updatedAt: nowTs(),
    },
  });

  return getApprovalDetail(openid, approvalId);
}

async function getHomeData(openid) {
  await ensureCollection(APPROVAL_COLLECTION);

  const res = await db.collection(APPROVAL_COLLECTION)
    .where({ openid })
    .orderBy('updatedAt', 'desc')
    .limit(60)
    .get();

  const list = res.data || [];
  const approvalSaved = list.reduce((sum, item) => {
    const status = getRuntimeStatus(item);
    return status === 'abandoned' ? sum + safeNumber(item.price, 0) : sum;
  }, 0);

  const pendingApprovalCount = list.filter((item) => {
    const status = getRuntimeStatus(item);
    return status === 'voting';
  }).length;

  const ongoingApprovals = list
    .filter((item) => {
      const status = getRuntimeStatus(item);
      return status === 'voting';
    })
    .slice(0, 2)
    .map(toHomeOngoingItem);

  return {
    ok: true,
    summary: {
      approvalSaved,
      pendingApprovalCount,
    },
    ongoingApprovals,
  };
}

async function setFinalDecision(openid, approvalId, decision) {
  await ensureCollection(APPROVAL_COLLECTION);
  if (!approvalId) return { ok: false, error: '缺少审批ID' };
  if (!['abandoned', 'purchased'].includes(decision)) {
    return { ok: false, error: '非法的决策结果' };
  }

  const docRes = await db.collection(APPROVAL_COLLECTION).doc(approvalId).get();
  const doc = docRes.data;
  if (doc.openid !== openid) {
    return { ok: false, error: '只有发起人可以确认最终结果' };
  }

  await db.collection(APPROVAL_COLLECTION).doc(approvalId).update({
    data: {
      finalDecision: decision,
      syncToPlaza: false,
      updatedAt: nowTs(),
    },
  });

  return getApprovalDetail(openid, approvalId);
}

async function revokeFinalDecision(openid, approvalId) {
  await ensureCollection(APPROVAL_COLLECTION);
  if (!approvalId) return { ok: false, error: '缺少审批ID' };

  const docRes = await db.collection(APPROVAL_COLLECTION).doc(approvalId).get();
  const doc = docRes.data;
  if (doc.openid !== openid) {
    return { ok: false, error: '只有发起人可以撤销最终结果' };
  }
  if (!doc.finalDecision) {
    return { ok: false, error: '当前没有可撤销的最终结果' };
  }

  await db.collection(APPROVAL_COLLECTION).doc(approvalId).update({
    data: {
      finalDecision: '',
      updatedAt: nowTs(),
    },
  });

  return getApprovalDetail(openid, approvalId);
}

async function revokeReview(openid, approvalId) {
  await ensureCollection(APPROVAL_COLLECTION);
  if (!approvalId) return { ok: false, error: '缺少审批ID' };

  const docRes = await db.collection(APPROVAL_COLLECTION).doc(approvalId).get();
  const doc = docRes.data;
  if (doc.openid === openid) {
    return { ok: false, error: '发起人没有可撤销的评估记录' };
  }
  if (doc.finalDecision) {
    return { ok: false, error: '审批已结束，不能撤销评估' };
  }

  const reviews = Array.isArray(doc.reviews) ? doc.reviews : [];
  const reviewerOpenids = Array.isArray(doc.reviewerOpenids) ? doc.reviewerOpenids : [];
  const hasReviewed = reviewerOpenids.includes(openid);
  if (!hasReviewed) {
    return { ok: false, error: '你还没有评估记录可撤销' };
  }

  const nextReviews = reviews.filter((item) => item.openid !== openid);
  const nextReviewerOpenids = reviewerOpenids.filter((item) => item !== openid);

  await db.collection(APPROVAL_COLLECTION).doc(approvalId).update({
    data: {
      reviews: nextReviews,
      reviewerOpenids: nextReviewerOpenids,
      updatedAt: nowTs(),
    },
  });

  return getApprovalDetail(openid, approvalId);
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action || '';

  if (action === 'createApproval') {
    return createApproval(openid, event.payload || {});
  }

  if (action === 'getApprovals') {
    return getApprovals(openid);
  }

  if (action === 'getApprovalDetail') {
    return getApprovalDetail(openid, event.approvalId);
  }

  if (action === 'getHomeData') {
    return getHomeData(openid);
  }

  if (action === 'setFinalDecision') {
    return setFinalDecision(openid, event.approvalId, event.decision);
  }

  if (action === 'submitReview') {
    return submitReview(openid, event.approvalId, event.payload || {});
  }

  if (action === 'revokeFinalDecision') {
    return revokeFinalDecision(openid, event.approvalId);
  }

  if (action === 'revokeReview') {
    return revokeReview(openid, event.approvalId);
  }

  return {
    ok: false,
    error: 'Unknown action: ' + action,
  };
};
