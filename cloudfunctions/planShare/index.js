/**
 * 计划分享云函数
 * 处理快照的创建、查询、过期清理
 */

const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

const SNAPSHOT_COLLECTION = 'plan_snapshots';
const SNAPSHOT_EXPIRE_DAYS = 90;

/**
 * 确保集合存在
 */
async function ensureCollection() {
  try {
    await db.createCollection(SNAPSHOT_COLLECTION);
  } catch (err) {
    if (!String(err.errMsg || '').includes('collection exists')) {
      console.warn('创建快照集合失败', err);
    }
  }
}

/**
 * 创建快照
 */
async function createSnapshot(snapshotData) {
  await ensureCollection();

  const snapshot = Object.assign({}, snapshotData, {
    createdAt: db.serverDate(),
    expireAt: new Date(Date.now() + SNAPSHOT_EXPIRE_DAYS * 24 * 60 * 60 * 1000),
  });

  // 删除 _id 字段（如果有的话）
  delete snapshot._id;

  try {
    const res = await db.collection(SNAPSHOT_COLLECTION).add({ data: snapshot });

    console.log('【planShare】快照创建成功', {
      snapshotId: snapshot.id,
      docId: res._id
    });

    return {
      success: true,
      snapshotId: snapshot.id,
      docId: res._id,
    };
  } catch (err) {
    console.error('【planShare】创建快照失败', err);
    return {
      success: false,
      error: err.errMsg || '创建失败',
    };
  }
}

/**
 * 获取快照
 */
async function getSnapshot(snapshotId) {
  try {
    const res = await db.collection(SNAPSHOT_COLLECTION)
      .where({ id: snapshotId })
      .get();

    if (!res.data || res.data.length === 0) {
      return {
        success: false,
        error: '快照不存在',
        expired: false,
      };
    }

    const snapshot = res.data[0];

    // 检查是否过期
    if (snapshot.expireAt && new Date() > new Date(snapshot.expireAt)) {
      return {
        success: false,
        error: '快照已过期（90天有效期）',
        expired: true,
      };
    }

    // 返回快照数据（不包含系统字段）
    const result = Object.assign({}, snapshot);
    delete result._id;
    delete result.openid; // 不暴露创建者信息

    // 更新访问次数（可选统计）
    try {
      await db.collection(SNAPSHOT_COLLECTION).doc(snapshot._id).update({
        data: {
          lastAccessAt: db.serverDate(),
          accessCount: _.inc(1),
        },
      });
    } catch (e) {
      // 统计更新失败不影响主流程
    }

    return {
      success: true,
      snapshot: result,
    };
  } catch (err) {
    console.error('【planShare】获取快照失败', err);
    return {
      success: false,
      error: err.errMsg || '获取失败',
    };
  }
}

/**
 * 记录复制成功事件
 */
async function recordCopySuccess(snapshotId, modified = false) {
  try {
    const res = await db.collection(SNAPSHOT_COLLECTION)
      .where({ id: snapshotId })
      .get();

    if (res.data && res.data.length > 0) {
      const docId = res.data[0]._id;
      await db.collection(SNAPSHOT_COLLECTION).doc(docId).update({
        data: {
          copyCount: _.inc(1),
          lastCopyAt: db.serverDate(),
          modifiedCopyCount: modified ? _.inc(1) : _.inc(0),
        },
      });

      console.log('【planShare】记录复制成功', { snapshotId, modified });
    }
  } catch (err) {
    console.warn('【planShare】记录复制事件失败', err);
  }

  return { success: true };
}

/**
 * 清理过期快照（可由定时触发器调用）
 */
async function cleanExpiredSnapshots() {
  try {
    const expireBefore = new Date();
    expireBefore.setDate(expireBefore.getDate() - SNAPSHOT_EXPIRE_DAYS);

    const res = await db.collection(SNAPSHOT_COLLECTION)
      .where({
        expireAt: _.lt(expireBefore.toISOString()),
      })
      .remove();

    console.log('【planShare】清理过期快照', {
      deleted: res.stats?.removed || 0
    });

    return {
      success: true,
      deleted: res.stats?.removed || 0,
    };
  } catch (err) {
    console.error('【planShare】清理过期快照失败', err);
    return {
      success: false,
      error: err.errMsg,
    };
  }
}

// ==================== 主入口 ====================

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action;

  console.log('【planShare】收到请求', { action, openid, eventId: event.snapshotId });

  switch (action) {
    case 'createSnapshot':
      // 创建新的计划快照
      return createSnapshot(event.snapshot);

    case 'getSnapshot':
      // 获取快照详情
      return getSnapshot(event.snapshotId);

    case 'recordCopy':
      // 记录复制成功
      return recordCopySuccess(event.snapshotId, event.modified);

    case 'cleanExpired':
      // 清理过期快照（定时任务）
      return cleanExpiredSnapshots();

    default:
      return {
        error: 'Unknown action: ' + action,
        availableActions: ['createSnapshot', 'getSnapshot', 'recordCopy', 'cleanExpired'],
      };
  }
};
