const SCALE = 100;

function toCents(value) {
  // 所有金额先转成“分”参与计算，规避 JS 浮点数精度问题。
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * SCALE + Number.EPSILON);
}

function fromCents(cents) {
  return cents / SCALE;
}

function toMoney(value) {
  return fromCents(toCents(value));
}

function add(...values) {
  let cents = 0;
  for (let i = 0; i < values.length; i++) {
    cents += toCents(values[i]);
  }
  return fromCents(cents);
}

function sub(a, b) {
  return fromCents(toCents(a) - toCents(b));
}

function mul(a, b) {
  const num = Number(b);
  if (!Number.isFinite(num)) return 0;
  return fromCents(Math.round(toCents(a) * num));
}

function div(a, b) {
  const num = Number(b);
  if (!num || !Number.isFinite(num)) return 0;
  return fromCents(Math.round(toCents(a) / num));
}

function sum(values, getter) {
  if (!values || !values.length) return 0;
  if (getter) {
    let cents = 0;
    for (let i = 0; i < values.length; i++) {
      cents += toCents(getter(values[i]));
    }
    return fromCents(cents);
  }
  return add(...values);
}

function gte(a, b) {
  return toCents(a) >= toCents(b);
}

function gt(a, b) {
  return toCents(a) > toCents(b);
}

function lte(a, b) {
  return toCents(a) <= toCents(b);
}

function lt(a, b) {
  return toCents(a) < toCents(b);
}

function min(a, b) {
  return fromCents(Math.min(toCents(a), toCents(b)));
}

function max(a, b) {
  return fromCents(Math.max(toCents(a), toCents(b)));
}

function abs(value) {
  return fromCents(Math.abs(toCents(value)));
}

function isPositive(value) {
  return toCents(value) > 0;
}

function splitEqual(total, count) {
  // 平均拆分时把分位余数放到最后一期，保证总额不丢分。
  if (count <= 0) return [];
  const totalCents = toCents(total);
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  const parts = [];
  for (let i = 0; i < count; i++) {
    const extra = i === count - 1 ? remainder : 0;
    parts.push(fromCents(base + extra));
  }
  return parts;
}

function fixTotal(parts, total) {
  // 对比例缩放/随机拆分后的数组做尾差修正，确保合计等于目标金额。
  if (!parts.length) return parts;
  const next = parts.slice();
  const head = sum(next.slice(0, -1));
  next[next.length - 1] = sub(total, head);
  return next;
}

function randomSplit(total, count) {
  // 用随机切点拆分总额，最后再通过 fixTotal 校正总和。
  if (count <= 0) return [];
  if (count === 1) return [toMoney(total)];

  const cuts = [];
  for (let i = 0; i < count - 1; i++) {
    cuts.push(Math.random());
  }
  cuts.sort((a, b) => a - b);

  const parts = [];
  let prev = 0;
  for (let i = 0; i <= cuts.length; i++) {
    const cut = i < cuts.length ? cuts[i] : 1;
    parts.push(mul(total, cut - prev));
    prev = cut;
  }
  return fixTotal(parts, total);
}

function percent(value, total) {
  // 进度最多显示 100%，超额存入不会把进度条撑破。
  if (!total) return 0;
  return Math.min(100, Math.round((toCents(value) / toCents(total)) * 1000) / 10);
}

function isZero(value) {
  return Math.abs(toCents(value)) === 0;
}

function greaterThanZero(value) {
  return toCents(value) > 0;
}

module.exports = {
  SCALE,
  toCents,
  fromCents,
  toMoney,
  add,
  sub,
  mul,
  div,
  sum,
  gte,
  gt,
  lte,
  lt,
  min,
  max,
  abs,
  isPositive,
  splitEqual,
  fixTotal,
  randomSplit,
  percent,
  isZero,
  greaterThanZero,
};
