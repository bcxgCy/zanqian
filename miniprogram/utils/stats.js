const dateUtil = require('./date');
const planUtil = require('./plan');
const money = require('./money');

function getAllRecords(plans) {
  // 当前没有独立流水表，统计流水由所有已打卡 period 反推出。
  const records = [];
  plans.forEach((plan) => {
    plan.periods.forEach((p) => {
      if (money.isPositive(p.savedAmount)) {
        records.push({
          planId: plan.id,
          planName: plan.name,
          planIcon: plan.icon,
          amount: money.toMoney(p.savedAmount),
          date: p.date || plan.startDate,
          note: p.note,
        });
      }
    });
  });
  return records.sort((a, b) => a.date.localeCompare(b.date));
}

function filterByRange(records, mode, key) {
  if (mode === 'month') return records.filter((r) => dateUtil.getMonthKey(r.date) === key);
  if (mode === 'year') return records.filter((r) => dateUtil.getYearKey(r.date) === key);
  return records;
}

function groupByDay(records) {
  const map = {};
  records.forEach((r) => {
    map[r.date] = money.add(map[r.date] || 0, r.amount);
  });
  return Object.keys(map)
    .sort()
    .map((date) => ({ label: date.slice(5), date, value: money.toMoney(map[date]) }));
}

function getDailyAverage(records, days) {
  if (!records.length) return 0;
  const total = money.sum(records, (r) => r.amount);
  const span = Math.max(days, 1);
  return money.div(total, span);
}

function getRingData(plans) {
  // 圆环图按计划累计已存金额占比分配，只展示有存入记录的计划。
  return plans
    .map((plan) => ({
      name: plan.name,
      value: planUtil.calcSavedAmount(plan.periods),
      color: plan.color || '',
    }))
    .filter((item) => money.isPositive(item.value));
}

const RING_COLORS = ['#165DFF', '#D4AF37', '#00B42A', '#FF7D00', '#0E4BD9', '#4E5969'];

function assignRingColors(plans) {
  return plans.map((plan, i) =>
    Object.assign({}, plan, { color: RING_COLORS[i % RING_COLORS.length] })
  );
}

function getUserStats(plans) {
  // 存钱天数优先覆盖从最早计划到今天的跨度，用于体现持续使用时间。
  const records = getAllRecords(plans);
  const savedTotal = money.sum(records, (r) => r.amount);
  const dates = records.map((r) => r.date);
  const uniqueDates = [...new Set(dates)];
  let savingDays = uniqueDates.length;
  if (plans.length) {
    const earliest = plans.reduce((min, p) => (p.startDate < min ? p.startDate : min), plans[0].startDate);
    savingDays = Math.max(savingDays, dateUtil.diffDays(earliest, dateUtil.today()) + 1);
  }
  return {
    savedTotal,
    recordCount: records.length,
    savingDays,
    records,
  };
}

/**
 * 计算单个计划的连续打卡天数
 * 规则：
 * - 从今天往前倒推，遇到第一个未完成的期数就中断
 * - 允许"补打卡"（过去日期的 completed=true 也算连续）
 * - 今天未打卡时，从最近一次打卡日期往前推
 *
 * @param {object} plan 计划对象
 * @returns {number} 连续打卡天数
 */
function getConsecutiveDays(plan) {
  if (!plan || !plan.periods || !plan.periods.length) return 0;

  const today = dateUtil.today(); // 'YYYY-MM-DD'
  const periods = plan.periods
    .filter((p) => p.completed && p.savedAmount > 0)
    .sort((a, b) => b.date.localeCompare(a.date)); // 按日期降序

  if (!periods.length) return 0;

  let consecutive = 0;
  let expectedDate = today;

  // 从今天开始往前检查
  for (const period of periods) {
    if (period.date === expectedDate) {
      consecutive++;
      // 往前一天
      const d = new Date(expectedDate);
      d.setDate(d.getDate() - 1);
      expectedDate = _formatDate(d);
    } else if (period.date < expectedDate) {
      // 日期断层，中断连续性
      break;
    }
    // 如果 period.date > expectedDate（未来日期），跳过
  }

  return consecutive;
}

/**
 * Date 对象转 YYYY-MM-DD 格式
 * @param {Date} d
 * @returns {string}
 */
function _formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getStatsSummary(plans, mode, key) {
  // 统计页按当前筛选范围算存入，但目标剩余仍基于全量计划和全量已存。
  const allRecords = getAllRecords(plans);
  const records = filterByRange(allRecords, mode, key);
  const saved = money.sum(records, (r) => r.amount);
  const targetTotal = money.sum(plans, (p) => p.targetAmount);
  const savedAll = money.sum(allRecords, (r) => r.amount);
  const days = mode === 'month' ? 30 : mode === 'year' ? 365 : Math.max(getUserStats(plans).savingDays, 1);
  return {
    saved,
    remaining: money.max(0, money.sub(targetTotal, savedAll)),
    dailyAvg: getDailyAverage(records, days),
    recordCount: records.length,
    barData: groupByDay(records),
    lineData: groupByDay(records),
    ringData: getRingData(assignRingColors(plans)),
    ringTotal: savedAll,
  };
}

module.exports = {
  getAllRecords,
  filterByRange,
  groupByDay,
  getDailyAverage,
  getRingData,
  getUserStats,
  getConsecutiveDays, // 🆕 连续打卡天数
  getStatsSummary,
  RING_COLORS,
};
