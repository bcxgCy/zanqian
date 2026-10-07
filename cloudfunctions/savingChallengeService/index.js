const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const CHALLENGE_COLLECTION = 'saving_challenges';

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

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromDateKey(key) {
  const [y, m, d] = String(key || '').split('-').map((item) => Number(item));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function addDays(dateKey, offset) {
  const date = fromDateKey(dateKey);
  if (!date) return dateKey;
  date.setDate(date.getDate() + offset);
  return toDateKey(date);
}

function diffDays(fromKey, toKey) {
  const from = fromDateKey(fromKey);
  const to = fromDateKey(toKey);
  if (!from || !to) return 0;
  const delta = to.getTime() - from.getTime();
  return Math.floor(delta / 86400000);
}

function getTodayKey() {
  return toDateKey(new Date());
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

function getChallengeStatus(doc) {
  const todayKey = getTodayKey();
  const endDate = doc.endDate || addDays(doc.startDate, safeNumber(doc.days, 1) - 1);
  const checkinMap = doc.checkinMap || {};
  const checkedCount = Object.keys(checkinMap).filter((key) => checkinMap[key] === 'checked' || checkinMap[key] === 'repair').length;

  if (checkedCount >= safeNumber(doc.days, 1)) return 'success';
  if (todayKey > endDate) return 'failed';
  return 'ongoing';
}

function getSavedAmount(doc) {
  const checkinMap = doc.checkinMap || {};
  const checkedCount = Object.keys(checkinMap).filter((key) => checkinMap[key] === 'checked' || checkinMap[key] === 'repair').length;
  return checkedCount * safeNumber(doc.dailyAmount, 0);
}

function getStreakDays(doc) {
  const checkinMap = doc.checkinMap || {};
  const todayKey = getTodayKey();
  let streak = 0;

  for (let offset = 0; offset < safeNumber(doc.days, 1); offset++) {
    const key = addDays(todayKey, -offset);
    if (key < doc.startDate || key > doc.endDate) continue;
    const status = checkinMap[key];
    if (status === 'checked' || status === 'repair') {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

function buildStatusMap(doc) {
  const checkinMap = doc.checkinMap || {};
  const map = Object.assign({}, checkinMap);
  const todayKey = getTodayKey();

  let cursor = doc.startDate;
  while (cursor <= doc.endDate) {
    if (!map[cursor]) {
      map[cursor] = cursor <= todayKey ? 'pending' : 'pending';
    }
    cursor = addDays(cursor, 1);
  }
  return map;
}

function toListItem(doc) {
  const status = getChallengeStatus(doc);
  const savedAmount = getSavedAmount(doc);
  const leftDays = Math.max(0, diffDays(getTodayKey(), doc.endDate) + 1);

  return {
    id: doc._id,
    name: doc.name,
    periodDays: safeNumber(doc.days, 0),
    dailyAmount: safeNumber(doc.dailyAmount, 0),
    savedAmount,
    status,
    resultText: status === 'success' ? '挑战成功' : (status === 'failed' ? '挑战中断' : '进行中'),
    streakDays: getStreakDays(doc),
    leftDays,
    createdAt: safeNumber(doc.createdAt, 0),
    updatedAt: safeNumber(doc.updatedAt, 0),
  };
}

function toDetail(doc, openid) {
  const item = toListItem(doc);
  return {
    id: doc._id,
    name: doc.name,
    periodDays: item.periodDays,
    dailyAmount: item.dailyAmount,
    savedAmount: item.savedAmount,
    status: item.status,
    resultText: item.resultText,
    streakDays: item.streakDays,
    leftDays: item.leftDays,
    statusMap: buildStatusMap(doc),
    startDate: doc.startDate,
    endDate: doc.endDate,
    note: doc.note || '',
    syncToPlaza: !!doc.syncToPlaza,
    likeCount: safeNumber(doc.likeCount, 0),
    liked: Array.isArray(doc.likedOpenids) ? doc.likedOpenids.includes(openid) : false,
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

  const startDate = getTodayKey();
  const endDate = addDays(startDate, days - 1);
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
    checkinMap: {},
    startDate,
    endDate,
    createdAt: ts,
    updatedAt: ts,
  };

  const res = await db.collection(CHALLENGE_COLLECTION).add({ data: doc });
  return { ok: true, challengeId: res._id };
}

async function getChallenges(openid) {
  await ensureCollection(CHALLENGE_COLLECTION);

  const res = await db.collection(CHALLENGE_COLLECTION)
    .where({ openid })
    .orderBy('updatedAt', 'desc')
    .limit(120)
    .get();

  const list = (res.data || []).map(toListItem);
  const ongoingList = list.filter((item) => item.status === 'ongoing');
  const historyList = list.filter((item) => item.status !== 'ongoing');

  return { ok: true, ongoingList, historyList };
}

async function getChallengeDetail(openid, challengeId) {
  await ensureCollection(CHALLENGE_COLLECTION);
  if (!challengeId) return { ok: false, error: '缺少挑战ID' };

  try {
    const res = await db.collection(CHALLENGE_COLLECTION).doc(challengeId).get();
    const doc = res.data;
    if (doc.openid !== openid) {
      return { ok: false, error: '无权查看该挑战' };
    }
    return { ok: true, challenge: toDetail(doc, openid) };
  } catch (err) {
    return { ok: false, error: '挑战不存在或已删除' };
  }
}

async function checkinChallenge(openid, challengeId, dateKey, mode) {
  await ensureCollection(CHALLENGE_COLLECTION);
  if (!challengeId) return { ok: false, error: '缺少挑战ID' };

  const checkinDate = normalizeText(dateKey, 20);
  const checkinMode = mode === 'repair' ? 'repair' : 'checked';

  const res = await db.collection(CHALLENGE_COLLECTION).doc(challengeId).get();
  const doc = res.data;
  if (doc.openid !== openid) return { ok: false, error: '无权操作该挑战' };

  const status = getChallengeStatus(doc);
  if (status !== 'ongoing') {
    return { ok: false, error: '挑战已结束，无法继续打卡' };
  }

  if (!checkinDate || checkinDate < doc.startDate || checkinDate > doc.endDate) {
    return { ok: false, error: '打卡日期不在挑战周期内' };
  }

  const todayKey = getTodayKey();
  if (checkinDate > todayKey) {
    return { ok: false, error: '不能提前打卡未来日期' };
  }

  if (checkinMode === 'checked' && checkinDate !== todayKey) {
    return { ok: false, error: '非今日日期请使用补打卡' };
  }

  const nextMap = Object.assign({}, doc.checkinMap || {});
  if (nextMap[checkinDate] === 'checked' || nextMap[checkinDate] === 'repair') {
    return { ok: false, error: '该日期已打卡' };
  }
  nextMap[checkinDate] = checkinMode;

  await db.collection(CHALLENGE_COLLECTION).doc(challengeId).update({
    data: {
      checkinMap: nextMap,
      updatedAt: nowTs(),
    },
  });

  return getChallengeDetail(openid, challengeId);
}

async function getHomeData(openid) {
  await ensureCollection(CHALLENGE_COLLECTION);

  const res = await db.collection(CHALLENGE_COLLECTION)
    .where({ openid })
    .orderBy('updatedAt', 'desc')
    .limit(120)
    .get();

  const list = (res.data || []).map(toListItem);
  const ongoingList = list.filter((item) => item.status === 'ongoing');
  const challengeSaved = list.reduce((sum, item) => sum + safeNumber(item.savedAmount, 0), 0);

  return {
    ok: true,
    summary: {
      challengeSaved,
      ongoingChallengeCount: ongoingList.length,
    },
    ongoingChallenges: ongoingList.slice(0, 2).map((item) => ({
      id: item.id,
      name: item.name,
      leftDays: item.leftDays,
      streakDays: item.streakDays,
    })),
  };
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action || '';

  if (action === 'createChallenge') return createChallenge(openid, event.payload || {});
  if (action === 'getChallenges') return getChallenges(openid);
  if (action === 'getChallengeDetail') return getChallengeDetail(openid, event.challengeId);
  if (action === 'checkinChallenge') return checkinChallenge(openid, event.challengeId, event.dateKey, event.mode);
  if (action === 'getHomeData') return getHomeData(openid);

  return { ok: false, error: 'Unknown action: ' + action };
};
