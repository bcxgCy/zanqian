/**
 * 计划分享与复制工具类
 * 基于 docs/复制计划和计划分享.md 规范实现
 *
 * 核心原则：
 * - 仅传递计划模板配置，不传递用户存款、进度、历史记录
 * - 无共同打卡，无互相查看数据
 * - 不做分享奖励，符合微信小程序平台规范
 */

const dateUtil = require('./date');
const planUtil = require('./plan');
const storage = require('./storage'); // 🆕 提前引入，避免循环依赖

// ==================== 常量配置 ====================

const SNAPSHOT_EXPIRE_DAYS = 90; // 快照有效期（天）
const SHARE_COOLDOWN_MS = 3000; // 分享冷却时间（毫秒），防止频繁生成
const STORAGE_PREFIX = 'share_';

// 快照存储键前缀（本地缓存）
const SNAPSHOT_CACHE_PREFIX = 'snapshot_cache_';

// ==================== 工具函数 ====================

/**
 * 生成唯一快照ID
 */
function generateSnapshotId() {
  return 'snap_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * 获取今天的日期字符串
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
 */
function diffDays(dateStr) {
  const target = new Date(dateStr);
  const now = new Date(today());
  return Math.floor((now - target) / (1000 * 60 * 60 * 24));
}

/**
 * 获取存储键名
 */
function getStorageKey(planId, type) {
  return `${STORAGE_PREFIX}${planId}_${type}`;
}

// ==================== 核心功能：生成计划快照 ====================

/**
 * 从计划对象中提取可分享的配置信息（脱敏处理）
 * @param {object} plan 完整的计划对象
 * @returns {object} 计划快照（仅包含配置，不含用户数据）
 */
function createPlanSnapshot(plan) {
  if (!plan) return null;

  // 提取基础配置
  const snapshot = {
    id: generateSnapshotId(),
    version: '1.0',

    // 计划基本信息（脱敏）
    name: plan.name || '存钱计划',
    icon: plan.icon || '💰',
    targetAmount: plan.targetAmount || 0,

    // 计划类型配置
    planType: plan.planType,
    presetId: plan.presetId || null,
    customConfig: plan.customConfig ? { ...plan.customConfig } : null,

    // 周期信息（只保留规则，不包含打卡状态）
    startDate: plan.startDate || today(),
    endDate: plan.endDate || '',

    // 统计摘要（用于展示）
    totalPeriods: (plan.periods || []).length,
    planTypeName: planUtil.getPlanTypeName(plan),

    // 元数据
    createdAt: new Date().toISOString(),
    expireAt: new Date(Date.now() + SNAPSHOT_EXPIRE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };

  return snapshot;
}

/**
 * 检查是否可以发起分享（冷却时间检查）
 * @param {string} planId 计划ID
 * @returns {boolean} 是否可以分享
 */
function canShare(planId) {
  try {
    const lastShareTime = wx.getStorageSync(getStorageKey(planId, 'lastShareTime'));
    if (!lastShareTime) return true;

    const elapsed = Date.now() - lastShareTime;
    return elapsed >= SHARE_COOLDOWN_MS;
  } catch (e) {
    return true;
  }
}

/**
 * 记录分享时间
 * @param {string} planId 计划ID
 */
function recordShareTime(planId) {
  try {
    wx.setStorageSync(getStorageKey(planId, 'lastShareTime'), Date.now());
  } catch (e) {
    console.warn('记录分享时间失败', e);
  }
}

// ==================== 本地缓存管理 ====================

/**
 * 缓存快照到本地（用于离线或快速访问）
 * @param {string} snapshotId 快照ID
 * @param {object} snapshot 快照数据
 */
function cacheSnapshot(snapshotId, snapshot) {
  try {
    wx.setStorageSync(`${SNAPSHOT_CACHE_PREFIX}${snapshotId}`, {
      data: snapshot,
      cachedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('缓存快照失败', e);
  }
}

/**
 * 从本地获取缓存的快照
 * @param {string} snapshotId 快照ID
 * @returns {object|null} 快照数据
 */
function getCachedSnapshot(snapshotId) {
  try {
    const cached = wx.getStorageSync(`${SNAPSHOT_CACHE_PREFIX}${snapshotId}`);
    if (!cached || !cached.data) return null;

    // 检查是否过期
    const daysCached = diffDays(cached.cachedAt.split('T')[0]);
    if (daysCached >= SNAPSHOT_EXPIRE_DAYS) {
      // 过期则清除缓存
      wx.removeStorageSync(`${SNAPSHOT_CACHE_PREFIX}${snapshotId}`);
      return null;
    }

    return cached.data;
  } catch (e) {
    return null;
  }
}

/**
 * 清除本地缓存的快照
 * @param {string} snapshotId 快照ID
 */
function clearCachedSnapshot(snapshotId) {
  try {
    wx.removeStorageSync(`${SNAPSHOT_CACHE_PREFIX}${snapshotId}`);
  } catch (e) {
    console.warn('清除缓存失败', e);
  }
}

// ==================== 云端同步 ====================

/**
 * 上传快照到云端
 * @param {object} snapshot 快照数据
 * @returns {Promise<object>} { success, snapshotId, error? }
 */
function uploadSnapshotToCloud(snapshot) {
  return new Promise((resolve) => {
    if (!wx.cloud) {
      resolve({ success: false, error: '云开发未初始化' });
      return;
    }

    wx.cloud.callFunction({
      name: 'planShare',
      data: {
        action: 'createSnapshot',
        snapshot: snapshot,
      },
    }).then((res) => {
      const result = res.result || {};
      if (result.success) {
        // 缓存到本地
        cacheSnapshot(snapshot.id, snapshot);
      }
      resolve(result);
    }).catch((err) => {
      console.error('上传快照失败', err);
      // 即使云端失败也缓存到本地
      cacheSnapshot(snapshot.id, snapshot);
      resolve({ success: true, snapshotId: snapshot.id, offline: true });
    });
  });
}

/**
 * 从云端获取快照
 * @param {string} snapshotId 快照ID
 * @returns {Promise<object>} 快照数据
 */
function fetchSnapshotFromCloud(snapshotId) {
  return new Promise((resolve) => {
    // 先尝试本地缓存
    const cached = getCachedSnapshot(snapshotId);
    if (cached) {
      resolve({ success: true, snapshot: cached, fromCache: true });
      return;
    }

    // 再尝试云端获取
    if (!wx.cloud) {
      resolve({ success: false, error: '无法获取快照', expired: true });
      return;
    }

    wx.cloud.callFunction({
      name: 'planShare',
      data: {
        action: 'getSnapshot',
        snapshotId: snapshotId,
      },
    }).then((res) => {
      const result = res.result || {};
      if (result.success && result.snapshot) {
        cacheSnapshot(snapshotId, result.snapshot);
      }
      resolve(result);
    }).catch((err) => {
      console.error('获取快照失败', err);
      resolve({ success: false, error: err.errMsg || '获取失败' });
    });
  });
}

// ==================== 场景触发器 ====================

/**
 * 发起分享计划流程
 * @param {object} plan 计划对象
 * @param {string} channel 分享渠道：'card' | 'poster'
 * @returns {Promise<object>} { success, snapshotId?, shareData? }
 */
async function triggerSharePlan(plan, channel = 'card') {
  if (!plan) {
    return { success: false, error: '计划不存在' };
  }

  // 检查冷却时间
  if (!canShare(plan.id)) {
    return { success: false, error: '操作过于频繁，请稍后再试' };
  }

  // 生成快照
  const snapshot = createPlanSnapshot(plan);
  if (!snapshot) {
    return { success: false, error: '生成快照失败' };
  }

  // 上传到云端
  const uploadResult = await uploadSnapshotToCloud(snapshot);

  if (uploadResult.success) {
    // 记录分享时间
    recordShareTime(plan.id);

    // 准备分享数据
    const shareData = {
      title: `🎯 ${snapshot.name} - 目标 ¥${snapshot.targetAmount}`,
      path: `/pages/plan-copy-preview/plan-copy-preview?snapshotId=${snapshot.id}`,
      imageUrl: '', // 使用默认截图或后续生成海报
    };

    return {
      success: true,
      snapshotId: snapshot.id,
      snapshot,
      shareData,
      channel,
    };
  }

  return uploadResult;
}

/**
 * 复制计划（直接使用）
 * @param {object} snapshot 快照数据
 * @returns {Promise<object>} { success, plan?, error? }
 */
async function copyPlanDirectly(snapshot) {
  if (!snapshot) {
    return { success: false, error: '快照不存在' };
  }

  try {
    // 构建新的空白计划
    const newPlan = buildPlanFromSnapshot(snapshot);

    // 调用 storage 创建计划（使用顶部已引入的 storage）
    const savedPlan = await storage.addPlan(newPlan);

    return {
      success: true,
      plan: savedPlan,
      modified: false,
    };
  } catch (err) {
    console.error('复制计划失败', err);
    return { success: false, error: err.message || '创建失败' };
  }
}

/**
 * 记录复制成功事件（统计埋点）
 * @param {string} snapshotId 快照ID
 * @param {boolean} modified 是否修改过配置
 * @returns {Promise<object>}
 */
async function recordCopySuccess(snapshotId, modified = false) {
  if (!wx.cloud) {
    console.log('【share】云端不可用，跳过统计');
    return { success: true, offline: true };
  }

  try {
    const result = await wx.cloud.callFunction({
      name: 'planShare',
      data: {
        action: 'recordCopy',
        snapshotId: snapshotId,
        modified: modified,
      },
    });
    console.log('【share】记录复制成功', { snapshotId, modified });
    return result.result || { success: true };
  } catch (err) {
    console.warn('【share】记录复制事件失败', err);
    return { success: false, error: err.errMsg };
  }
}

/**
 * 从快照构建新计划（空白状态）
 * @param {object} snapshot 快照数据
 * @returns {object} 新计划对象
 */
function buildPlanFromSnapshot(snapshot) {
  const startDate = snapshot.startDate || dateUtil.today();

  let planData = {
    name: snapshot.name,
    icon: snapshot.icon,
    targetAmount: snapshot.targetAmount,
    startDate: startDate,
    planType: snapshot.planType,
    presetId: snapshot.presetId,
    customConfig: snapshot.customConfig ? { ...snapshot.customConfig } : null,
  };

  // 如果有完整配置，直接生成期数
  if (snapshot.planType && (snapshot.presetId || snapshot.customConfig)) {
    const plan = planUtil.buildPlanFromCalc(planData);
    return plan;
  }

  // 否则返回基础配置
  return Object.assign({}, planData, {
    id: 'plan_' + Date.now(),
    periods: [],
    completed: false,
    createdAt: new Date().toISOString(),
  });
}

/**
 * 检查快照是否有效
 * @param {object} snapshot 快照数据
 * @returns {boolean} 是否有效
 */
function isSnapshotValid(snapshot) {
  if (!snapshot) return false;

  // 检查过期时间
  if (snapshot.expireAt) {
    const expireDate = new Date(snapshot.expireAt);
    if (new Date() > expireDate) {
      return false;
    }
  }

  return true;
}

// ==================== 导出模块 ====================

module.exports = {
  // 常量
  SNAPSHOT_EXPIRE_DAYS,
  SHARE_COOLDOWN_MS,

  // 核心功能
  createPlanSnapshot,
  canShare,
  recordShareTime,

  // 快照管理
  cacheSnapshot,
  getCachedSnapshot,
  clearCachedSnapshot,
  isSnapshotValid,

  // 云端同步
  uploadSnapshotToCloud,
  fetchSnapshotFromCloud,

  // 统计埋点
  recordCopySuccess,  // 🆕 新增

  // 场景触发器
  triggerSharePlan,
  copyPlanDirectly,
  buildPlanFromSnapshot,
};
