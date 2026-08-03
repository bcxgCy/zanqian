const dateUtil = require('./date');
const planUtil = require('./plan');
const money = require('./money');

function getAllRecords(plans) {
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
  return plans
    .map((plan) => ({
      name: plan.name,
      value: planUtil.calcSavedAmount(plan.periods),
      color: plan.color || '',
    }))
    .filter((item) => money.isPositive(item.value));
}

const RING_COLORS = ['#9ADFD6', '#FFD4E8', '#C8E8FA', '#B8EDE7', '#F0FAF8', '#D4F0EC'];

function assignRingColors(plans) {
  return plans.map((plan, i) =>
    Object.assign({}, plan, { color: RING_COLORS[i % RING_COLORS.length] })
  );
}

function getUserStats(plans) {
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

function getStatsSummary(plans, mode, key) {
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
  getStatsSummary,
  RING_COLORS,
};
