const dateUtil = require('./date');
const money = require('./money');

const ICONS = ['💰', '🏠', '🚗', '✈️', '🎓', '💍', '📱', '🎁', '🏥', '🛒'];

// 各预设方案的最小推荐目标金额（低于此值会有很多期数为0）
const MIN_TARGET_AMOUNTS = {
  '365': 334,      // 365法：保证每期至少 0.01 元
  '52week': 7,     // 52周法：保证每周至少 0.01 元
  '12month': 0.06, // 12月法：几乎无限制
  'random365': 0.01, // 随机法：可以极小
};

const PRESETS = [
  {
    id: '365',
    name: '365存钱法',
    icon: '📅',
    description: '从第1天存1元开始，每天递增1元，第365天存365元，一年共存66795元。',
    totalAmount: 66795,
    minRecommend: 334, // 最小推荐金额
  },
  {
    id: '52week',
    name: '52周存钱法',
    icon: '📆',
    description: '从第1周存10元开始，每周递增10元，第52周存520元，一年共存13780元。',
    totalAmount: 13780,
    minRecommend: 7, // 最小推荐金额
  },
  {
    id: '12month',
    name: '12月存钱法',
    icon: '🗓️',
    description: '每月固定存入相同金额，12个月完成目标。适合按月发薪的用户。',
    totalAmount: 0,
    minRecommend: 0.06,
  },
  {
    id: 'random365',
    name: '365随机存钱法',
    icon: '🎲',
    description: '365天内每天存入随机金额，总金额等于目标金额，增加存钱趣味性。',
    totalAmount: 0,
    minRecommend: 0.01,
  },
];

function getPreset(id) {
  return PRESETS.find((p) => p.id === id);
}

/**
 * 检查目标金额是否适合该预设方案
 * @param {string} presetId 预设方案ID
 * @param {number} targetAmount 目标金额
 * @returns {object} { valid: boolean, message: string }
 */
function validateTargetAmount(presetId, targetAmount) {
  const preset = getPreset(presetId);
  if (!preset || !preset.minRecommend) return { valid: true, message: '' };

  const amount = money.toMoney(targetAmount);
  const minAmount = preset.minRecommend;

  if (amount < minAmount) {
    return {
      valid: false,
      message: `${preset.name}建议最低目标 ¥${minAmount}，当前金额过小会导致很多期数为0。`,
    };
  }

  return { valid: true, message: '' };
}

function generate365Periods(startDate, targetAmount) {
  // 365 法默认合计 66795；用户输入自定义目标时按比例缩放每期金额。
  const total = money.toMoney(targetAmount);
  const presetTotal = 66795;
  const useCustom = total && total !== presetTotal;
  // 🆕 使用 divRaw 计算高精度缩放比例（避免小目标金额时 scale 被四舍五入为 0）
  const scale = useCustom ? money.divRaw(total, presetTotal) : 1;
  const periods = [];
  for (let i = 0; i < 365; i++) {
    periods.push({
      index: i + 1,
      expectedAmount: money.mul(i + 1, scale),
      savedAmount: 0,
      date: dateUtil.getPeriodDate(startDate, 'day', i),
      completed: false,
      note: '',
    });
  }
  if (useCustom) {
    // 金额按比例缩放会有分位误差，最后一期修正保证总额精确等于目标。
    const amounts = periods.map((p) => p.expectedAmount);
    const fixed = money.fixTotal(amounts, total);
    fixed.forEach((amount, idx) => {
      periods[idx].expectedAmount = amount;
    });
  }
  return periods;
}

function generate52WeekPeriods(startDate, targetAmount) {
  // 52 周法默认每周递增 10 元；自定义目标同样按比例缩放。
  const total = money.toMoney(targetAmount);
  const presetTotal = 13780;
  const useCustom = total && total !== presetTotal;
  // 🆕 使用 divRaw 计算高精度缩放比例（避免小目标金额时 scale 被四舍五入为 0）
  const scale = useCustom ? money.divRaw(total, presetTotal) : 1;
  const periods = [];
  for (let i = 0; i < 52; i++) {
    periods.push({
      index: i + 1,
      expectedAmount: money.mul((i + 1) * 10, scale),
      savedAmount: 0,
      date: dateUtil.getPeriodDate(startDate, 'week', i),
      completed: false,
      note: '',
    });
  }
  if (useCustom) {
    const amounts = periods.map((p) => p.expectedAmount);
    const fixed = money.fixTotal(amounts, total);
    fixed.forEach((amount, idx) => {
      periods[idx].expectedAmount = amount;
    });
  }
  return periods;
}

function generate12MonthPeriods(startDate, targetAmount) {
  const total = money.toMoney(targetAmount);
  const amounts = money.splitEqual(total, 12);
  return amounts.map((amount, i) => ({
    index: i + 1,
    expectedAmount: amount,
    savedAmount: 0,
    date: dateUtil.getPeriodDate(startDate, 'month', i),
    completed: false,
    note: '',
  }));
}

function generateRandom365Periods(startDate, targetAmount) {
  const amounts = money.randomSplit(targetAmount, 365);
  return amounts.map((amount, i) => ({
    index: i + 1,
    expectedAmount: amount,
    savedAmount: 0,
    date: dateUtil.getPeriodDate(startDate, 'day', i),
    completed: false,
    note: '',
  }));
}

function generateCustomFixedPeriods(startDate, targetAmount, amountPerPeriod, frequency) {
  // 固定金额模式按“每期金额”滚动生成，最后一期用剩余金额收尾。
  const periods = [];
  let remaining = money.toMoney(targetAmount);
  const perPeriod = money.toMoney(amountPerPeriod);
  let i = 0;
  while (money.greaterThanZero(remaining) && i < 10000) {
    const amt = money.min(perPeriod, remaining);
    periods.push({
      index: i + 1,
      expectedAmount: amt,
      savedAmount: 0,
      date: dateUtil.getPeriodDate(startDate, frequency, i),
      completed: false,
      note: '',
    });
    remaining = money.sub(remaining, amt);
    i++;
  }
  return periods;
}

function generateDeadlinePeriods(startDate, endDate, targetAmount, frequency, randomAmount) {
  // 截止日期模式先算期数，再决定平均拆分或随机拆分。
  const count = dateUtil.countPeriods(startDate, endDate, frequency);
  const total = money.toMoney(targetAmount);
  const amounts = randomAmount
    ? money.randomSplit(total, count)
    : money.splitEqual(total, count);
  return amounts.map((amount, i) => ({
    index: i + 1,
    expectedAmount: amount,
    savedAmount: 0,
    date: dateUtil.getPeriodDate(startDate, frequency, i),
    completed: false,
    note: '',
  }));
}

function generatePeriods(plan) {
  // 统一计划生成入口，页面和计算器都通过这里保持规则一致。
  const { planType, presetId, targetAmount, customConfig, startDate } = plan;
  if (planType === 'preset') {
    if (presetId === '365') return generate365Periods(startDate, targetAmount);
    if (presetId === '52week') return generate52WeekPeriods(startDate, targetAmount);
    if (presetId === '12month') return generate12MonthPeriods(startDate, targetAmount);
    if (presetId === 'random365') return generateRandom365Periods(startDate, targetAmount);
  }
  if (planType === 'custom_fixed') {
    return generateCustomFixedPeriods(
      startDate,
      targetAmount,
      customConfig.amountPerPeriod,
      customConfig.frequency
    );
  }
  if (planType === 'custom_deadline') {
    return generateDeadlinePeriods(
      startDate,
      customConfig.endDate,
      targetAmount,
      customConfig.frequency,
      customConfig.randomAmount
    );
  }
  return [];
}

function calcSavedAmount(periods) {
  return money.sum(periods, (p) => p.savedAmount || 0);
}

function calcProgress(saved, target) {
  return money.percent(saved, target);
}

function getPlanSummary(plan) {
  // 计划卡片和详情页共用的摘要，避免各页面各算一套进度。
  const savedAmount = calcSavedAmount(plan.periods);
  const targetAmount = money.toMoney(plan.targetAmount);
  const progress = calcProgress(savedAmount, targetAmount);
  const completedCount = plan.periods.filter((p) => p.completed).length;
  const lastPeriod = plan.periods[plan.periods.length - 1];
  return {
    savedAmount,
    progress,
    remaining: money.max(0, money.sub(targetAmount, savedAmount)),
    completedCount,
    totalPeriods: plan.periods.length,
    endDate: lastPeriod ? lastPeriod.date : plan.startDate,
  };
}

function getPlanTypeName(plan) {
  if (plan.planType === 'preset') {
    const preset = getPreset(plan.presetId);
    return preset ? preset.name : '预设方案';
  }
  if (plan.planType === 'custom_fixed') {
    const freqMap = { day: '每天', week: '每周', month: '每月' };
    return '自定义 · ' + freqMap[plan.customConfig.frequency] + plan.customConfig.amountPerPeriod + '元';
  }
  return '自定义 · 按结束时间';
}

function calculateFixedResult(targetAmount, amountPerPeriod, frequency, startDate) {
  const periods = generateCustomFixedPeriods(startDate, targetAmount, amountPerPeriod, frequency);
  const endDate = periods.length ? periods[periods.length - 1].date : startDate;
  return { periods, endDate, periodCount: periods.length };
}

function calculateDeadlineResult(targetAmount, startDate, endDate, frequency, randomAmount) {
  const periods = generateDeadlinePeriods(startDate, endDate, targetAmount, frequency, randomAmount);
  return { periods, endDate, periodCount: periods.length };
}

function buildPlanFromCalc(data) {
  // 计算器结果和新建计划最终都收敛成同一种 plan 数据结构。
  const startDate = data.startDate || dateUtil.today();
  let periods = [];
  const planType = data.planType;
  const customConfig = data.customConfig || {};
  const targetAmount = money.toMoney(data.targetAmount);

  if (data.periods && data.periods.length) {
    // 计算器已经算好 periods 时直接复用，但重置为未打卡状态。
    periods = data.periods.map((p) => ({
      index: p.index,
      expectedAmount: money.toMoney(p.expectedAmount),
      savedAmount: 0,
      date: p.date,
      completed: false,
      note: '',
    }));
  } else {
    periods = generatePeriods({
      planType: data.planType,
      presetId: data.presetId,
      targetAmount,
      customConfig,
      startDate,
    });
  }

  return {
    id: 'plan_' + Date.now(),
    name: data.name,
    icon: data.icon || '💰',
    avatarUrl: data.avatarUrl || '',
    targetAmount,
    planType,
    presetId: data.presetId || null,
    customConfig,
    startDate,
    periods,
    completed: false,
    completedAt: '',
    createdAt: new Date().toISOString(),
  };
}

function buildCalcTable(periods) {
  // 测算结果页展示累计和剩余金额，不影响真实计划数据。
  let cumulative = 0;
  const total = money.sum(periods, (p) => p.expectedAmount);
  return periods.map((p) => {
    cumulative = money.add(cumulative, p.expectedAmount);
    return {
      index: p.index,
      expectedAmount: money.toMoney(p.expectedAmount),
      cumulative,
      remaining: money.max(0, money.sub(total, cumulative)),
      date: p.date,
    };
  });
}

module.exports = {
  ICONS,
  PRESETS,
  MIN_TARGET_AMOUNTS,
  getPreset,
  validateTargetAmount, // 🆕 目标金额校验
  generatePeriods,
  calcSavedAmount,
  calcProgress,
  getPlanSummary,
  getPlanTypeName,
  calculateFixedResult,
  calculateDeadlineResult,
  buildPlanFromCalc,
  buildCalcTable,
};
