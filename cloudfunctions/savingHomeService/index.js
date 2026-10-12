const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const ensuredCollections = {};

const CHALLENGE_COLLECTION = 'saving_challenges';
const BUDGET_COLLECTION = 'budgetChallenge';
const BUDGET_RECORD_COLLECTION = 'budgetConsumeRecord';
const COOLING_COLLECTION = 'coolingRecord';
const GLOBAL_CONFIG_COLLECTION = 'global_config';
const CHINA_TIME_OFFSET = 8 * 60 * 60 * 1000;

function safeNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toDateKey(date) {
  const shifted = new Date(date.getTime() + CHINA_TIME_OFFSET);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateKeyToUtcMs(key) {
  const [y, m, d] = String(key || '').split('-').map((item) => Number(item));
  if (!y || !m || !d) return 0;
  return Date.UTC(y, m - 1, d);
}

function diffDays(fromKey, toKey) {
  const from = dateKeyToUtcMs(fromKey);
  const to = dateKeyToUtcMs(toKey);
  if (!from || !to) return 0;
  return Math.floor((to - from) / 86400000);
}

function addDays(dateKey, offset) {
  const ms = dateKeyToUtcMs(dateKey);
  if (!ms) return dateKey;
  const next = new Date(ms + offset * 86400000);
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d = String(next.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayKey() {
  return toDateKey(new Date());
}

function toDateKeyFromAny(input) {
  if (!input) return '';
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) return toDateKey(date);
    return '';
  }
  if (typeof input === 'number') {
    const date = new Date(input);
    if (!Number.isNaN(date.getTime())) return toDateKey(date);
    return '';
  }
  if (input instanceof Date) {
    if (!Number.isNaN(input.getTime())) return toDateKey(input);
  }
  return '';
}

function calcBudgetStatus(doc) {
  if (doc.status === 'archived') return 'archived';
  const todayKey = getTodayKey();
  const startKey = toDateKeyFromAny(doc.startDate);
  const endKey = toDateKeyFromAny(doc.endDate);

  if (startKey && todayKey < startKey) return 'notStart';
  if (endKey && todayKey > endKey) return 'finished';
  return 'running';
}

function statusTextOfBudget(status) {
  if (status === 'notStart') return '未开始';
  if (status === 'running') return '进行中';
  if (status === 'finished') return '已结束';
  if (status === 'archived') return '已归档';
  return '进行中';
}

function pickLatestTs(doc) {
  return safeNumber(doc.updateTime, 0)
    || safeNumber(doc.updatedAt, 0)
    || safeNumber(doc.createTime, 0)
    || safeNumber(doc.createdAt, 0);
}

function mergeById(listA, listB) {
  const map = new Map();
  (listA || []).forEach((item) => {
    if (item && item._id) map.set(item._id, item);
  });
  (listB || []).forEach((item) => {
    if (item && item._id && !map.has(item._id)) {
      map.set(item._id, item);
    }
  });
  return Array.from(map.values());
}

async function queryBudgetListByUser(openid) {
  const [openidRes, userIdRes] = await Promise.all([
    db.collection(BUDGET_COLLECTION)
      .where({ openid })
      .limit(200)
      .get(),
    db.collection(BUDGET_COLLECTION)
      .where({ userId: openid })
      .limit(200)
      .get(),
  ]);

  const merged = mergeById(openidRes.data, userIdRes.data);
  merged.sort((a, b) => pickLatestTs(b) - pickLatestTs(a));
  return merged;
}

async function queryBudgetConsumeRecordsByBudgetIds(budgetIds) {
  if (!Array.isArray(budgetIds) || !budgetIds.length) return [];
  const command = db.command;
  const chunkSize = 50;
  const all = [];

  for (let i = 0; i < budgetIds.length; i += chunkSize) {
    const chunk = budgetIds.slice(i, i + chunkSize);
    let skip = 0;
    while (true) {
      const res = await db.collection(BUDGET_RECORD_COLLECTION)
        .where({ budgetId: command.in(chunk) })
        .skip(skip)
        .limit(200)
        .get();
      const list = res.data || [];
      if (!list.length) break;
      all.push(...list);
      skip += list.length;
      if (list.length < 200) break;
    }
  }

  return all;
}

function buildBudgetSpendMap(records) {
  const spendMap = {};
  (records || []).forEach((record) => {
    const budgetId = record && record.budgetId;
    if (!budgetId) return;
    spendMap[budgetId] = safeNumber(spendMap[budgetId], 0) + safeNumber(record.amount, 0);
  });
  return spendMap;
}

function toBudgetHomeCard(doc, spentMap) {
  const id = doc._id;
  const totalBudget = safeNumber(doc.totalBudget, 0);
  const spentAmount = Number.isFinite(Number(doc.spentAmount))
    ? safeNumber(doc.spentAmount, 0)
    : safeNumber(spentMap[id], 0);
  const remainingBudget = totalBudget - spentAmount;
  const progress = totalBudget > 0 ? (spentAmount / totalBudget) : 0;

  const endDateKey = toDateKeyFromAny(doc.endDate);
  const todayKey = getTodayKey();
  let leftDays = 0;
  if (endDateKey && todayKey <= endDateKey) {
    leftDays = Math.max(0, diffDays(todayKey, endDateKey) + 1);
  }

  const status = calcBudgetStatus(doc);

  return {
    id,
    name: doc.name || '预算挑战',
    status,
    statusText: statusTextOfBudget(status),
    totalBudget,
    spentAmount,
    remainingBudget,
    overAmount: remainingBudget < 0 ? Math.abs(remainingBudget) : 0,
    progress,
    leftDays,
    updatedAt: pickLatestTs(doc),
  };
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
    console.warn('创建集合失败：' + name, err);
  }
}

async function getBudgetFeatureEnabled() {
  try {
    await ensureCollection(GLOBAL_CONFIG_COLLECTION);
    let config = {};
    try {
      const fixedRes = await db.collection(GLOBAL_CONFIG_COLLECTION).doc('app').get();
      config = fixedRes.data || {};
    } catch (err) {
      const res = await db.collection(GLOBAL_CONFIG_COLLECTION).limit(1).get();
      config = (res.data || [])[0] || {};
    }
    return config.enableBudgetChallenge !== false;
  } catch (err) {
    return true;
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

function getChallengeSaved(doc) {
  const checkinMap = doc.checkinMap || {};
  const checkedCount = Object.keys(checkinMap).filter((key) => checkinMap[key] === 'checked' || checkinMap[key] === 'repair').length;
  return checkedCount * safeNumber(doc.dailyAmount, 0);
}

function getChallengeStreak(doc) {
  const checkinMap = doc.checkinMap || {};
  const todayKey = getTodayKey();
  const endDate = doc.endDate || addDays(doc.startDate, safeNumber(doc.days, 1) - 1);

  const isChecked = (key) => checkinMap[key] === 'checked' || checkinMap[key] === 'repair';

  let anchorKey = todayKey;
  if (anchorKey > endDate) anchorKey = endDate;
  if (anchorKey >= doc.startDate && anchorKey <= endDate && !isChecked(anchorKey)) {
    anchorKey = addDays(anchorKey, -1);
  }

  if (anchorKey < doc.startDate) return 0;

  let streak = 0;

  for (let i = 0; i < safeNumber(doc.days, 1); i++) {
    const key = addDays(anchorKey, -i);
    if (key < doc.startDate || key > endDate) continue;
    if (isChecked(key)) streak += 1;
    else break;
  }

  return streak;
}

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  await Promise.all([
    ensureCollection(CHALLENGE_COLLECTION),
    ensureCollection(BUDGET_COLLECTION),
    ensureCollection(BUDGET_RECORD_COLLECTION),
    ensureCollection(COOLING_COLLECTION),
    ensureCollection(GLOBAL_CONFIG_COLLECTION),
  ]);

  const challengeRes = await db.collection(CHALLENGE_COLLECTION)
    .where({ openid })
    .field({
      _id: true,
      name: true,
      startDate: true,
      endDate: true,
      days: true,
      dailyAmount: true,
      checkinMap: true,
      updatedAt: true,
    })
    .orderBy('updatedAt', 'desc')
    .limit(200)
    .get();

  const challenges = challengeRes.data || [];

  const challengeSaved = challenges.reduce((sum, item) => sum + getChallengeSaved(item), 0);
  const ongoingChallengesRaw = challenges.filter((item) => getChallengeStatus(item) === 'ongoing');
  const ongoingChallenges = ongoingChallengesRaw.slice(0, 2).map((item) => ({
    id: item._id,
    name: item.name,
    leftDays: Math.max(0, diffDays(getTodayKey(), item.endDate) + 1),
    streakDays: getChallengeStreak(item),
  }));

  const budgetFeatureEnabled = await getBudgetFeatureEnabled();

  let budgetCards = [];
  let ongoingBudgetChallenges = [];
  let budgetSaved = 0;

  const coolingRes = await db.collection(COOLING_COLLECTION)
    .where({ userId: openid, status: 'Success' })
    .field({ price: true })
    .limit(200)
    .get();
  const coolingSaved = (coolingRes.data || []).reduce((sum, item) => sum + safeNumber(item.price, 0), 0);

  if (budgetFeatureEnabled) {
    const budgetList = await queryBudgetListByUser(openid);
    const needFallbackRecords = budgetList.some((item) => !Number.isFinite(Number(item.spentAmount)));
    let budgetSpendMap = {};

    if (needFallbackRecords) {
      const budgetIds = budgetList.map((item) => item._id).filter(Boolean);
      const budgetRecords = await queryBudgetConsumeRecordsByBudgetIds(budgetIds);
      budgetSpendMap = buildBudgetSpendMap(budgetRecords);
    }

    const allBudgetCards = budgetList.map((item) => toBudgetHomeCard(item, budgetSpendMap));
    budgetSaved = allBudgetCards
      .filter((item) => item.status === 'finished' || item.status === 'archived')
      .reduce((sum, item) => sum + Math.max(Number(item.remainingBudget) || 0, 0), 0);

    budgetCards = allBudgetCards.filter((item) => item.status === 'running' || item.status === 'notStart');

    ongoingBudgetChallenges = budgetCards
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 2);
  }

  return {
    ok: true,
    enableBudgetChallenge: budgetFeatureEnabled,
    summary: {
      challengeSaved,
      coolingSaved,
      budgetSaved,
      totalSaved: challengeSaved + coolingSaved + budgetSaved,
      ongoingChallengeCount: ongoingChallengesRaw.length,
      ongoingBudgetChallengeCount: budgetCards.length,
    },
    ongoingChallenges,
    ongoingBudgetChallenges,
  };
};
