const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const TEMPLATE_ID = 'sUAAtSpg266YBGZLK68uQKqgFd_73cfnEZ0OhglS7Ow';
const CHALLENGE_COLLECTION = 'saving_challenges';
const SUBSCRIBE_COLLECTION = 'subscribe_records';
const RECORD_TYPE = 'challenge';

function getToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function truncate(str, maxLen = 20) {
  if (!str) return '';
  const text = String(str);
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function isChallengeOngoing(challenge, today) {
  if (!challenge) return false;
  if (!challenge.startDate || !challenge.endDate) return false;
  if (today < challenge.startDate || today > challenge.endDate) return false;

  const checkinMap = challenge.checkinMap || {};
  const checkedCount = Object.keys(checkinMap).filter((key) => checkinMap[key] === 'checked' || checkinMap[key] === 'repair').length;
  const totalDays = Number(challenge.days || 0);
  if (totalDays > 0 && checkedCount >= totalDays) return false;

  return true;
}

function needsTodayCheckin(challenge, today) {
  if (!isChallengeOngoing(challenge, today)) return false;
  const checkinMap = challenge.checkinMap || {};
  const status = checkinMap[today];
  return status !== 'checked' && status !== 'repair';
}

function shouldPush(record) {
  if (!record || !record.authTime) return false;
  if (record.quotaUsed) return false;
  if (record.lastPushDate === getToday()) return false;
  return true;
}

function getMiniProgramState() {
  try {
    const env = cloud.DYNAMIC_CURRENT_ENV;
    const envStr = typeof env === 'string' ? env : String(env || '');
    if (envStr && (envStr.includes('prod') || envStr.includes('release') || envStr.includes('formal'))) {
      return 'formal';
    }
  } catch (err) {
    console.warn('获取环境信息失败，默认 developer', err);
  }
  return 'developer';
}

async function getChallengeSubscribeRecord(openid, challengeId) {
  const res = await db.collection(SUBSCRIBE_COLLECTION)
    .where({
      openid,
      planId: challengeId,
      recordType: RECORD_TYPE,
    })
    .limit(1)
    .get();
  return (res.data || [])[0] || null;
}

async function markQuotaUsed(openid, challengeId) {
  const record = await getChallengeSubscribeRecord(openid, challengeId);
  if (!record) return;
  await db.collection(SUBSCRIBE_COLLECTION).doc(record._id).update({
    data: {
      quotaUsed: true,
      usedAt: db.serverDate(),
      lastPushType: 'challengeDailyCheckin',
      lastPushDate: getToday(),
      updatedAt: db.serverDate(),
    },
  });
}

async function sendChallengeReminder(challenge) {
  const openid = challenge.openid;
  const challengeId = challenge._id;
  if (!openid || !challengeId) return { success: false, reason: 'missing_openid_or_id' };

  const record = await getChallengeSubscribeRecord(openid, challengeId);
  if (!shouldPush(record)) return { success: false, reason: 'no_quota_or_expired' };

  try {
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId: TEMPLATE_ID,
      page: `/pages/saving-challenge-detail/saving-challenge-detail?id=${challengeId}`,
      data: {
        time1: { value: `${getToday()} 17:00:00` },
        thing6: { value: truncate('省钱挑战打卡提醒') },
        thing3: { value: truncate(`记得完成「${challenge.name || '省钱挑战'}」今日打卡`) },
      },
      miniprogramState: getMiniProgramState(),
    });

    await markQuotaUsed(openid, challengeId);
    return { success: true };
  } catch (err) {
    const msg = String((err && err.errMsg) || err.message || '');
    console.error('挑战提醒推送失败', challengeId, msg);
    if (msg.includes('43101') || msg.includes('40003')) {
      await markQuotaUsed(openid, challengeId);
    }
    return { success: false, reason: msg || 'send_failed' };
  }
}

async function pushDailyChallengeReminder() {
  const today = getToday();
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  const res = await db.collection(CHALLENGE_COLLECTION)
    .where(_.and([
      { startDate: _.lte(today) },
      { endDate: _.gte(today) },
    ]))
    .limit(200)
    .get();

  const challenges = res.data || [];
  for (const challenge of challenges) {
    if (!needsTodayCheckin(challenge, today)) {
      skipCount++;
      continue;
    }

    const result = await sendChallengeReminder(challenge);
    if (result.success) {
      successCount++;
    } else if (result.reason === 'no_quota_or_expired' || result.reason === 'missing_openid_or_id') {
      skipCount++;
    } else {
      failCount++;
    }
  }

  return {
    type: 'challengeDailyCheckin',
    date: today,
    total: challenges.length,
    successCount,
    failCount,
    skipCount,
  };
}

exports.main = async (event) => {
  const triggerName = event.TriggerName;
  let type = event.type;

  if (triggerName && !type) {
    if (triggerName === 'challengeDailyReminderTrigger') {
      type = 'challengeDailyCheckin';
    }
  }

  if (type === 'challengeDailyCheckin') {
    return pushDailyChallengeReminder();
  }

  return {
    error: 'Unknown type',
    received: { type, triggerName },
  };
};
