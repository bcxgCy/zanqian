function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function formatDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function parseDate(str) {
  const parts = str.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addWeeks(date, weeks) {
  return addDays(date, weeks * 7);
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function diffDays(a, b) {
  const da = parseDate(formatDate(a));
  const db = parseDate(formatDate(b));
  return Math.round((db - da) / 86400000);
}

function today() {
  return formatDate(new Date());
}

function getPeriodDate(startDate, frequency, index) {
  const start = parseDate(startDate);
  if (frequency === 'day') return formatDate(addDays(start, index));
  if (frequency === 'week') return formatDate(addWeeks(start, index));
  return formatDate(addMonths(start, index));
}

function countPeriods(startDate, endDate, frequency) {
  let count = 0;
  let cur = parseDate(startDate);
  const end = parseDate(endDate);
  while (cur <= end) {
    count++;
    if (frequency === 'day') cur = addDays(cur, 1);
    else if (frequency === 'week') cur = addWeeks(cur, 1);
    else cur = addMonths(cur, 1);
  }
  return Math.max(count, 1);
}

function getMonthKey(dateStr) {
  return dateStr.slice(0, 7);
}

function getYearKey(dateStr) {
  return dateStr.slice(0, 4);
}

module.exports = {
  pad,
  formatDate,
  parseDate,
  addDays,
  addWeeks,
  addMonths,
  diffDays,
  today,
  getPeriodDate,
  countPeriods,
  getMonthKey,
  getYearKey,
};
