/**
 * 数据库初始化云函数 v2.0
 *
 * 改进：
 * - 不再尝试自动创建集合（微信不支持）
 * - 改为检测集合是否存在 + 给出详细指引
 * - 如果集合不存在，返回详细的创建步骤
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ==================== 配置 ====================

const COLLECTIONS = [
  { name: 'rooms', desc: '房间主表' },
  { name: 'room_user', desc: '房间用户关联表' },
  { name: 'room_checkin', desc: '打卡记录表' },
  { name: 'room_subscribe', desc: '订阅记录表' },
  { name: 'room_weekly_reports', desc: '周报存档表' },
];

// ==================== 主入口 ====================

exports.main = async (event, context) => {
  const action = event.action || '';

  console.log('========== 【dbInit v2】执行 ==========');
  console.log('【dbInit】action:', action);

  try {
    let result;

    switch (action) {
      case 'initAll':
      case 'checkStatus':
        result = await checkAndGuide();
        break;
      case 'insertTestData':
        result = await insertTestData(event);
        break;
      case 'clearTestData':
        result = await clearTestData();
        break;
      case 'testPing':
        result = { code: 0, data: { message: '✅ 云函数正常', time: new Date().toISOString() } };
        break;
      default:
        result = { code: -1, error: `未知操作: ${action}` };
    }

    console.log('【dbInit】返回:', JSON.stringify(result));
    return result;

  } catch (err) {
    console.error('【dbInit】异常:', err);
    return { code: -2, error: err.message };
  }
};

// ==================== 核心逻辑 ====================

/**
 * 检测并引导用户创建集合
 */
async function checkAndGuide() {
  console.log('【checkAndGuide】开始检测...');

  const status = {};
  const missingCollections = [];

  // 检测每个集合
  for (const col of COLLECTIONS) {
    try {
      await db.collection(col.name).count();
      status[col.name] = {
        exists: true,
        desc: col.desc,
      };
      console.log(`  ✅ ${col.name}: 存在`);
    } catch (err) {
      if (err.errCode === -1 || err.message?.includes('not exist')) {
        status[col.name] = {
          exists: false,
          desc: col.desc,
          error: '集合不存在',
        };
        missingCollections.push(col);
        console.log(`  ❌ ${col.name}: 不存在`);
      } else {
        status[col.name] = {
          exists: false,
          desc: col.desc,
          error: err.message,
        };
        missingCollections.push(col);
        console.error(`  ⚠️ ${col.name}:`, err.message);
      }
    }
  }

  const allExist = missingCollections.length === 0;
  const existCount = COLLECTIONS_CONFIG.length - missingCollections.length;

  return {
    code: allExist ? 0 : 1, // 0=全部就绪, 1=需要创建
    data: {
      ready: allExist,
      message: allExist
        ? '✅ 所有集合已就绪！可以开始使用房间功能了'
        : `⚠️ 需要创建 ${missingCollections.length} 个集合`,
      collections: status,
      missing: missingCollections,
      existCount,
      totalCount: COLLECTIONS.length,
      guide: allExist ? null : {
        title: '📋 需要先创建数据库集合',
        steps: [
          '1️⃣ 打开微信开发者工具',
          '2️⃣ 点击工具栏「云开发」按钮（☁️ 图标）',
          '3️⃣ 进入「数据库」页面',
          '4️⃣ 点击右上角「+」按钮',
          `5️⃣ 依次创建以下 ${missingCollections.length} 个集合：`,
          ...missingCollections.map((c, i) => `   ${i + 1}. ${c.name} (${c.desc})`),
          '6️⃣ 权限选择「所有用户可读，仅创建者可读写」',
          '7️⃣ 创建完成后回到此页面，重新点击「一键初始化」',
        ],
        manualCreateLink: 'weixin://dl/business/?t=ALL/resource?scope=env&env=cloud1-d1g1g2urwd9ff5a66&id=/collections/create',
      },
    },
  };
}

/**
 * 插入测试数据（仅在所有集合就绪后可用）
 */
async function insertTestData(event) {
  console.log('【insertTestData】开始...');

  // 先检查集合是否都存在
  const check = await checkAndGuide();
  if (!check.data.ready) {
    return {
      code: -1,
      error: '请先创建缺失的集合再插入测试数据',
      missing: check.data.missing,
    };
  }

  const openid = event.openid || cloud.getWXContext().OPENID || 'test_openid';
  const now = new Date();

  try {
    // 创建测试房间
    const roomRes = await db.collection('rooms').add({
      data: {
        ownerOpenid: openid,
        roomCode: '000001',
        roomName: '🧪 测试房间（可删除）',
        roomDesc: '自动化测试用',
        maxMember: 50,
        allowFreeJoin: true,
        allowOuterCheckIn: true,
        openRank: true,
        autoReport: true,
        reportPush: true,
        status: 'active',
        blackList: [],
        inviteTokens: [],
        memberCount: 1,
        createTime: now,
        updateTime: now,
      },
    });

    // 房主加入
    await db.collection('room_user').add({
      data: {
        openid,
        roomId: roomRes._id,
        roomNickname: '测试管理员',
        continueDay: 5,
        totalCheckinCount: 12,
        lastCheckinTime: now,
        joinTime: now,
        isBlack: false,
        status: 'active',
      },
    });

    // 打卡记录
    for (let i = 0; i < 5; i++) {
      const d = new Date(Date.now() - i * 86400000);
      await db.collection('room_checkin').add({
        data: {
          roomId: roomRes._id,
          openid,
          date: formatDate(d),
          type: 2,
          createTime: d,
        },
      });
    }

    // 订阅记录
    await db.collection('room_subscribe').add({
      data: {
        roomId: roomRes._id,
        openid,
        roomName: '🧪 测试房间',
        status: 'active',
        authTime: now,
        lastPushTime: null,
        totalPushCount: 0,
        createTime: now,
        updateTime: now,
      },
    });

    return {
      code: 0,
      data: {
        message: '✅ 测试数据插入成功！',
        testRoomId: roomRes._id,
        stats: { rooms: 1, users: 1, checkins: 5, subscribes: 1 },
      },
    };
  } catch (err) {
    console.error('【insertTestData】失败:', err);
    return { code: -1, error: err.message };
  }
}

/**
 * 清理测试数据
 */
async function clearTestData() {
  console.log('【clearTestData】清理中...');

  let removed = { rooms: 0, users: 0, checkins: 0, subs: 0 };

  try {
    const rooms = await db.collection('rooms')
      .where({ roomName: db.command.regex('^🧪') })
      .get();

    for (const room of rooms.data) {
      const rid = room._id;

      const cRes = await db.collection('room_checkin').where({ roomId: rid }).remove();
      removed.checkins += cRes.stats.removed || 0;

      const uRes = await db.collection('room_user').where({ roomId: rid }).remove();
      removed.users += uRes.stats.removed || 0;

      const sRes = await db.collection('room_subscribe').where({ roomId: rid }).remove();
      removed.subs += sRes.stats.removed || 0;

      await db.collection('room_weekly_reports').where({ roomId: rid }).remove();
      await db.collection('rooms').doc(rid).remove();
      removed.rooms++;
    }

    return { code: 0, data: { message: '✅ 已清理', stats: removed } };
  } catch (err) {
    return { code: -1, error: err.message };
  }
}

// ==================== 工具函数 ====================

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
