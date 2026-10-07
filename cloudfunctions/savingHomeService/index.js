const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const ensuredCollections = {};

const APPROVAL_COLLECTION = 'saving_approvals';
const CHALLENGE_COLLECTION = 'saving_challenges';

function safeNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
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

function diffDays(fromKey, toKey) {
  const from = fromDateKey(fromKey);
  const to = fromDateKey(toKey);
  if (!from || !to) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

function addDays(dateKey, offset) {
  const date = fromDateKey(dateKey);
  if (!date) return dateKey;
  date.setDate(date.getDate() + offset);
  return toDateKey(date);
}

function getTodayKey() {
  return toDateKey(new Date());
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

function getApprovalStatus(doc) {
  if (doc.finalDecision === 'abandoned') return 'abandoned';
  if (doc.finalDecision === 'purchased') return 'purchased';
  const votes = Array.isArray(doc.reviews) ? doc.reviews.length : 0;
  const targetVotes = safeNumber(doc.targetVotes, 1);
  if (votes >= targetVotes) return 'result';
  return 'voting';
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
  let streak = 0;
  for (let i = 0; i < safeNumber(doc.days, 1); i++) {
    const key = addDays(todayKey, -i);
    if (key < doc.startDate || key > doc.endDate) continue;
    if (checkinMap[key] === 'checked' || checkinMap[key] === 'repair') streak += 1;
    else break;
  }
  return streak;
}

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  await Promise.all([
    ensureCollection(APPROVAL_COLLECTION),
    ensureCollection(CHALLENGE_COLLECTION),
  ]);

  const [approvalRes, challengeRes] = await Promise.all([
    db.collection(APPROVAL_COLLECTION)
      .where({ openid })
      .field({
        _id: true,
        itemName: true,
        price: true,
        targetVotes: true,
        reviews: true,
        finalDecision: true,
        updatedAt: true,
      })
      .orderBy('updatedAt', 'desc')
      .limit(100)
      .get(),
    db.collection(CHALLENGE_COLLECTION)
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
      .get(),
  ]);

  const approvals = approvalRes.data || [];
  const challenges = challengeRes.data || [];

  const approvalSaved = approvals.reduce((sum, item) => sum + (getApprovalStatus(item) === 'abandoned' ? safeNumber(item.price, 0) : 0), 0);
  const ongoingApprovals = approvals.filter((item) => getApprovalStatus(item) === 'voting').slice(0, 2).map((item) => ({
    id: item._id,
    itemName: item.itemName,
    price: safeNumber(item.price, 0),
    statusText: '投票中',
    updatedAt: safeNumber(item.updatedAt, 0),
  }));

  const pendingApprovalCount = approvals.filter((item) => getApprovalStatus(item) === 'voting').length;

  const challengeSaved = challenges.reduce((sum, item) => sum + getChallengeSaved(item), 0);
  const ongoingChallengesRaw = challenges.filter((item) => getChallengeStatus(item) === 'ongoing');
  const ongoingChallenges = ongoingChallengesRaw.slice(0, 2).map((item) => ({
    id: item._id,
    name: item.name,
    leftDays: Math.max(0, diffDays(getTodayKey(), item.endDate) + 1),
    streakDays: getChallengeStreak(item),
  }));

  return {
    ok: true,
    summary: {
      approvalSaved,
      pendingApprovalCount,
      challengeSaved,
      ongoingChallengeCount: ongoingChallengesRaw.length,
    },
    ongoingApprovals,
    ongoingChallenges,
  };
};
