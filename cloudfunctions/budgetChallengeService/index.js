const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const ensuredCollections = {};

const BUDGET_COLLECTION = 'budgetChallenge';
const BUDGET_RECORD_COLLECTION = 'budgetConsumeRecord';
const GLOBAL_CONFIG_COLLECTION = 'global_config';
const CHINA_TIME_OFFSET = 8 * 60 * 60 * 1000; // 业务按中国自然日统计
const FEATURE_FLAG_CACHE_MS = 60 * 1000;
let featureEnabledCache = {
  value: null,
  expireAt: 0,
};

function safeNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function nowTs() {
  return Date.now();
}

function normalizeText(value, maxLen) {
  return String(value || '').trim().slice(0, maxLen);
}

function toMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function hasMoreThanTwoDecimals(value) {
  const text = String(value || '').trim();
  if (!text || /e/i.test(text)) return false;
  const decimal = text.split('.')[1] || '';
  return decimal.length > 2;
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

function toDateKeyFromAny(input) {
  if (!input) return '';
  if (typeof input === 'string') {
    const text = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return toDateKey(date);
    return '';
  }
  if (typeof input === 'number') {
    const date = new Date(input);
    if (!Number.isNaN(date.getTime())) return toDateKey(date);
    return '';
  }
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return toDateKey(input);
  }
  return '';
}

function parseConsumeTimestamp(input) {
  if (typeof input === 'number' && Number.isFinite(input) && input > 0) {
    return Math.floor(input);
  }

  if (typeof input === 'string') {
    const text = input.trim();
    if (!text) return 0;
    if (/^\d+$/.test(text)) {
      const ts = Number(text);
      if (Number.isFinite(ts) && ts > 0) return Math.floor(ts);
    }
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  }

  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return input.getTime();
  }

  return 0;
}

function getTodayKey() {
  return toDateKey(new Date());
}

function pickLatestTs(doc) {
  return safeNumber(doc.updateTime, 0)
    || safeNumber(doc.updatedAt, 0)
    || safeNumber(doc.createTime, 0)
    || safeNumber(doc.createdAt, 0);
}

function getOwnerId(doc) {
  return doc.userId || doc.openid || '';
}

function isOwner(doc, openid) {
  return getOwnerId(doc) === openid;
}

function calcBudgetStatus(doc, todayKey) {
  if (doc.status === 'archived') return 'archived';

  const startDate = toDateKeyFromAny(doc.startDate);
  const endDate = toDateKeyFromAny(doc.endDate);
  const today = todayKey || getTodayKey();

  if (startDate && today < startDate) return 'notStart';
  if (endDate && today > endDate) return 'finished';
  return 'running';
}

function statusTextOfBudget(status) {
  if (status === 'notStart') return '未开始';
  if (status === 'running') return '进行中';
  if (status === 'finished') return '已结束';
  if (status === 'archived') return '已归档';
  return '进行中';
}

function progressClassOfBudget(status, totalBudget, spentAmount, progressPercent) {
  if (status === 'notStart') return 'notStart';
  if (spentAmount > totalBudget) return 'over';
  if (progressPercent >= 80) return 'warning';
  return 'safe';
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
    console.warn('创建集合失败：' + name, err);
  }
}

async function ensureBaseCollections() {
  await Promise.all([
    ensureCollection(BUDGET_COLLECTION),
    ensureCollection(BUDGET_RECORD_COLLECTION),
    ensureCollection(GLOBAL_CONFIG_COLLECTION),
  ]);
}

async function getBudgetFeatureEnabled() {
  const now = nowTs();
  if (featureEnabledCache.expireAt > now && featureEnabledCache.value !== null) {
    return featureEnabledCache.value;
  }

  let enabled = true;
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
    enabled = config.enableBudgetChallenge !== false;
  } catch (err) {
    enabled = true;
  }

  featureEnabledCache = {
    value: enabled,
    expireAt: now + FEATURE_FLAG_CACHE_MS,
  };

  return enabled;
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

  const list = mergeById(openidRes.data, userIdRes.data);
  list.sort((a, b) => pickLatestTs(b) - pickLatestTs(a));
  return list;
}

async function queryBudgetDocById(challengeId) {
  return db.collection(BUDGET_COLLECTION).doc(challengeId).get().then((res) => res.data);
}

async function queryBudgetRecordsByBudgetIds(budgetIds) {
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

async function queryBudgetRecordsByBudgetId(budgetId, options) {
  const opts = options || {};
  const limit = Math.max(1, Math.min(100, safeNumber(opts.limit, 20)));
  const cursorTs = safeNumber(opts.cursorTs, 0);
  const cursorId = normalizeText(opts.cursorId, 64);
  const command = db.command;

  const where = { budgetId };
  if (cursorTs > 0) {
    where.consumeTime = command.lte(cursorTs);
  }

  let query = db.collection(BUDGET_RECORD_COLLECTION)
    .where(where)
    .orderBy('consumeTime', 'desc')
    .limit(limit + 1);

  const res = await query.get();
  let list = res.data || [];

  if (cursorTs > 0 && cursorId) {
    list = list.filter((item) => {
      const ts = safeNumber(item.consumeTime, 0);
      if (ts < cursorTs) return true;
      if (ts > cursorTs) return false;
      return String(item._id || '') < cursorId;
    });
  }

  const hasMore = list.length > limit;
  const pageList = hasMore ? list.slice(0, limit) : list;
  const last = pageList.length ? pageList[pageList.length - 1] : null;

  return {
    list: pageList,
    hasMore,
    nextCursorTs: last ? safeNumber(last.consumeTime, 0) : 0,
    nextCursorId: last ? String(last._id || '') : '',
  };
}

async function queryBudgetRecordStatsByBudgetId(budgetId) {
  const all = await queryBudgetRecordsByBudgetIds([budgetId]);
  return {
    spentAmount: sumRecordAmount(all),
    consumeCount: all.length,
  };
}


function buildRecordStats(records) {
  const amountMap = {};
  const countMap = {};

  (records || []).forEach((item) => {
    const budgetId = item && item.budgetId;
    if (!budgetId) return;
    amountMap[budgetId] = toMoney(safeNumber(amountMap[budgetId], 0) + safeNumber(item.amount, 0));
    countMap[budgetId] = safeNumber(countMap[budgetId], 0) + 1;
  });

  return { amountMap, countMap };
}

function sumRecordAmount(records) {
  return toMoney((records || []).reduce((sum, item) => sum + safeNumber(item.amount, 0), 0));
}

function buildReplaySummary(item) {
  const isSuccess = item.overAmount <= 0;
  if (!(item.status === 'finished' || item.status === 'archived')) {
    return null;
  }

  return {
    isSuccess,
    title: isSuccess ? '预算管控成功 ✅' : '预算超额提醒 ❌',
    description: isSuccess
      ? `预算管控成功！本次共省下${item.remainingBudget.toFixed(2)}元`
      : `预算超额！本次共超支${item.overAmount.toFixed(2)}元`,
    totalBudget: item.totalBudget,
    spentAmount: item.spentAmount,
    remainingBudget: item.remainingBudget,
    overAmount: item.overAmount,
    consumeCount: item.consumeCount,
    periodDays: item.periodDays,
  };
}

function toBudgetItem(doc, amountMap, countMap, todayKey) {
  const id = doc._id;
  const startDate = toDateKeyFromAny(doc.startDate);
  const endDate = toDateKeyFromAny(doc.endDate);
  const totalBudget = toMoney(safeNumber(doc.totalBudget, 0));

  const fallbackSpent = amountMap && Object.prototype.hasOwnProperty.call(amountMap, id)
    ? safeNumber(amountMap[id], 0)
    : 0;
  const fallbackCount = countMap && Object.prototype.hasOwnProperty.call(countMap, id)
    ? safeNumber(countMap[id], 0)
    : 0;

  const spentAmount = toMoney(
    Number.isFinite(Number(doc.spentAmount)) ? safeNumber(doc.spentAmount, 0) : fallbackSpent
  );
  const consumeCount = Number.isFinite(Number(doc.consumeCount))
    ? safeNumber(doc.consumeCount, 0)
    : fallbackCount;

  const remainingBudget = toMoney(totalBudget - spentAmount);
  const overAmount = remainingBudget < 0 ? toMoney(Math.abs(remainingBudget)) : 0;
  const rawProgressPercent = totalBudget > 0 ? (spentAmount / totalBudget) * 100 : 0;
  const progressPercent = Math.min(100, Math.max(0, Number(rawProgressPercent.toFixed(2))));
  const progressPercentRaw = Math.max(0, Number(rawProgressPercent.toFixed(2)));
  const status = calcBudgetStatus(doc, todayKey);

  const today = todayKey || getTodayKey();
  let leftDays = 0;
  let startInDays = 0;
  let timeTagText = '';

  if (status === 'notStart' && startDate) {
    startInDays = Math.max(0, diffDays(today, startDate));
    timeTagText = `距开始 ${startInDays} 天`;
  } else if (status === 'running' && endDate) {
    leftDays = Math.max(0, diffDays(today, endDate) + 1);
    timeTagText = `剩余 ${leftDays} 天`;
  }

  let periodDays = 0;
  if (startDate && endDate && startDate <= endDate) {
    periodDays = diffDays(startDate, endDate) + 1;
  }

  const item = {
    id,
    name: normalizeText(doc.name, 40) || '预算挑战',
    status,
    statusText: statusTextOfBudget(status),
    totalBudget,
    spentAmount,
    remainingBudget: remainingBudget < 0 ? 0 : remainingBudget,
    overAmount,
    progressPercent,
    progressPercentRaw,
    progressClass: progressClassOfBudget(status, totalBudget, spentAmount, progressPercent),
    consumeCount,
    leftDays,
    startInDays,
    timeTagText,
    periodDays,
    startDate,
    endDate,
    alertEnable: doc.alertEnable !== false,
    canAddConsume: status === 'running',
    canEditBudget: status === 'running' || status === 'notStart',
    canDeleteBudget: status === 'running' || status === 'notStart',
    canArchive: status === 'running' || status === 'finished',
    recommendedDailyBudget: leftDays > 0 && remainingBudget > 0 ? toMoney(remainingBudget / leftDays) : 0,
    canManageConsume: status === 'running' || status === 'finished',
    updatedAt: pickLatestTs(doc),
  };

  const replay = buildReplaySummary(item);
  return Object.assign(item, {
    replay,
    resultText: replay ? replay.description : (overAmount > 0 ? `当前超额 ¥${overAmount.toFixed(2)}` : `当前剩余 ¥${item.remainingBudget.toFixed(2)}`),
  });
}

function splitBudgetList(items) {
  const ongoingList = [];
  const historyList = [];

  (items || []).forEach((item) => {
    if (item.status === 'running' || item.status === 'notStart') {
      ongoingList.push(item);
    } else {
      historyList.push(item);
    }
  });

  return { ongoingList, historyList };
}

function normalizeBudgetPayload(payload) {
  const name = normalizeText(payload.name, 20);
  const totalBudget = toMoney(payload.totalBudget);
  const startDate = toDateKeyFromAny(payload.startDate) || getTodayKey();
  const endDate = toDateKeyFromAny(payload.endDate) || startDate;
  const alertEnable = payload.alertEnable !== false;

  return {
    name,
    totalBudget,
    startDate,
    endDate,
    alertEnable,
  };
}

async function validateBudgetPayload(payload) {
  if (hasMoreThanTwoDecimals(payload && payload.totalBudget)) {
    return { ok: false, error: '预算总金额最多保留两位小数' };
  }

  const normalized = normalizeBudgetPayload(payload || {});

  if (!normalized.name) {
    return { ok: false, error: '预算名称不能为空' };
  }

  if (normalized.name.length > 20) {
    return { ok: false, error: '预算名称最多20字' };
  }

  if (!normalized.totalBudget || normalized.totalBudget <= 0) {
    return { ok: false, error: '预算总金额必须大于0' };
  }

  if (!normalized.startDate || !normalized.endDate) {
    return { ok: false, error: '请选择预算起止日期' };
  }

  if (normalized.endDate < normalized.startDate) {
    return { ok: false, error: '结束日期不能早于开始日期' };
  }

  try {
    await checkTextSecurity(normalized.name, '预算名称');
  } catch (err) {
    return { ok: false, error: err.message || '内容校验失败' };
  }

  return { ok: true, payload: normalized };
}

async function assertEditableBudget(doc) {
  const status = calcBudgetStatus(doc);
  if (!(status === 'running' || status === 'notStart')) {
    return { ok: false, error: '当前状态不可修改预算' };
  }
  return { ok: true, status };
}

async function getBudgetChallenges(openid) {
  await ensureBaseCollections();

  const featureEnabled = await getBudgetFeatureEnabled();
  if (!featureEnabled) {
    return {
      ok: true,
      enableBudgetChallenge: false,
      ongoingList: [],
      historyList: [],
      summary: {
        ongoingBudgetChallengeCount: 0,
        totalBudgetChallengeCount: 0,
      },
    };
  }

  const budgetList = await queryBudgetListByUser(openid);
  const allHaveAggregate = budgetList.every((doc) => (
    Number.isFinite(Number(doc.spentAmount)) && Number.isFinite(Number(doc.consumeCount))
  ));

  let amountMap = {};
  let countMap = {};
  if (!allHaveAggregate) {
    const budgetIds = budgetList.map((item) => item._id).filter(Boolean);
    const records = await queryBudgetRecordsByBudgetIds(budgetIds);
    const stats = buildRecordStats(records);
    amountMap = stats.amountMap;
    countMap = stats.countMap;

    const ts = nowTs();
    await Promise.all(
      budgetList
        .filter((doc) => !(Number.isFinite(Number(doc.spentAmount)) && Number.isFinite(Number(doc.consumeCount))))
        .map((doc) => db.collection(BUDGET_COLLECTION).doc(doc._id).update({
          data: {
            spentAmount: toMoney(safeNumber(amountMap[doc._id], 0)),
            consumeCount: safeNumber(countMap[doc._id], 0),
            updateTime: ts,
            updatedAt: ts,
          },
        }).catch(() => null))
    );
  }

  const todayKey = getTodayKey();
  const allList = budgetList
    .map((doc) => toBudgetItem(doc, amountMap, countMap, todayKey))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const { ongoingList, historyList } = splitBudgetList(allList);

  return {
    ok: true,
    enableBudgetChallenge: true,
    ongoingList,
    historyList,
    summary: {
      ongoingBudgetChallengeCount: ongoingList.length,
      totalBudgetChallengeCount: ongoingList.length + historyList.length,
    },
  };
}

function normalizeDetailOptions(options) {
  const opts = options || {};
  const pageSize = Math.max(1, Math.min(100, safeNumber(opts.pageSize, 20)));
  const cursorTs = safeNumber(opts.cursorTs, 0);
  const cursorId = normalizeText(opts.cursorId, 64);
  return { pageSize, cursorTs, cursorId };
}

async function getBudgetChallengeDetail(openid, challengeId, options) {
  await ensureBaseCollections();
  if (!challengeId) return { ok: false, error: '缺少预算ID' };

  try {
    const doc = await queryBudgetDocById(challengeId);
    if (!doc || !isOwner(doc, openid)) {
      return { ok: false, error: '无权查看该预算' };
    }

    let amountMap = null;
    let countMap = null;
    if (!Number.isFinite(Number(doc.spentAmount)) || !Number.isFinite(Number(doc.consumeCount))) {
      const stats = await queryBudgetRecordStatsByBudgetId(challengeId);
      amountMap = { [challengeId]: stats.spentAmount };
      countMap = { [challengeId]: stats.consumeCount };
    }

    const challenge = toBudgetItem(doc, amountMap, countMap, getTodayKey());

    const detailOptions = normalizeDetailOptions(options);
    const recordsRes = await queryBudgetRecordsByBudgetId(challengeId, {
      limit: detailOptions.pageSize,
      cursorTs: detailOptions.cursorTs,
      cursorId: detailOptions.cursorId,
    });

    const consumeRecords = (recordsRes.list || []).map((item) => ({
      id: item._id,
      budgetId: item.budgetId,
      amount: toMoney(item.amount),
      remark: normalizeText(item.remark, 30),
      consumeTime: safeNumber(item.consumeTime, 0),
      createTime: safeNumber(item.createTime, 0),
      updateTime: safeNumber(item.updateTime, 0),
    }));

    return {
      ok: true,
      challenge,
      consumeRecords,
      paging: {
        hasMore: !!recordsRes.hasMore,
        nextCursorTs: safeNumber(recordsRes.nextCursorTs, 0),
        nextCursorId: normalizeText(recordsRes.nextCursorId, 64),
      },
    };
  } catch (err) {
    return { ok: false, error: '预算不存在或已删除' };
  }
}

async function createBudgetChallenge(openid, payload) {
  await ensureBaseCollections();

  const featureEnabled = await getBudgetFeatureEnabled();
  if (!featureEnabled) {
    return { ok: false, error: '预算挑战功能已关闭' };
  }

  const validate = await validateBudgetPayload(payload);
  if (!validate.ok) return validate;

  const normalized = validate.payload;
  const ts = nowTs();

  const doc = {
    userId: openid,
    openid,
    name: normalized.name,
    totalBudget: normalized.totalBudget,
    startDate: normalized.startDate,
    endDate: normalized.endDate,
    alertEnable: normalized.alertEnable,
    status: calcBudgetStatus(normalized, getTodayKey()),
    spentAmount: 0,
    consumeCount: 0,
    overflowNotified: false,
    createTime: ts,
    updateTime: ts,
    createdAt: ts,
    updatedAt: ts,
  };

  const res = await db.collection(BUDGET_COLLECTION).add({ data: doc });
  const detailRes = await getBudgetChallengeDetail(openid, res._id, { pageSize: 20 });
  return Object.assign({
    ok: true,
    challengeId: res._id,
  }, detailRes.ok ? detailRes : {});
}

async function updateBudgetChallenge(openid, challengeId, payload) {
  await ensureBaseCollections();
  if (!challengeId) return { ok: false, error: '缺少预算ID' };

  const featureEnabled = await getBudgetFeatureEnabled();
  if (!featureEnabled) {
    return { ok: false, error: '预算挑战功能已关闭' };
  }

  const validate = await validateBudgetPayload(payload);
  if (!validate.ok) return validate;

  try {
    const oldDoc = await queryBudgetDocById(challengeId);
    if (!oldDoc || !isOwner(oldDoc, openid)) {
      return { ok: false, error: '无权修改该预算' };
    }

    const editable = await assertEditableBudget(oldDoc);
    if (!editable.ok) return editable;

    const nextPayload = validate.payload;

    const records = await queryBudgetRecordsByBudgetId(challengeId);
    const outRangeList = records.filter((item) => {
      const consumeDateKey = toDateKeyFromAny(item.consumeTime);
      if (!consumeDateKey) return false;
      return consumeDateKey < nextPayload.startDate || consumeDateKey > nextPayload.endDate;
    });
    if (outRangeList.length) {
      const sample = outRangeList
        .slice(0, 3)
        .map((item) => toDateKeyFromAny(item.consumeTime))
        .filter(Boolean)
        .join('、');
      return {
        ok: false,
        error: `有${outRangeList.length}笔消费超出新预算周期，请先调整（例如：${sample || '超周期记录'}）`,
      };
    }

    const ts = nowTs();
    await db.collection(BUDGET_COLLECTION).doc(challengeId).update({
      data: {
        name: nextPayload.name,
        totalBudget: nextPayload.totalBudget,
        startDate: nextPayload.startDate,
        endDate: nextPayload.endDate,
        alertEnable: nextPayload.alertEnable,
        status: calcBudgetStatus(nextPayload, getTodayKey()),
        updateTime: ts,
        updatedAt: ts,
      },
    });

    return getBudgetChallengeDetail(openid, challengeId, { pageSize: 20 });
  } catch (err) {
    return { ok: false, error: '预算更新失败，请稍后重试' };
  }
}

async function removeRecordsByBudgetId(budgetId) {
  const command = db.command;
  while (true) {
    const res = await db.collection(BUDGET_RECORD_COLLECTION)
      .where({ budgetId })
      .field({ _id: true })
      .limit(100)
      .get();

    const records = res.data || [];
    if (!records.length) break;

    const ids = records.map((item) => item._id).filter(Boolean);
    if (!ids.length) break;

    await db.collection(BUDGET_RECORD_COLLECTION)
      .where({ _id: command.in(ids) })
      .remove();

    if (records.length < 100) break;
  }
}

async function deleteBudgetChallenge(openid, challengeId) {
  await ensureBaseCollections();
  if (!challengeId) return { ok: false, error: '缺少预算ID' };

  try {
    const doc = await queryBudgetDocById(challengeId);
    if (!doc || !isOwner(doc, openid)) {
      return { ok: false, error: '无权删除该预算' };
    }

    const status = calcBudgetStatus(doc);
    if (!(status === 'running' || status === 'notStart')) {
      return { ok: false, error: '已结束或已归档预算不可删除' };
    }

    await removeRecordsByBudgetId(challengeId);
    await db.collection(BUDGET_COLLECTION).doc(challengeId).remove();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: '预算删除失败，请稍后重试' };
  }
}

async function archiveBudgetChallenge(openid, challengeId) {
  await ensureBaseCollections();
  if (!challengeId) return { ok: false, error: '缺少预算ID' };

  try {
    const doc = await queryBudgetDocById(challengeId);
    if (!doc || !isOwner(doc, openid)) {
      return { ok: false, error: '无权归档该预算' };
    }

    const status = calcBudgetStatus(doc);
    if (!(status === 'running' || status === 'finished')) {
      return { ok: false, error: '当前状态不可归档' };
    }

    const ts = nowTs();
    await db.collection(BUDGET_COLLECTION).doc(challengeId).update({
      data: {
        status: 'archived',
        updateTime: ts,
        updatedAt: ts,
      },
    });

    return getBudgetChallengeDetail(openid, challengeId, { pageSize: 20 });
  } catch (err) {
    return { ok: false, error: '预算归档失败，请稍后重试' };
  }
}

async function validateConsumePayload(payload) {
  if (hasMoreThanTwoDecimals(payload && payload.amount)) {
    return { ok: false, error: '消费金额最多保留两位小数' };
  }

  const amount = toMoney(payload.amount);
  const remark = normalizeText(payload.remark, 30);
  const consumeTime = parseConsumeTimestamp(payload.consumeTime) || nowTs();

  if (!amount || amount <= 0) {
    return { ok: false, error: '消费金额必须大于0' };
  }

  try {
    await checkTextSecurity(remark, '消费备注');
  } catch (err) {
    return { ok: false, error: err.message || '内容校验失败' };
  }

  return {
    ok: true,
    payload: {
      amount,
      remark,
      consumeTime,
    },
  };
}

function isConsumeTimeInPeriod(consumeTs, startDate, endDate) {
  const consumeDateKey = toDateKeyFromAny(consumeTs);
  if (!consumeDateKey || !startDate || !endDate) return false;
  return consumeDateKey >= startDate && consumeDateKey <= endDate;
}

async function addConsumeRecord(openid, challengeId, payload) {
  await ensureBaseCollections();
  if (!challengeId) return { ok: false, error: '缺少预算ID' };

  const featureEnabled = await getBudgetFeatureEnabled();
  if (!featureEnabled) {
    return { ok: false, error: '预算挑战功能已关闭' };
  }

  const validate = await validateConsumePayload(payload || {});
  if (!validate.ok) return validate;

  try {
    const budgetDoc = await queryBudgetDocById(challengeId);
    if (!budgetDoc || !isOwner(budgetDoc, openid)) {
      return { ok: false, error: '预算不存在或无权操作' };
    }

    const runtimeStatus = calcBudgetStatus(budgetDoc);
    if (runtimeStatus !== 'running') {
      return { ok: false, error: runtimeStatus === 'notStart' ? '预算未开始，暂不可录入消费' : '已结束或已归档预算不可录入消费' };
    }

    const startDate = toDateKeyFromAny(budgetDoc.startDate);
    const endDate = toDateKeyFromAny(budgetDoc.endDate);

    if (!isConsumeTimeInPeriod(validate.payload.consumeTime, startDate, endDate)) {
      return { ok: false, error: '消费时间不在预算周期内' };
    }

    const ts = nowTs();
    const totalBudget = toMoney(safeNumber(budgetDoc.totalBudget, 0));
    const fallbackStats = Number.isFinite(Number(budgetDoc.spentAmount)) && Number.isFinite(Number(budgetDoc.consumeCount))
      ? { spentAmount: toMoney(safeNumber(budgetDoc.spentAmount, 0)), consumeCount: safeNumber(budgetDoc.consumeCount, 0) }
      : await queryBudgetRecordStatsByBudgetId(challengeId);

    const txRes = await db.runTransaction(async (transaction) => {
      const budgetTx = await transaction.collection(BUDGET_COLLECTION).doc(challengeId).get();
      const latestBudget = budgetTx.data || {};

      const spentBefore = Number.isFinite(Number(latestBudget.spentAmount))
        ? toMoney(safeNumber(latestBudget.spentAmount, 0))
        : fallbackStats.spentAmount;
      const countBefore = Number.isFinite(Number(latestBudget.consumeCount))
        ? safeNumber(latestBudget.consumeCount, 0)
        : fallbackStats.consumeCount;
      const spentAfter = toMoney(spentBefore + validate.payload.amount);
      const countAfter = countBefore + 1;

      const overflowNotifiedBefore = !!latestBudget.overflowNotified;
      const crossedNow = spentBefore <= totalBudget && spentAfter > totalBudget;
      const overflowTriggered = latestBudget.alertEnable !== false && crossedNow && !overflowNotifiedBefore;

      let nextOverflowNotified = overflowNotifiedBefore;
      if (spentAfter <= totalBudget) {
        nextOverflowNotified = false;
      } else if (overflowTriggered || overflowNotifiedBefore) {
        nextOverflowNotified = true;
      }

      await transaction.collection(BUDGET_RECORD_COLLECTION).add({
        data: {
          userId: openid,
          openid,
          budgetId: challengeId,
          amount: validate.payload.amount,
          remark: validate.payload.remark,
          consumeTime: validate.payload.consumeTime,
          createTime: ts,
          updateTime: ts,
          createdAt: ts,
          updatedAt: ts,
        },
      });

      await transaction.collection(BUDGET_COLLECTION).doc(challengeId).update({
        data: {
          spentAmount: spentAfter,
          consumeCount: countAfter,
          overflowNotified: nextOverflowNotified,
          updateTime: ts,
          updatedAt: ts,
        },
      });

      return { overflowTriggered };
    });

    const detail = await getBudgetChallengeDetail(openid, challengeId, { pageSize: 20 });
    return Object.assign({}, detail, {
      overflowTriggered: !!(txRes && txRes.overflowTriggered),
      challengeName: normalizeText(budgetDoc.name, 20) || '预算挑战',
    });
  } catch (err) {
    return { ok: false, error: '新增消费失败，请稍后重试' };
  }
}

async function updateConsumeRecord(openid, recordId, payload) {
  await ensureBaseCollections();
  if (!recordId) return { ok: false, error: '缺少消费记录ID' };

  const featureEnabled = await getBudgetFeatureEnabled();
  if (!featureEnabled) {
    return { ok: false, error: '预算挑战功能已关闭' };
  }

  const validate = await validateConsumePayload(payload || {});
  if (!validate.ok) return validate;

  try {
    const recordRes = await db.collection(BUDGET_RECORD_COLLECTION).doc(recordId).get();
    const record = recordRes.data;
    if (!record || getOwnerId(record) !== openid) {
      return { ok: false, error: '无权修改该消费记录' };
    }

    const budgetDoc = await queryBudgetDocById(record.budgetId);
    if (!budgetDoc || !isOwner(budgetDoc, openid)) {
      return { ok: false, error: '预算不存在或无权操作' };
    }

    const runtimeStatus = calcBudgetStatus(budgetDoc);
    if (!(runtimeStatus === 'running' || runtimeStatus === 'finished')) {
      return {
        ok: false,
        error: runtimeStatus === 'notStart'
          ? '预算未开始，暂不可编辑消费记录'
          : '已归档预算不可编辑消费记录',
      };
    }

    const startDate = toDateKeyFromAny(budgetDoc.startDate);
    const endDate = toDateKeyFromAny(budgetDoc.endDate);
    if (!isConsumeTimeInPeriod(validate.payload.consumeTime, startDate, endDate)) {
      return { ok: false, error: '消费时间不在预算周期内' };
    }

    const ts = nowTs();
    const totalBudget = toMoney(safeNumber(budgetDoc.totalBudget, 0));
    const fallbackStats = Number.isFinite(Number(budgetDoc.spentAmount))
      ? { spentAmount: toMoney(safeNumber(budgetDoc.spentAmount, 0)) }
      : await queryBudgetRecordStatsByBudgetId(record.budgetId);

    const txRes = await db.runTransaction(async (transaction) => {
      const budgetTx = await transaction.collection(BUDGET_COLLECTION).doc(record.budgetId).get();
      const latestBudget = budgetTx.data || {};

      const spentBefore = Number.isFinite(Number(latestBudget.spentAmount))
        ? toMoney(safeNumber(latestBudget.spentAmount, 0))
        : fallbackStats.spentAmount;
      const spentAfter = toMoney(Math.max(0, spentBefore - toMoney(record.amount) + validate.payload.amount));

      const overflowNotifiedBefore = !!latestBudget.overflowNotified;
      const crossedNow = spentBefore <= totalBudget && spentAfter > totalBudget;
      const overflowTriggered = latestBudget.alertEnable !== false && crossedNow && !overflowNotifiedBefore;

      let nextOverflowNotified = overflowNotifiedBefore;
      if (spentAfter <= totalBudget) {
        nextOverflowNotified = false;
      } else if (overflowTriggered || overflowNotifiedBefore) {
        nextOverflowNotified = true;
      }

      await transaction.collection(BUDGET_RECORD_COLLECTION).doc(recordId).update({
        data: {
          amount: validate.payload.amount,
          remark: validate.payload.remark,
          consumeTime: validate.payload.consumeTime,
          updateTime: ts,
          updatedAt: ts,
        },
      });

      await transaction.collection(BUDGET_COLLECTION).doc(record.budgetId).update({
        data: {
          spentAmount: spentAfter,
          overflowNotified: nextOverflowNotified,
          updateTime: ts,
          updatedAt: ts,
        },
      });

      return { overflowTriggered };
    });

    const detail = await getBudgetChallengeDetail(openid, record.budgetId, { pageSize: 20 });
    return Object.assign({}, detail, {
      overflowTriggered: !!(txRes && txRes.overflowTriggered),
      challengeName: normalizeText(budgetDoc.name, 20) || '预算挑战',
    });
  } catch (err) {
    return { ok: false, error: '编辑消费记录失败，请稍后重试' };
  }
}

async function deleteConsumeRecord(openid, recordId) {
  await ensureBaseCollections();
  if (!recordId) return { ok: false, error: '缺少消费记录ID' };

  try {
    const recordRes = await db.collection(BUDGET_RECORD_COLLECTION).doc(recordId).get();
    const record = recordRes.data;
    if (!record || getOwnerId(record) !== openid) {
      return { ok: false, error: '无权删除该消费记录' };
    }

    const budgetDoc = await queryBudgetDocById(record.budgetId);
    if (!budgetDoc || !isOwner(budgetDoc, openid)) {
      return { ok: false, error: '预算不存在或无权操作' };
    }

    const runtimeStatus = calcBudgetStatus(budgetDoc);
    if (!(runtimeStatus === 'running' || runtimeStatus === 'finished')) {
      return {
        ok: false,
        error: runtimeStatus === 'notStart'
          ? '预算未开始，暂不可删除消费记录'
          : '已归档预算不可删除消费记录',
      };
    }

    const ts = nowTs();
    const fallbackStats = Number.isFinite(Number(budgetDoc.spentAmount)) && Number.isFinite(Number(budgetDoc.consumeCount))
      ? {
          spentAmount: toMoney(safeNumber(budgetDoc.spentAmount, 0)),
          consumeCount: safeNumber(budgetDoc.consumeCount, 0),
        }
      : await queryBudgetRecordStatsByBudgetId(record.budgetId);

    await db.runTransaction(async (transaction) => {
      const budgetTx = await transaction.collection(BUDGET_COLLECTION).doc(record.budgetId).get();
      const latestBudget = budgetTx.data || {};
      const totalBudget = toMoney(safeNumber(latestBudget.totalBudget, 0));
      const spentBefore = Number.isFinite(Number(latestBudget.spentAmount))
        ? toMoney(safeNumber(latestBudget.spentAmount, 0))
        : fallbackStats.spentAmount;
      const countBefore = Number.isFinite(Number(latestBudget.consumeCount))
        ? safeNumber(latestBudget.consumeCount, 0)
        : fallbackStats.consumeCount;
      const spentAfter = toMoney(Math.max(0, spentBefore - toMoney(record.amount)));
      const countAfter = Math.max(0, countBefore - 1);

      const nextOverflowNotified = spentAfter > totalBudget && !!latestBudget.overflowNotified;

      await transaction.collection(BUDGET_RECORD_COLLECTION).doc(recordId).remove();
      await transaction.collection(BUDGET_COLLECTION).doc(record.budgetId).update({
        data: {
          spentAmount: spentAfter,
          consumeCount: countAfter,
          overflowNotified: nextOverflowNotified,
          updateTime: ts,
          updatedAt: ts,
        },
      });
    });

    return getBudgetChallengeDetail(openid, record.budgetId, { pageSize: 20 });
  } catch (err) {
    return { ok: false, error: '删除消费记录失败，请稍后重试' };
  }
}

async function getBudgetHomeData(openid) {
  const listRes = await getBudgetChallenges(openid);
  if (!listRes.ok) return listRes;

  return {
    ok: true,
    enableBudgetChallenge: listRes.enableBudgetChallenge !== false,
    summary: {
      ongoingBudgetChallengeCount: safeNumber(listRes.summary && listRes.summary.ongoingBudgetChallengeCount, 0),
      totalBudgetChallengeCount: safeNumber(listRes.summary && listRes.summary.totalBudgetChallengeCount, 0),
    },
    ongoingBudgetChallenges: (listRes.ongoingList || []).slice(0, 2),
  };
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action || '';

  if (action === 'getBudgetChallenges') return getBudgetChallenges(openid);
  if (action === 'getHomeData') return getBudgetHomeData(openid);
  if (action === 'getBudgetChallengeDetail') return getBudgetChallengeDetail(openid, event.challengeId, event.options || {});
  if (action === 'createBudgetChallenge') return createBudgetChallenge(openid, event.payload || {});
  if (action === 'updateBudgetChallenge') return updateBudgetChallenge(openid, event.challengeId, event.payload || {});
  if (action === 'deleteBudgetChallenge') return deleteBudgetChallenge(openid, event.challengeId);
  if (action === 'archiveBudgetChallenge') return archiveBudgetChallenge(openid, event.challengeId);
  if (action === 'addConsumeRecord') return addConsumeRecord(openid, event.challengeId, event.payload || {});
  if (action === 'updateConsumeRecord') return updateConsumeRecord(openid, event.recordId, event.payload || {});
  if (action === 'deleteConsumeRecord') return deleteConsumeRecord(openid, event.recordId);

  return { ok: false, error: 'Unknown action: ' + action };
};
