const planUtil = require('./plan');
const money = require('./money');
const cloudSync = require('./cloudSync');
const dateUtil = require('./date');
const persistentCache = require('./persistentCache'); // ✅ 新增：持久化缓存模块

const defaultUser = {
  nickName: '存钱达人',
  avatarUrl: '',
  savingDays: 0,
};

// ==================== 缓存管理器（优化云函数调用） ====================

/**
 * CacheManager - 多级缓存管理器
 *
 * 功能：
 * 1. 内存缓存（带 TTL 过期机制）
 * 2. 并发请求去重（相同请求只发1次网络调用）
 * 3. 写操作自动失效缓存
 * 4. 支持按计划ID索引（避免全量扫描）
 */
const CacheManager = {
  // 缓存存储
  _cache: {
    state: null,      // { user, plans[], _timestamp }
    plans: null,      // plans[] (冗余，方便直接访问)
    planMap: {},      // { [planId]: plan } (按ID索引，O(1)查找)
  },

  // 配置
  TTL: {
    STATE: 30000,     // 用户状态缓存30秒
    PLANS: 30000,     // 计划列表缓存30秒
    PLAN: 60000,      // 单个计划缓存60秒
  },

  // 并发请求去重锁（防止快速切换页面时重复请求）
  _promises: {
    getState: null,
    getPlans: null,
    getPlan: {},      // { [planId]: Promise }
  },

  /**
   * 检查缓存是否有效
   */
  isValid(cacheKey) {
    const cached = this._cache[cacheKey];
    if (!cached) return false;
    if (!cached._timestamp) return false;
    const ttlKey = cacheKey.toUpperCase();
    const ttl = this.TTL[ttlKey] || this.TTL.STATE;
    return (Date.now() - cached._timestamp) < ttl;
  },

  /**
   * 设置缓存（自动同步更新派生缓存）
   */
  set(cacheKey, data) {
    this._cache[cacheKey] = Object.assign({}, data, {
      _timestamp: Date.now(),
    });

    // 同步更新 plans 和 planMap（方便直接访问）
    if (cacheKey === 'state') {
      const plans = data.plans || [];
      this._cache.plans = { data: plans, _timestamp: Date.now() };
      this._cache.planMap = {};
      plans.forEach((p) => {
        if (p && p.id) {
          this._cache.planMap[p.id] = Object.assign({}, p, { _timestamp: Date.now() });
        }
      });
    }
  },

  /**
   * 获取缓存数据
   */
  get(cacheKey, planId) {
    // 单计划查询：从 planMap 中 O(1) 获取
    if (cacheKey === 'plan' && planId) {
      const cached = this._cache.planMap[planId];
      if (cached && (Date.now() - cached._timestamp) < this.TTL.PLAN) {
        console.log(`[Cache] 命中单计划缓存: ${planId}`);
        return cached;
      }
      return null;
    }

    // 列表/状态查询
    const cached = this._cache[cacheKey];
    if (this.isValid(cacheKey)) {
      console.log(`[Cache] 命中${cacheKey}缓存`);
      return cacheKey === 'state' || cacheKey === 'plans'
        ? (cached.data || cached)
        : cached;
    }
    return null;
  },

  /**
   * 失效缓存（支持批量、支持通配符）
   */
  invalidate(keys) {
    if (!Array.isArray(keys)) keys = [keys];
    keys.forEach((key) => {
      if (key === 'all' || key === '*') {
        this._cache = { state: null, plans: null, planMap: {} };
        console.log('[Cache] 清空全部缓存');
        return;
      }
      if (key === 'plans' || key === 'state') {
        this._cache.state = null;
        this._cache.plans = null;
        this._cache.planMap = {};
        console.log(`[Cache] 失效 ${key} 相关缓存`);
        return;
      }
      if (String(key).startsWith('plan:')) {
        const planId = String(key).split(':')[1];
        delete this._cache.planMap[planId];
        console.log(`[Cache] 失效单计划缓存: ${planId}`);
        return;
      }
      this._cache[key] = null;
    });
  },

  /**
   * 并发请求去重（相同请求只发1次网络调用）
   */
  async dedup(key, planId, fn) {
    const lockKey = planId ? `${key}:${planId}` : key;

    // 如果已有相同请求在进行中，复用 Promise
    if (this._promises[lockKey]) {
      console.log(`[Cache] 复用进行中的请求: ${lockKey}`);
      return this._promises[lockKey];
    }

    // 创建新请求
    this._promises[lockKey] = fn()
      .then((result) => {
        // 请求完成后清除锁（延迟100ms防止快速重复点击）
        setTimeout(() => {
          delete this._promises[lockKey];
        }, 100);
        return result;
      })
      .catch((err) => {
        delete this._promises[lockKey];
        throw err;
      });

    return this._promises[lockKey];
  },
};

function normalizeState(state) {
  // 云端可能返回旧数据或空字段，这里统一补齐默认用户和 plans 数组。
  return {
    openid: state && state.openid ? state.openid : '',
    user: Object.assign({}, defaultUser, state && state.user ? state.user : {}),
    plans: state && Array.isArray(state.plans) ? state.plans : [],
  };
}

/**
 * 获取完整应用状态（带缓存 + 持久化 + 离线降级）
 * @param {boolean} forceRefresh 是否强制刷新（忽略缓存）
 * @returns {Promise<object>} { openid, user, plans[] }
 */
function getState(forceRefresh = false) {
  // 1. 检查内存缓存
  if (!forceRefresh) {
    const cached = CacheManager.get('state');
    if (cached) {
      return Promise.resolve(normalizeState(cached));
    }
  }

  // 2. 并发去重 + 远程请求
  return CacheManager.dedup('getState', null, () => {
    console.log('[Cache] 未命中，发起远程请求: getState');
    return cloudSync.login()
      .then((result) => {
        // ✅ 成功后：更新内存缓存 + 持久化到本地
        CacheManager.set('state', result);
        persistentCache.save(result); // 异步持久化，不阻塞返回
        return normalizeState(result);
      })
      .catch((err) => {
        // ✅ 网络失败时：降级到本地持久化缓存
        console.warn('[Cache] 远程请求失败，尝试本地缓存降级', err);
        const localData = persistentCache.load();
        if (localData && localData.plans) {
          wx.showToast({ title: '已展示离线数据', icon: 'none' });
          // 同时更新内存缓存（避免重复读取本地存储）
          CacheManager.set('state', localData);
          return normalizeState(localData);
        }
        // 彻底没数据才抛错
        throw err;
      });
  });
}

/**
 * 获取所有计划列表（带缓存）
 * @param {boolean} forceRefresh 是否强制刷新
 * @returns {Promise<Array>} 计划数组
 */
function getPlans(forceRefresh = false) {
  // 1. 检查缓存
  if (!forceRefresh) {
    const cached = CacheManager.get('plans');
    if (cached) {
      return Promise.resolve(cached);
    }
  }

  // 2. 复用 getState 缓存（避免重复请求）
  return getState(forceRefresh).then((state) => state.plans);
}

/**
 * 获取单个计划详情（优化：优先使用 getPlanById 接口 + 缓存）
 * @param {string} id 计划ID
 * @param {boolean} forceRefresh 是否强制刷新
 * @returns {Promise<object|null>} 计划对象或 null
 */
function getPlan(id, forceRefresh = false) {
  if (!id) return Promise.resolve(null);

  // 1. 检查单计划缓存（O(1)查找）
  if (!forceRefresh) {
    const cached = CacheManager.get('plan', id);
    if (cached) {
      return Promise.resolve(cached);
    }
  }

  // 2. 优先使用新接口 getPlanById（只查询单个文档，不拉取全部计划）
  if (cloudSync.getPlanById) {
    console.log(`[Cache] 使用 getPlanById 接口查询: ${id}`);
    return CacheManager.dedup('getPlan', id, () => {
      return cloudSync.getPlanById(id).then((result) => {
        if (result && result.plan) {
          // 更新到 planMap 缓存
          CacheManager._cache.planMap[id] = Object.assign({}, result.plan, {
            _timestamp: Date.now(),
          });
          return result.plan;
        }
        return null;
      });
    });
  }

  // 3. 降级到旧方案（从全量列表中查找）
  console.log(`[Cache] 降级到全量查询: ${id}`);
  return getPlans(forceRefresh).then((plans) => plans.find((p) => p.id === id) || null);
}

function savePlans(plans) {
  // 仅用于清空/兼容旧接口；常规计划操作走 addPlan/updatePlan/deletePlan。
  return cloudSync.savePlans(plans || []).then((result) => {
    CacheManager.invalidate('all'); // 清空全部缓存
    notifyDataChanged(); // ✅ 通知全局数据变化
    return normalizeState(result);
  });
}

/**
 * 新增计划（写操作后自动失效缓存）
 */
function addPlan(plan) {
  return cloudSync.addPlan(plan).then((result) => {
    CacheManager.invalidate('plans'); // 失效列表缓存
    notifyDataChanged(); // ✅ 通知全局数据变化
    return result.plan || plan;
  });
}

/**
 * 更新计划（写操作后自动失效缓存）
 */
function updatePlan(id, updates) {
  return cloudSync.updatePlan(id, updates).then((result) => {
    CacheManager.invalidate([`plan:${id}`, 'plans']); // 失效该计划和列表
    notifyDataChanged(); // ✅ 通知全局数据变化
    return result.plan || null;
  });
}

/**
 * 删除计划（写操作后自动失效缓存）
 */
function deletePlan(id) {
  return cloudSync.deletePlan(id).then((result) => {
    CacheManager.invalidate([`plan:${id}`, 'plans']); // 失效该计划和列表
    notifyDataChanged(); // ✅ 通知全局数据变化
    return normalizeState(result);
  });
}

function allocateRemainingAmounts(periods, remaining) {
  // 打卡后按剩余目标重摊未完成期数，保证每期至少 0.01 元并尽量保持原权重。
  const remainingCents = money.toCents(remaining);
  if (remainingCents <= 0 || !periods.length) return [];

  const count = Math.min(periods.length, remainingCents);
  const nextPeriods = periods.slice(0, count);
  const baseCents = count;
  const extraCents = remainingCents - baseCents;
  const weights = nextPeriods.map((p) => Math.max(0, money.toCents(p.expectedAmount)));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const extras = [];
  let usedExtra = 0;

  for (let i = 0; i < count; i++) {
    const raw = weightTotal ? (extraCents * weights[i]) / weightTotal : extraCents / count;
    const cents = Math.floor(raw);
    extras.push({ index: i, cents, remainder: raw - cents });
    usedExtra += cents;
  }

  let leftExtra = extraCents - usedExtra;
  extras.sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < extras.length && leftExtra > 0; i++) {
    extras[i].cents += 1;
    leftExtra--;
  }
  extras.sort((a, b) => a.index - b.index);

  return nextPeriods.map((period, idx) => Object.assign({}, period, {
    expectedAmount: money.fromCents(1 + extras[idx].cents),
  }));
}

function getPlanFrequency(plan) {
  // 暂停重启、最后一期补差额都需要知道下一期按天/周/月顺延。
  if (plan && plan.customConfig && plan.customConfig.frequency) {
    return plan.customConfig.frequency;
  }
  if (plan && plan.planType === 'preset') {
    if (plan.presetId === '52week') return 'week';
    if (plan.presetId === '12month') return 'month';
  }
  return 'day';
}

function createRemainingPeriod(plan, completedPeriods, remaining) {
  // 所有期数完成但金额还没达标时，追加一期补齐剩余差额。
  const lastPeriod = completedPeriods.reduce((latest, period) => {
    if (!latest) return period;
    return period.index > latest.index ? period : latest;
  }, null);
  const frequency = getPlanFrequency(plan);
  const lastDate = lastPeriod && lastPeriod.date ? lastPeriod.date : plan.startDate;

  return {
    index: lastPeriod ? lastPeriod.index + 1 : 1,
    expectedAmount: money.toMoney(remaining),
    savedAmount: 0,
    date: dateUtil.getPeriodDate(lastDate, frequency, 1),
    completed: false,
    note: '',
  };
}

function reschedulePendingPeriods(plan, restartDate) {
  // 重启计划只重排未完成期数；已完成记录保留原日期，避免历史流水被改写。
  const frequency = getPlanFrequency(plan);
  let pendingIndex = 0;
  return (plan.periods || []).map((period) => {
    if (period.completed) return period;
    const date = dateUtil.getPeriodDate(restartDate, frequency, pendingIndex);
    pendingIndex++;
    return Object.assign({}, period, { date });
  });
}

function rebalancePeriods(plan, updatedPeriod) {
  // 记录一次存入后，重新计算后续未完成期数，确保最终目标金额能被补齐。
  const targetAmount = money.toMoney(plan.targetAmount);
  const completedPeriods = [];
  const pendingPeriods = [];

  plan.periods.forEach((period) => {
    const next = period.index === updatedPeriod.index ? updatedPeriod : period;
    if (next.completed) {
      completedPeriods.push(next);
    } else {
      pendingPeriods.push(next);
    }
  });

  const savedTotal = money.sum(completedPeriods, (p) => p.savedAmount || 0);
  const remaining = money.sub(targetAmount, savedTotal);
  if (!money.greaterThanZero(remaining)) {
    // 已存达到或超过目标时，未完成期数不再保留；计划完成状态由详情页确认后写入。
    return completedPeriods.sort((a, b) => a.index - b.index);
  }

  const rebalancedPending = allocateRemainingAmounts(pendingPeriods, remaining);
  if (!rebalancedPending.length) {
    rebalancedPending.push(createRemainingPeriod(plan, completedPeriods, remaining));
  }
  return completedPeriods.concat(rebalancedPending).sort((a, b) => a.index - b.index);
}

/**
 * 打卡存入（优化：优先使用原子化云函数接口）
 *
 * 优化前：getPlan(读) + updatePlan(写) + loadPlan(读) = 3次调用
 * 优化后：updatePeriod(读+算+写) = 1次调用
 *
 * @param {string} planId 计划ID
 * @param {number} periodIndex 期数索引
 * @param {object} data 期数数据 { savedAmount, date, note, completePlan }
 * @returns {Promise<object|null>} 更新后的完整计划（可直接用于渲染，无需再次查询）
 */
function updatePeriod(planId, periodIndex, data) {
  // 优先使用新的原子化云函数接口（1次调用完成读+算+写）
  if (cloudSync.updatePeriod) {
    console.log(`[Optimization] 使用原子化接口: updatePeriod(${planId}, ${periodIndex})`);
    return cloudSync.updatePeriod(planId, periodIndex, data).then((result) => {
      if (result && result.plan) {
        // 写操作返回值直接缓存，省掉后续的 loadPlan 查询！
        CacheManager._cache.planMap[planId] = Object.assign({}, result.plan, {
          _timestamp: Date.now(),
        });

        // ✅ 关键修复：通知全局数据已变化，让 TabBar 页面知道要刷新
        try {
          const app = getApp();
          if (app && app.bumpVersion) {
            app.bumpVersion(); // 递增版本号，触发首页/我的页面刷新
            console.log(`[Optimization] 已通知全局版本递增（打卡成功）`);
          }
        } catch (e) {
          // getApp() 可能在某些场景不可用，忽略错误
        }

        console.log(`[Optimization] 原子化打卡成功，直接返回更新后的计划（无需再次查询）`);
        return result.plan;
      }
      return null;
    });
  }

  // 降级到旧方案（兼容未部署新接口的情况）
  console.log(`[Fallback] 降级到旧方案: updatePeriod(${planId}, ${periodIndex})`);
  return getPlan(planId).then((plan) => {
    if (!plan) return null;
    const period = plan.periods.find((p) => p.index === periodIndex);
    if (!period) return null;
    const periodData = Object.assign({}, data);
    const completePlan = !!periodData.completePlan;
    delete periodData.completePlan;
    const savedAmount = money.toMoney(
      periodData.savedAmount !== undefined ? periodData.savedAmount : period.savedAmount
    );
    const updatedPeriod = Object.assign({}, period, periodData, {
      savedAmount,
      completed: money.isPositive(savedAmount),
    });
    const periods = rebalancePeriods(plan, updatedPeriod);
    const updates = { periods };
    if (completePlan) {
      updates.completed = true;
      updates.completedAt = new Date().toISOString();
      updates.paused = false;
      updates.pausedAt = '';
    }
    return updatePlan(planId, updates);
  });
}

function pausePlan(id) {
  // 暂停只打标记，不改期数；首页和详情页根据 paused 控制排序与只读状态。
  return updatePlan(id, {
    paused: true,
    pausedAt: new Date().toISOString(),
  });
}

/**
 * 重启计划（优化：优先使用原子化云函数接口）
 *
 * 优化前：getPlan(读) + updatePlan(写) + loadPlan(读) = 3次调用
 * 优化后：restartPlan(读+算+写) = 1次调用
 *
 * @param {string} id 计划ID
 * @returns {Promise<object|null>} 重启后的完整计划
 */
function restartPlan(id) {
  // 优先使用新的原子化云函数接口
  if (cloudSync.restartPlan) {
    console.log(`[Optimization] 使用原子化接口: restartPlan(${id})`);
    return cloudSync.restartPlan(id).then((result) => {
      if (result && result.plan) {
        // 写操作返回值直接缓存，省掉后续的 loadPlan 查询！
        CacheManager._cache.planMap[id] = Object.assign({}, result.plan, {
          _timestamp: Date.now(),
        });

        // ✅ 关键修复：通知全局数据已变化
        try {
          const app = getApp();
          if (app && app.bumpVersion) {
            app.bumpVersion(); // 递增版本号，触发首页/我的页面刷新
            console.log(`[Optimization] 已通知全局版本递增（重启成功）`);
          }
        } catch (e) {
          // 忽略错误
        }

        console.log(`[Optimization] 原子化重启成功，直接返回更新后的计划`);
        return result.plan;
      }
      return null;
    });
  }

  // 降级到旧方案
  console.log(`[Fallback] 降级到旧方案: restartPlan(${id})`);
  return getPlan(id).then((plan) => {
    if (!plan) return null;
    const periods = reschedulePendingPeriods(plan, dateUtil.today());
    const lastPeriod = periods[periods.length - 1];
    const updates = {
      paused: false,
      pausedAt: '',
      restartedAt: new Date().toISOString(),
      periods,
    };
    if (plan.planType === 'custom_deadline' && plan.customConfig) {
      updates.customConfig = Object.assign({}, plan.customConfig, {
        endDate: lastPeriod ? lastPeriod.date : plan.customConfig.endDate,
      });
    }
    return updatePlan(id, updates);
  });
}

function getUser() {
  return getState().then((state) => state.user);
}

function saveUser(user) {
  return cloudSync.saveUser(Object.assign({}, defaultUser, user || {})).then(normalizeState);
}

function getLoginState() {
  return cloudSync.getLoginState();
}

function getOverview() {
  return getPlans().then(getOverviewFromPlans);
}

function getOverviewFromPlans(plans) {
  // 首页总览直接按所有计划汇总，暂停计划仍计入目标和已存金额。
  const targetTotal = money.sum(plans, (plan) => plan.targetAmount);
  const savedTotal = money.sum(plans, (plan) => planUtil.calcSavedAmount(plan.periods));
  return {
    targetTotal,
    savedTotal,
    remaining: money.max(0, money.sub(targetTotal, savedTotal)),
    planCount: plans.length,
  };
}

/**
 * ✅ 新增：获取缓存的计划列表（用于智能刷新的缓存渲染）
 * @returns {Array|null} 缓存的计划数组，无缓存时返回 null
 */
function getCachedPlans() {
  const cached = CacheManager.get('plans');
  return cached || null;
}

/**
 * ✅ 新增：获取缓存的完整状态（用于智能刷新的缓存渲染）
 * @returns {object|null} 缓存的状态对象，无缓存时返回 null
 */
function getCachedState() {
  const cached = CacheManager.get('state');
  return cached ? normalizeState(cached) : null;
}

/**
 * ✅ 新增辅助函数：通知全局数据已变化
 *
 * 所有写操作（打卡、重启、新增、更新、删除）成功后都应调用此函数，
 * 用于递增全局版本号，触发 TabBar 页面的智能刷新机制。
 */
function notifyDataChanged() {
  try {
    const app = getApp();
    if (app && app.bumpVersion) {
      app.bumpVersion(); // 递增全局版本号
      console.log('[Cache] 已通知全局数据变化，TabBar 页面将自动刷新');
    }
  } catch (e) {
    // getApp() 在某些场景可能不可用（如单元测试），忽略错误
  }
}

module.exports = {
  getState,
  getPlans,
  savePlans,
  getPlan,
  addPlan,
  updatePlan,
  deletePlan,
  updatePeriod,
  pausePlan,
  restartPlan,
  getUser,
  saveUser,
  getLoginState,
  getOverview,
  getOverviewFromPlans,
  // ✅ 新增：缓存访问接口（供页面智能刷新使用）
  getCachedPlans,
  getCachedState,
  // ✅ 新增：全局数据变化通知
  notifyDataChanged,
};
