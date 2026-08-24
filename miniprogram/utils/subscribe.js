/**
 * 订阅消息工具类
 * 基于 docs/留存.md 规范实现
 *
 * 核心规则：
 * - 单次授权 = 1次推送额度 + 7天有效期
 * - 授权7天有效期：控制推送额度是否可用
 * - 拒绝7天冷却期：控制前端弹窗是否可再次弹出
 * - 所有授权、额度、过期时间按单个心愿独立记录
 */

// ==================== 常量配置 ====================

const TEMPLATE_ID = 'sUAAtSpg266YBGZLK68uQBEDn7cr5S-Tsl1xDg4abHo';
const AUTH_VALID_DAYS = 7; // 授权有效期（天）
const COOLDOWN_DAYS = 7; // 拒绝冷却期（天）

// 存储键前缀
const STORAGE_PREFIX = 'subscribe_';

// ==================== 工具函数 ====================

/**
 * 获取存储键名
 * @param {string} planId 心愿ID
 * @param {string} type 类型：auth|reject|used|lastPush
 */
function getStorageKey(planId, type) {
  return `${STORAGE_PREFIX}${planId}_${type}`;
}

/**
 * 获取今天的日期字符串 YYYY-MM-DD
 */
function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 计算两个日期相差天数
 * @param {string} dateStr 日期字符串 YYYY-MM-DD
 */
function diffDays(dateStr) {
  const target = new Date(dateStr);
  const now = new Date(today());
  return Math.floor((now - target) / (1000 * 60 * 60 * 24));
}

// ==================== 状态查询接口 ====================

/**
 * 检查是否有有效的订阅授权额度
 * @param {string} planId 心愿ID
 * @returns {boolean} 是否有有效额度
 */
function hasValidAuth(planId) {
  try {
    const authTime = wx.getStorageSync(getStorageKey(planId, 'auth'));
    if (!authTime) return false;

    // 检查是否在7天有效期内
    const daysPassed = diffDays(authTime);
    if (daysPassed >= AUTH_VALID_DAYS) {
      // 已过期，清除记录
      clearAuth(planId);
      return false;
    }

    // 检查额度是否已使用
    const used = wx.getStorageSync(getStorageKey(planId, 'used'));
    if (used) return false;

    return true;
  } catch (e) {
    console.warn('检查订阅状态失败', e);
    return false;
  }
}

/**
 * 检查是否在拒绝冷却期内
 * @param {string} planId 心愿ID
 * @returns {boolean} 是否在冷却期
 */
function isInCooldown(planId) {
  try {
    const rejectTime = wx.getStorageSync(getStorageKey(planId, 'reject'));
    if (!rejectTime) return false;

    const daysPassed = diffDays(rejectTime);
    return daysPassed < COOLDOWN_DAYS;
  } catch (e) {
    return false;
  }
}

/**
 * 获取按钮状态信息
 * @param {string} planId 心愿ID
 * @returns {object} { status: 'active'|'disabled'|'cooldown', text: string, remainingDays: number }
 */
function getButtonStatus(planId) {
  // 有有效额度
  if (hasValidAuth(planId)) {
    const authTime = wx.getStorageSync(getStorageKey(planId, 'auth'));
    const remaining = Math.max(0, AUTH_VALID_DAYS - diffDays(authTime));
    return {
      status: 'disabled',
      text: `${remaining}天打卡提醒已生效`,
      remainingDays: remaining,
    };
  }

  // 在冷却期
  if (isInCooldown(planId)) {
    const rejectTime = wx.getStorageSync(getStorageKey(planId, 'reject'));
    const remaining = Math.max(0, COOLDOWN_DAYS - diffDays(rejectTime));
    return {
      status: 'cooldown',
      text: `${remaining}天后可重新开启`,
      remainingDays: remaining,
    };
  }

  // 可点击
  return {
    status: 'active',
    text: '开启打卡消息提醒',
    remainingDays: 0,
  };
}

// ==================== 授权操作接口 ====================

/**
 * 请求订阅消息授权（核心方法）
 * ⚠️ 重要：此方法必须在用户 TAP 事件的同步调用栈中直接调用！
 * 不能在 setTimeout、Promise.then、async/await 等异步上下文中调用。
 *
 * @param {string} planId 心愿ID
 */
function requestSubscribe(planId) {
  // 前置校验：是否在冷却期
  if (isInCooldown(planId)) {
    wx.showToast({
      title: '暂时无法开启，请稍后再试',
      icon: 'none',
    });
    return false;
  }

  // 前置校验：已有有效额度
  if (hasValidAuth(planId)) {
    wx.showToast({
      title: '提醒已生效，无需重复开启',
      icon: 'none',
    });
    return false;
  }

  // 直接发起订阅请求（必须在 TAP 同步调用栈中）
  wx.requestSubscribeMessage({
    tmplIds: [TEMPLATE_ID],
    success: (res) => {
      if (res[TEMPLATE_ID] === 'accept') {
        // 用户同意：记录授权时间
        recordAuth(planId);
        wx.showToast({
          title: '打卡提醒已开启',
          icon: 'success',
        });
      } else {
        // 用户拒绝：记录拒绝时间（7天冷却）
        recordReject(planId);
        wx.showToast({
          title: '已取消',
          icon: 'none',
        });
      }
    },
    fail: (err) => {
      console.warn('订阅请求失败', err);
      // 不显示错误提示，静默失败
    },
  });

  return true; // 表示已发起请求（不代表用户同意）
}

/**
 * 记录授权成功（本地 + 云端同步）
 * @param {string} planId 心愿ID
 */
function recordAuth(planId) {
  try {
    wx.setStorageSync(getStorageKey(planId, 'auth'), today());
    // 清除之前的拒绝记录和使用记录
    wx.removeStorageSync(getStorageKey(planId, 'reject'));
    wx.removeStorageSync(getStorageKey(planId, 'used'));

    // 同步授权状态到云端（异步，不阻塞）
    syncAuthToCloud(planId);
  } catch (e) {
    console.warn('记录授权失败', e);
  }
}

/**
 * 同步授权状态到云端
 * @param {string} planId 心愿ID
 */
function syncAuthToCloud(planId) {
  try {
    wx.cloud.callFunction({
      name: 'reminderSender',
      data: {
        type: 'syncAuth',
        planId: planId,
      },
    }).catch((err) => {
      console.warn('同步授权状态到云端失败', err);
    });
  } catch (e) {
    // 非云开发环境或调用失败不影响本地功能
    console.warn('云端同步不可用', e);
  }
}

/**
 * 记录用户拒绝
 * @param {string} planId 心愿ID
 */
function recordReject(planId) {
  try {
    wx.setStorageSync(getStorageKey(planId, 'reject'), today());
  } catch (e) {
    console.warn('记录拒绝失败', e);
  }
}

/**
 * 标记额度已使用（推送成功后调用）
 * @param {string} planId 心愿ID
 */
function markAsUsed(planId) {
  try {
    wx.setStorageSync(getStorageKey(planId, 'used'), today());
    // 清除授权记录（额度已消耗）
    wx.removeStorageSync(getStorageKey(planId, 'auth'));
  } catch (e) {
    console.warn('标记使用状态失败', e);
  }
}

/**
 * 清除授权记录（过期时调用）
 * @param {string} planId 心愿ID
 */
function clearAuth(planId) {
  try {
    wx.removeStorageSync(getStorageKey(planId, 'auth'));
    wx.removeStorageSync(getStorageKey(planId, 'used'));
  } catch (e) {
    console.warn('清除授权记录失败', e);
  }
}

/**
 * 清除某心愿的所有订阅记录（删除心愿时调用）
 * 本地 + 云端同步清除
 * @param {string} planId 心愿ID
 */
function clearAllRecords(planId) {
  try {
    // 清除本地存储
    wx.removeStorageSync(getStorageKey(planId, 'auth'));
    wx.removeStorageSync(getStorageKey(planId, 'reject'));
    wx.removeStorageSync(getStorageKey(planId, 'used'));
    wx.removeStorageSync(getStorageKey(planId, 'lastPush'));

    // 同步清除云端记录（异步，不阻塞）
    clearCloudRecords(planId);
  } catch (e) {
    console.warn('清除订阅记录失败', e);
  }
}

/**
 * 清除云端订阅记录
 * @param {string} planId 心愿ID
 */
function clearCloudRecords(planId) {
  try {
    wx.cloud.callFunction({
      name: 'reminderSender',
      data: {
        type: 'clearRecords',
        planId: planId,
      },
    }).catch((err) => {
      console.warn('清除云端订阅记录失败', err);
    });
  } catch (e) {
    console.warn('云端清除不可用', e);
  }
}

// ==================== 场景触发器 ====================

/**
 * 场景一：新建心愿成功后（已移除自动引导）
 * 由于微信限制 requestSubscribeMessage 必须在 TAP 手势同步调用栈中调用，
 * 新建成功后不再弹出引导，用户可通过详情页名称右侧的手动按钮开启提醒。
 * @param {string} planId 新建的心愿ID
 */
function triggerAfterCreate(planId) {
  console.log('【订阅】新建心愿成功', { planId });
  // 不再自动弹窗引导，用户通过手动按钮触发授权
   return requestSubscribe(planId);
}

/**
 * 场景二：打卡成功后（已移除自动引导）
 * 由于微信限制 requestSubscribeMessage 必须在 TAP 手势同步调用栈中调用，
 * 打卡成功后不再弹出引导，用户可通过详情页名称右侧的手动按钮开启提醒。
 * @param {string} planId 打卡的心愿ID
 */
function triggerAfterCheckin(planId) {
  console.log('【订阅】打卡成功', { planId });
  // 不再自动弹窗引导，用户通过手动按钮触发授权
   return requestSubscribe(planId);
}

/**
 * 场景三：手动点击按钮触发
 * 直接调用 requestSubscribe 即可（同步调用，符合 TAP 手势要求）
 * @param {string} planId 心愿ID
 */
function triggerManual(planId) {
  return requestSubscribe(planId);
}

// ==================== 导出模块 ====================

module.exports = {
  // 常量
  TEMPLATE_ID,
  AUTH_VALID_DAYS,
  COOLDOWN_DAYS,

  // 状态查询
  hasValidAuth,
  isInCooldown,
  getButtonStatus,

  // 授权操作
  requestSubscribe,
  markAsUsed,
  clearAllRecords,

  // 场景触发器（推荐使用）
  triggerAfterCreate,   // 新建心愿成功后调用
  triggerAfterCheckin,  // 打卡成功后调用
  triggerManual,        // 手动按钮点击时调用
};
