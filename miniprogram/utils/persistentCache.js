/**
 * persistentCache.js - 本地持久化缓存模块
 *
 * 功能：
 * 1. 将云端数据持久化到 wx.storage（小程序重启后仍可用）
 * 2. 支持离线浏览（弱网/断网时展示最近数据）
 * 3. 热启动加速（从本地存储恢复，无需等待网络）
 *
 * 使用方式：
 * - 在 storage.js 的 getState() 中集成
 * - 成功后调用 persistentCache.save(result)
 * - 失败时降级到 persistentCache.load()
 */

const STORAGE_KEYS = {
  STATE: 'app_cache_state',       // 用户状态
  PLANS: 'app_cache_plans',       // 计划列表
  TIMESTAMP: 'app_cache_timestamp', // 缓存时间戳
  VERSION: 'app_cache_version',    // 缓存格式版本（用于升级兼容）
};

const PersistentCache = {
  // 配置
  MAX_AGE: 24 * 60 * 60 * 1000, // 缓存有效期：24小时（毫秒）
  CURRENT_VERSION: '1.0',        // 当前缓存格式版本

  /**
   * 保存数据到本地存储
   * @param {object} data 云端返回的完整状态 { openid, user, plans }
   * @returns {boolean} 是否保存成功
   */
  save(data) {
    try {
      if (!data || (!data.user && !data.plans)) {
        console.warn('[PersistentCache] 数据为空，跳过保存');
        return false;
      }

      // 只缓存必要字段，避免超出 10MB 限制
      const stateToSave = data.user ? {
        nickName: data.user.nickName || '',
        avatarUrl: data.user.avatarUrl || '',
        savingDays: data.user.savingDays || 0,
      } : null;

      const plansToSave = (data.plans || []).map((plan) => ({
        id: plan.id,
        name: plan.name || '',
        targetAmount: plan.targetAmount || 0,
        currentAmount: plan.currentAmount || 0,
        startDate: plan.startDate || '',
        endDate: plan.endDate || '',
        paused: !!plan.paused,
        completed: !!plan.completed,
        planType: plan.planType || '',
        periods: (plan.periods || []).slice(0, 50), // 最多保留50个期数
      }));

      // 截断过长的数据（防止超限）
      if (plansToSave.length > 100) {
        console.warn(`[PersistentCache] 计划数量过多(${plansToSave.length})，只缓存前100个`);
        plansToSave.length = 100;
      }

      wx.setStorageSync(STORAGE_KEYS.STATE, JSON.stringify(stateToSave));
      wx.setStorageSync(STORAGE_KEYS.PLANS, JSON.stringify(plansToSave));
      wx.setStorageSync(STORAGE_KEYS.TIMESTAMP, Date.now());
      wx.setStorageSync(STORAGE_KEYS.VERSION, this.CURRENT_VERSION);

      console.log(`[PersistentCache] 已保存 ${plansToSave.length} 个计划到本地`);
      return true;
    } catch (e) {
      // 存储空间不足等异常情况
      console.error('[PersistentCache] 保存失败', e);
      this.clear(); // 清除可能损坏的旧数据
      return false;
    }
  },

  /**
   * 从本地存储加载数据
   * @returns {object|null} 缓存的数据对象，无有效缓存时返回 null
   */
  load() {
    try {
      const timestamp = wx.getStorageSync(STORAGE_KEYS.TIMESTAMP);
      if (!timestamp) {
        console.log('[PersistentCache] 无本地缓存');
        return null;
      }

      // 检查是否过期
      const age = Date.now() - timestamp;
      if (age > this.MAX_AGE) {
        console.log(`[PersistentCache] 本地缓存已过期 (${Math.round(age / 3600000)} 小时前)`);
        this.clear();
        return null;
      }

      // 检查版本兼容性
      const version = wx.getStorageSync(STORAGE_KEYS.VERSION);
      if (version && version !== this.CURRENT_VERSION) {
        console.log(`[PersistentCache] 缓存格式版本不匹配 (${version} → ${this.CURRENT_VERSION})，清除旧缓存`);
        this.clear();
        return null;
      }

      // 读取并解析数据
      const stateStr = wx.getStorageSync(STORAGE_KEYS.STATE);
      const plansStr = wx.getStorageSync(STORAGE_KEYS.PLANS);

      const user = stateStr ? JSON.parse(stateStr) : null;
      const plans = plansStr ? JSON.parse(plansStr) : [];

      if ((!user || !plans.length) && !plansStr) {
        console.log('[PersistentCache] 本地缓存数据为空');
        return null;
      }

      console.log(`[PersistentCache] 从本地加载 ${plans.length} 个计划（${Math.round(age / 60000)} 分钟前缓存）`);

      return {
        openid: '', // 持久化不存储 openid（安全考虑）
        user: user || { nickName: '', avatarUrl: '', savingDays: 0 },
        plans,
        _fromCache: true, // 标记来源，方便前端区分
        _cachedAt: new Date(timestamp).toISOString(),
      };
    } catch (e) {
      console.error('[PersistentCache] 加载失败', e);
      return null;
    }
  },

  /**
   * 清除所有本地缓存
   */
  clear() {
    try {
      wx.removeStorageSync(STORAGE_KEYS.STATE);
      wx.removeStorageSync(STORAGE_KEYS.PLANS);
      wx.removeStorageSync(STORAGE_KEYS.TIMESTAMP);
      wx.removeStorageSync(STORAGE_KEYS.VERSION);
      console.log('[PersistentCache] 已清除本地缓存');
    } catch (e) {
      console.warn('[PersistentCache] 清除缓存失败', e);
    }
  },

  /**
   * 检查是否有可用的本地缓存
   * @returns {boolean}
   */
  hasValidCache() {
    try {
      const timestamp = wx.getStorageSync(STORAGE_KEYS.TIMESTAMP);
      return timestamp && (Date.now() - timestamp) < this.MAX_AGE;
    } catch (e) {
      return false;
    }
  },

  /**
   * 获取缓存年龄（用于调试显示）
   * @returns {number} 缓存年龄（毫秒），无缓存时返回 -1
   */
  getCacheAge() {
    try {
      const timestamp = wx.getStorageSync(STORAGE_KEYS.TIMESTAMP);
      return timestamp ? (Date.now() - timestamp) : -1;
    } catch (e) {
      return -1;
    }
  },
};

module.exports = PersistentCache;
