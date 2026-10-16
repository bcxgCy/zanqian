const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

const COOLING_COLLECTION = 'coolingRecord';

const BASE_COOLING_HOURS = 24;
const EXTEND_HOURS_OPTIONS = [12, 24, 48, 72, 168];

const STATUS = {
  cooling: 'cooling',
  pendingDecision: 'pendingDecision',
  success: 'Success',
  buy: 'Buy',
  cancel: 'Cancel',
};

const STATUS_TEXT_MAP = {
  cooling: '三思中',
  pendingDecision: '待决策',
  Success: '已克制',
  Buy: '已购买',
  Cancel: '已放弃',
};

function nowTs() {
  return Date.now();
}

function safeNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeText(value, maxLen) {
  const text = String(value || '').trim();
  return text.slice(0, maxLen);
}

function hasMoreThanTwoDecimals(value) {
  const text = String(value || '').trim();
  if (!text || /e/i.test(text)) return false;
  const decimal = text.split('.')[1] || '';
  return decimal.length > 2;
}

async function checkTextSecurity(text, fieldName) {
  const content = normalizeText(text, 2000);
  if (!content) return;
  try {
    await cloud.openapi.security.msgSecCheck({ content });
  } catch (err) {
    const msg = String((err && err.errMsg) || err.message || '');
    if (msg.includes('risky content')) {
      throw new Error((fieldName || '文本') + '包含敏感内容，请修改后再提交');
    }
    throw new Error((fieldName || '文本') + '安全校验失败，请稍后重试');
  }
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (err) {
    if (!String((err && err.errMsg) || '').includes('collection exists')) {
      console.warn('创建集合失败：' + name, err);
    }
  }
}

function hoursToMs(hours) {
  return safeNumber(hours, BASE_COOLING_HOURS) * 3600 * 1000;
}

function statusTextOf(status) {
  return STATUS_TEXT_MAP[status] || '进行中';
}

function toClientRecord(doc) {
  const now = nowTs();
  let status = doc.status;
  if (status === STATUS.cooling && safeNumber(doc.endTime, 0) <= now) {
    status = STATUS.pendingDecision;
  }

  return {
    id: doc._id,
    goodsName: doc.goodsName || '',
    price: safeNumber(doc.price, 0),
    remark: doc.remark || '',
    status,
    statusText: statusTextOf(status),
    startTime: safeNumber(doc.startTime, 0),
    endTime: safeNumber(doc.endTime, 0),
    extendCount: safeNumber(doc.extendCount, 0),
    createTime: safeNumber(doc.createTime, 0),
    updateTime: safeNumber(doc.updateTime, 0),
    decisionTime: safeNumber(doc.decisionTime, 0),
  };
}

async function listRecords(openid) {
  await ensureCollection(COOLING_COLLECTION);

  const res = await db.collection(COOLING_COLLECTION)
    .where({ userId: openid })
    .orderBy('createTime', 'desc')
    .limit(200)
    .get();

  const now = nowTs();
  const docs = res.data || [];

  // 到期的冷静记录惰性落库为「到期待决策」
  const expiredIds = docs
    .filter((doc) => doc.status === STATUS.cooling && safeNumber(doc.endTime, 0) <= now)
    .map((doc) => doc._id);

  if (expiredIds.length) {
    db.collection(COOLING_COLLECTION)
      .where({ _id: _.in(expiredIds), status: STATUS.cooling })
      .update({ data: { status: STATUS.pendingDecision, updateTime: now } })
      .catch(() => {});
  }

  const records = docs.map(toClientRecord);
  const active = records.filter((item) => item.status === STATUS.cooling || item.status === STATUS.pendingDecision);
  const history = records.filter((item) => item.status === STATUS.success || item.status === STATUS.buy || item.status === STATUS.cancel);

  const stats = {
    successCount: records.filter((item) => item.status === STATUS.success).length,
    savedTotal: records
      .filter((item) => item.status === STATUS.success)
      .reduce((sum, item) => sum + safeNumber(item.price, 0), 0),
    extendCountTotal: records.reduce((sum, item) => sum + safeNumber(item.extendCount, 0), 0),
    activeCount: active.length,
  };

  return { active, history, stats };
}

async function getOwnedRecord(openid, recordId) {
  if (!recordId) {
    throw new Error('缺少记录ID');
  }
  const res = await db.collection(COOLING_COLLECTION).doc(recordId).get();
  const doc = res.data;
  if (!doc || doc.userId !== openid) {
    throw new Error('记录不存在');
  }
  return doc;
}

async function updateStatus(openid, recordId, status, extra) {
  const doc = await getOwnedRecord(openid, recordId);
  const now = nowTs();
  const finalDecision = status === STATUS.success || status === STATUS.buy || status === STATUS.cancel;
  const data = Object.assign({
    status,
    updateTime: now,
    decisionTime: finalDecision ? now : safeNumber(doc.decisionTime, 0),
  }, extra || {});
  await db.collection(COOLING_COLLECTION).doc(doc._id).update({ data });
  return toClientRecord(Object.assign({}, doc, data));
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = String(event.action || '');

  try {
    switch (action) {
      case 'list': {
        const data = await listRecords(OPENID);
        return { ok: true, data };
      }

      case 'create': {
        const payload = event.payload || {};
        const goodsName = normalizeText(payload.goodsName, 20);
        const price = safeNumber(payload.price, -1);
        const remark = normalizeText(payload.remark, 100);
        const adUnlocked = !!payload.adUnlocked;

        if (!goodsName) throw new Error('请填写物品名称');
        if (!(price > 0)) throw new Error('请填写正确的预估价格');
        if (hasMoreThanTwoDecimals(payload.price)) throw new Error('金额最多保留两位小数');

        await ensureCollection(COOLING_COLLECTION);

        const activeRes = await db.collection(COOLING_COLLECTION)
          .where({ userId: OPENID, status: _.in([STATUS.cooling, STATUS.pendingDecision]) })
          .limit(200)
          .get();
        const activeCount = Array.isArray(activeRes.data) ? activeRes.data.length : 0;
        if (activeCount >= 2 && !adUnlocked) {
          return {
            ok: false,
            needAd: true,
            error: '当前最多同时进行2个购前三思，观看广告后可继续新增',
          };
        }

        await checkTextSecurity(goodsName, '物品名称');
        if (remark) {
          await checkTextSecurity(remark, '备注');
        }

        const now = nowTs();
        const doc = {
          userId: OPENID,
          goodsName,
          price,
          remark,
          startTime: now,
          endTime: now + hoursToMs(BASE_COOLING_HOURS),
          status: STATUS.cooling,
          extendCount: 0,
          createTime: now,
          updateTime: now,
          decisionTime: 0,
        };

        const addRes = await db.collection(COOLING_COLLECTION).add({ data: doc });
        return { ok: true, data: toClientRecord(Object.assign({ _id: addRes._id }, doc)) };
      }

      case 'update': {
        const payload = event.payload || {};
        const goodsName = normalizeText(payload.goodsName, 20);
        const price = safeNumber(payload.price, -1);
        const remark = normalizeText(payload.remark, 100);

        if (!goodsName) throw new Error('请填写物品名称');
        if (!(price > 0)) throw new Error('请填写正确的预估价格');
        if (hasMoreThanTwoDecimals(payload.price)) throw new Error('金额最多保留两位小数');

        const doc = await getOwnedRecord(OPENID, event.recordId);
        const isEditable = doc.status === STATUS.cooling || doc.status === STATUS.pendingDecision;
        const isExpiredCooling = doc.status === STATUS.cooling && safeNumber(doc.endTime, 0) <= nowTs();
        if (!isEditable || isExpiredCooling) {
          throw new Error('当前状态不可编辑');
        }

        await checkTextSecurity(goodsName, '物品名称');
        if (remark) {
          await checkTextSecurity(remark, '备注');
        }

        const now = nowTs();
        const data = {
          goodsName,
          price,
          remark,
          updateTime: now,
        };

        await db.collection(COOLING_COLLECTION).doc(doc._id).update({ data });
        return { ok: true, data: toClientRecord(Object.assign({}, doc, data)) };
      }

      case 'delete': {
        const doc = await getOwnedRecord(OPENID, event.recordId);
        if (!(doc.status === STATUS.cooling || doc.status === STATUS.pendingDecision)) {
          throw new Error('当前状态不可删除');
        }
        await db.collection(COOLING_COLLECTION).doc(doc._id).remove();
        return { ok: true };
      }

      case 'reset': {
        // 冷静期内点击「还是想买」→「再冷静一下」：重置24小时倒计时
        const doc = await getOwnedRecord(OPENID, event.recordId);
        if (doc.status !== STATUS.cooling) {
          throw new Error('当前状态不支持重置冷静');
        }
        const now = nowTs();
        const data = {
          startTime: now,
          endTime: now + hoursToMs(BASE_COOLING_HOURS),
          status: STATUS.cooling,
          updateTime: now,
        };
        await db.collection(COOLING_COLLECTION).doc(doc._id).update({ data });
        return { ok: true, data: toClientRecord(Object.assign({}, doc, data)) };
      }

      case 'extend': {
        // 到期后延长冷静期：从当前时间按所选时长重新倒计时
        const hours = safeNumber(event.hours, 0);
        if (EXTEND_HOURS_OPTIONS.indexOf(hours) === -1) {
          throw new Error('请选择正确的延长时长');
        }
        const doc = await getOwnedRecord(OPENID, event.recordId);
        const isExpiredCooling = doc.status === STATUS.cooling && safeNumber(doc.endTime, 0) <= nowTs();
        if (doc.status !== STATUS.pendingDecision && !isExpiredCooling) {
          throw new Error('当前状态不支持延长冷静');
        }
        const now = nowTs();
        const data = {
          startTime: now,
          endTime: now + hoursToMs(hours),
          status: STATUS.cooling,
          extendCount: safeNumber(doc.extendCount, 0) + 1,
          updateTime: now,
        };
        await db.collection(COOLING_COLLECTION).doc(doc._id).update({ data });
        return { ok: true, data: toClientRecord(Object.assign({}, doc, data)) };
      }

      case 'confirmBuy':
        return { ok: true, data: await updateStatus(OPENID, event.recordId, STATUS.buy) };

      case 'giveUp':
        return { ok: true, data: await updateStatus(OPENID, event.recordId, STATUS.success) };

      case 'cancel':
        return { ok: true, data: await updateStatus(OPENID, event.recordId, STATUS.cancel) };

      default:
        return { ok: false, error: '未知操作：' + action };
    }
  } catch (err) {
    return { ok: false, error: (err && err.message) || '操作失败，请稍后重试' };
  }
};
