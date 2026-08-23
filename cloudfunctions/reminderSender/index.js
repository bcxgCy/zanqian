/**
 * 订阅消息推送云函数
 * 基于 docs/留存.md 规范实现定时推送
 *
 * 功能：
 * - 每日09:00 推送打卡提醒
 * - 每日10:00 推送到期预警（到期前3天）
 * - 每日20:00 推送结项通知
 *
 * 调用方式：
 * 1. 定时触发器调用（推荐）
 * 2. 手动调用测试：wx.cloud.callFunction({ name: 'reminderSender', data: { type: 'dailyCheckin' } })
 */

const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

// ==================== 常量配置 ====================

const TEMPLATE_ID = 'sUAAtSpg266YBGZLK68uQBEDn7cr5S-Tsl1xDg4abHo';
const PLAN_COLLECTION = 'plans';
const SUBSCRIBE_COLLECTION = 'subscribe_records'; // 订阅记录集合

// 推送类型
const PUSH_TYPES = {
  DAILY_CHECKIN: 'dailyCheckin',    // 每日打卡提醒
  EXPIRE_WARNING: 'expireWarning',  // 到期预警
  PLAN_COMPLETE: 'planComplete',    // 结项通知
};

// ==================== 工具函数 ====================

/**
 * 获取今天的日期字符串 YYYY-MM-DD
 */
function getToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 格式化时间为 HH:mm:ss
 */
function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * 计算两个日期相差天数
 */
function diffDays(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

/**
 * 截断字符串到指定长度（thing字段限制20字符）
 */
function truncate(str, maxLen = 20) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) : str;
}

// ==================== 数据库操作 ====================

/**
 * 确保订阅记录集合存在
 */
async function ensureSubscribeCollection() {
  try {
    await db.createCollection(SUBSCRIBE_COLLECTION);
  } catch (err) {
    if (!String(err.errMsg || '').includes('collection exists')) {
      console.warn('创建订阅记录集合失败', err);
    }
  }
}

/**
 * 获取用户的订阅记录
 * @param {string} openid 用户openid
 * @param {string} planId 心愿ID
 */
async function getSubscribeRecord(openid, planId) {
  try {
    const res = await db.collection(SUBSCRIBE_COLLECTION)
      .where({
        openid,
        planId,
      })
      .get();
    return res.data && res.data.length > 0 ? res.data[0] : null;
  } catch (err) {
    console.warn('获取订阅记录失败', err);
    return null;
  }
}

/**
 * 更新或创建订阅记录
 */
async function upsertSubscribeRecord(openid, planId, data) {
  await ensureSubscribeCollection();
  const existing = await getSubscribeRecord(openid, planId);
  const recordData = Object.assign({
    openid,
    planId,
    updatedAt: db.serverDate(),
  }, data);

  if (existing) {
    await db.collection(SUBSCRIBE_COLLECTION).doc(existing._id).update({
      data: recordData,
    });
  } else {
    recordData.createdAt = db.serverDate();
    await db.collection(SUBSCRIBE_COLLECTION).add({ data: recordData });
  }
}

/**
 * 标记额度已使用
 */
async function markQuotaUsed(openid, planId, pushType) {
  await upsertSubscribeRecord(openid, planId, {
    quotaUsed: true,
    usedAt: db.serverDate(),
    lastPushType: pushType,
    lastPushDate: getToday(),
  });
}

/**
 * 清除某心愿的所有订阅记录（删除心愿时调用）
 */
async function clearSubscribeRecords(planId) {
  try {
    await db.collection(SUBSCRIBE_COLLECTION)
      .where({ planId })
      .remove();
  } catch (err) {
    console.warn('清除订阅记录失败', err);
  }
}

// ==================== 推送逻辑 ====================

/**
 * 发送订阅消息
 * @param {object} params
 * @param {string} params.openid 用户openid
 * @param {string} params.planId 心愿ID
 * @param {string} params.pushType 推送类型
 * @param {string} params.time1 打卡时间
 * @param {string} params.thing6 打卡名称
 * @param {string} params.thing3 备注
 * @param {string} params.page 跳转页面路径
 */
async function sendSubscribeMessage(params) {
  const { openid, planId, pushType, time1, thing6, thing3, page } = params;

  try {
    const result = await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId: TEMPLATE_ID,
      page: page || `/pages/plan-detail/plan-detail?id=${planId}`,
      data: {
        time1: { value: time1 || getToday() + ' ' + formatTime(new Date()) },
        thing6: { value: truncate(thing6, '心愿存钱打卡') },
        thing3: { value: truncate(thing3, 20) },
      },
      miniprogramState: 'formal', // 正式版
    });

    console.log(`推送成功 [${pushType}]`, { openid, planId, result });

    // 标记额度已使用
    await markQuotaUsed(openid, planId, pushType);

    return { success: true, result };
  } catch (err) {
    console.error(`推送失败 [${pushType}]`, err);

    // 判断是否是额度不足等可预期的错误
    const errMsg = err.errMsg || '';
    if (errMsg.includes('40003') || errMsg.includes('43101')) {
      // 40003: touser字段openid为空或者不正确
      // 43101: 用户拒绝接受消息，用户在前端界面勾选了"总是保持以上选择，不再询问"
      // 这些情况下标记为无效，避免重复尝试
      await markQuotaUsed(openid, planId, pushType);
    }

    return { success: false, error: errMsg };
  }
}

/**
 * 检查是否应该推送（前置校验）
 * 规则：额度存在、未过期、当日未推送，三者全部满足才推送
 * @param {object} record 订阅记录
 * @returns {boolean}
 */
function shouldPush(record) {
  if (!record) return false;

  // 1. 检查授权是否存在
  if (!record.authTime) return false;

  // 2. 检查是否在7天有效期内
  const daysSinceAuth = diffDays(record.authTime, getToday());
  if (daysSinceAuth >= 7) {
    return false; // 已过期
  }

  // 3. 检查额度是否已使用
  if (record.quotaUsed) return false;

  // 4. 检查今日是否已推送
  if (record.lastPushDate === getToday()) return false;

  return true;
}

// ==================== 定时任务 ====================

/**
 * 场景5.1：每日打卡提醒（核心场景）
 * 推送时机：用户自定义打卡日 09:00
 * 模板内容：
 *   - time1: 当日系统时间
 *   - thing6: 心愿存钱打卡
 *   - thing3: 记得完成今日存钱打卡，坚持积累心愿资金
 * 跳转页面：对应心愿详情页
 */
async function pushDailyCheckin() {
  console.log('【定时任务】开始执行每日打卡提醒推送');
  const today = getToday();
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  try {
    // 查询所有有效的心愿（未完成、未暂停）
    const plansRes = await db.collection(PLAN_COLLECTION)
      .where({
        completed: _.exists(false).or(_.eq(false)),
        paused: _.exists(false).or(_.eq(false)),
      })
      .get();

    const plans = plansRes.data || [];

    for (const plan of plans) {
      try {
        // 找到今天需要打卡的期数
        const todayPeriod = (plan.periods || []).find(
          (p) => p.date === today && !p.completed
        );

        if (!todayPeriod) {
          skipCount++;
          continue; // 今天不需要打卡
        }

        // 检查订阅状态
        const record = await getSubscribeRecord(plan.openid, plan.id);
        if (!shouldPush(record)) {
          skipCount++;
          continue;
        }

        // 发送推送
        const result = await sendSubscribeMessage({
          openid: plan.openid,
          planId: plan.id,
          pushType: PUSH_TYPES.DAILY_CHECKIN,
          thing6: '心愿存钱打卡',
          thing3: `记得完成今日存钱打卡，坚持积累${truncate(plan.name)}资金`,
          page: `/pages/plan-detail/plan-detail?id=${plan.id}`,
        });

        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        console.error('处理计划推送失败', plan.id, err);
        failCount++;
      }
    }
  } catch (err) {
    console.error('查询计划列表失败', err);
  }

  console.log(`【定时任务】打卡提醒推送完成 成功:${successCount} 失败:${failCount} 跳过:${skipCount}`);
  return { successCount, failCount, skipCount, type: PUSH_TYPES.DAILY_CHECKIN };
}

/**
 * 场景5.2：心愿到期预警提醒
 * 推送时机：心愿到期前3天 10:00
 * 模板内容：
 *   - time1: 当日系统时间
 *   - thing6: 心愿到期预警提醒
 *   - thing3: 心愿即将到期，尽快完成存钱目标
 * 跳转页面：对应心愿详情页
 */
async function pushExpireWarning() {
  console.log('【定时任务】开始执行到期预警推送');
  const today = getToday();
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  try {
    // 查询所有有效的心愿
    const plansRes = await db.collection(PLAN_COLLECTION)
      .where({
        completed: _.exists(false).or(_.eq(false)),
        paused: _.exists(false).or(_.eq(false)),
        endDate: _.exists(true).and(_.neq('')),
      })
      .get();

    const plans = plansRes.data || [];

    for (const plan of plans) {
      try {
        // 检查是否在到期前3天内
        const daysToExpire = diffDays(today, plan.endDate);
        if (daysToExpire > 3 || daysToExpire < 0) {
          skipCount++;
          continue;
        }

        // 检查订阅状态
        const record = await getSubscribeRecord(plan.openid, plan.id);
        if (!shouldPush(record)) {
          skipCount++;
          continue;
        }

        // 发送推送
        const result = await sendSubscribeMessage({
          openid: plan.openid,
          planId: plan.id,
          pushType: PUSH_TYPES.EXPIRE_WARNING,
          thing6: '心愿到期预警提醒',
          thing3: `${truncate(plan.name)}即将到期，尽快完成存钱目标`,
          page: `/pages/plan-detail/plan-detail?id=${plan.id}`,
        });

        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        console.error('处理预警推送失败', plan.id, err);
        failCount++;
      }
    }
  } catch (err) {
    console.error('查询计划列表失败', err);
  }

  console.log(`【定时任务】到期预警推送完成 成功:${successCount} 失败:${failCount} 跳过:${skipCount}`);
  return { successCount, failCount, skipCount, type: PUSH_TYPES.EXPIRE_WARNING };
}

/**
 * 场景5.3：心愿结项完结提醒
 * 推送时机：心愿到期当日 20:00
 * 模板内容：
 *   - time1: 当日系统时间
 *   - thing6: 心愿周期结束通知
 *   - thing3: 心愿周期已完结，查看最终存钱成果吧
 * 跳转页面：心愿列表页
 */
async function pushPlanComplete() {
  console.log('【定时任务】开始执行结项通知推送');
  const today = getToday();
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  try {
    // 查询今日到期的心愿
    const plansRes = await db.collection(PLAN_COLLECTION)
      .where({
        endDate: today,
        completed: _.exists(false).or(_.eq(false)),
      })
      .get();

    const plans = plansRes.data || [];

    for (const plan of plans) {
      try {
        // 检查订阅状态
        const record = await getSubscribeRecord(plan.openid, plan.id);
        if (!shouldPush(record)) {
          skipCount++;
          continue;
        }

        // 发送推送
        const result = await sendSubscribeMessage({
          openid: plan.openid,
          planId: plan.id,
          pushType: PUSH_TYPES.PLAN_COMPLETE,
          thing6: '心愿周期结束通知',
          thing3: `${truncate(plan.name)}已完结，查看最终存钱成果吧`,
          page: '/pages/index/index',
        });

        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        console.error('处理结项推送失败', plan.id, err);
        failCount++;
      }
    }
  } catch (err) {
    console.error('查询计划列表失败', err);
  }

  console.log(`【定时任务】结项通知推送完成 成功:${successCount} 失败:${failCount} 跳过:${skipCount}`);
  return { successCount, failCount, skipCount, type: PUSH_TYPES.PLAN_COMPLETE };
}

// ==================== 同步授权状态（前端调用）====================

/**
 * 前端授权成功后，同步授权状态到云端
 * 前端 subscribe.js 的 recordAuth() 应配合调用此接口
 */
async function syncAuthStatus(openid, planId) {
  await upsertSubscribeRecord(openid, planId, {
    authTime: getToday(),
    quotaUsed: false,
    rejectTime: null,
  });
  return { success: true, message: '授权状态已同步' };
}

/**
 * 清除某心愿的订阅记录（删除心愿时调用）
 */
async function clearRecordsByPlanId(planId) {
  await clearSubscribeRecords(planId);
  return { success: true, message: '订阅记录已清除' };
}

// ==================== 主入口 ====================

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const type = event.type;

  console.log('【reminderSender】收到请求', { type, openid, event });

  switch (type) {
    // ========== 定时任务入口 ==========
    case PUSH_TYPES.DAILY_CHECKIN:
      return pushDailyCheckin();

    case PUSH_TYPES.EXPIRE_WARNING:
      return pushExpireWarning();

    case PUSH_TYPES.PLAN_COMPLETE:
      return pushPlanComplete();

    // ========== 前端同步入口 ==========
    case 'syncAuth':
      // 前端授权成功后调用，同步授权状态
      return syncAuthStatus(openid, event.planId);

    case 'clearRecords':
      // 删除心愿时调用，清除订阅记录
      return clearRecordsByPlanId(event.planId);

    case 'getStatus':
      // 查询订阅状态（调试用）
      const record = await getSubscribeRecord(openid, event.planId);
      return {
        record,
        shouldPush: shouldPush(record),
      };

    default:
      return {
        error: 'Unknown type: ' + type,
        availableTypes: Object.values(PUSH_TYPES).concat(['syncAuth', 'clearRecords', 'getStatus']),
      };
  }
};
