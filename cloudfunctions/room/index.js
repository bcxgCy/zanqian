/**
 * 房间管理云函数
 *
 * 功能清单：
 * - createRoom: 创建房间
 * - joinRoom: 加入房间（房间码/邀请凭证）
 * - leaveRoom: 离开房间
 * - checkin: 打卡（小程序同步/外部打卡）
 * - getRoomInfo: 获取房间详情
 * - getMemberList: 获取成员列表
 * - getRanking: 获取榜单数据
 * - updateRoomSettings: 更新房间设置（房主）
 * - manageMember: 成员管理（移除/拉黑）
 * - generateInviteToken: 生成邀请凭证
 * - transferOwnership: 移交房主
 * - getDynamics: 获取动态流
 * - resetRoomStats: 重置房间统计
 * - dissolveRoom: 解散房间
 *
 * 🆕 订阅消息相关：
 * - subscribeRoom: 订阅房间打卡提醒
 * - unsubscribeRoom: 取消订阅
 * - getSubscribeStatus: 获取订阅状态
 * - sendDailyReminder: 发送每日提醒（定时任务调用）
 * - sendWeeklyReport: 发送周报通知
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ==================== 常量配置 ====================

const COLLECTIONS = {
  ROOMS: 'rooms',
  ROOM_USER: 'room_user',
  ROOM_CHECKIN: 'room_checkin',
  ROOM_SUBSCRIBE: 'room_subscribe', // 🆕 房间订阅记录表
};

// 订阅消息模板ID（复用现有）
const SUBSCRIBE_TEMPLATE_ID = 'sUAAtSpg266YBGZLK68uQBEDn7cr5S-Tsl1xDg4abHo';
const AUTH_VALID_DAYS = 7; // 授权有效期（天）

// ==================== 工具函数 ====================

/**
 * 生成6位纯数字房间码
 */
function generateRoomCode() {
  return String(Math.floor(Math.random() * 900000) + 100000);
}

/**
 * 生成8位纯数字邀请凭证
 */
function generateInviteToken() {
  let token = '';
  for (let i = 0; i < 8; i++) {
    token += Math.floor(Math.random() * 10);
  }
  return token;
}

/**
 * 获取今天日期字符串 YYYY-MM-DD
 */
function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 获取昨天日期字符串
 */
function getYesterdayString() {
  const d = new Date(Date.now() - 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 判断是否断签
 */
function isBrokenChain(lastCheckinTime) {
  if (!lastCheckinTime) return true;
  const lastDate = new Date(lastCheckinTime).toDateString();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  return lastDate !== yesterday && lastDate !== today;
}

/**
 * Dense Rank 并列排名算法
 */
function denseRank(list, scoreField) {
  let rank = 0;
  let prevScore = null;
  return list.map((item, index) => {
    const currentScore = item[scoreField];
    if (index === 0 || currentScore !== prevScore) {
      rank = index + 1;
    }
    prevScore = currentScore;
    return { ...item, rank };
  });
}

/**
 * 校验昵称合法性
 */
function validateNickname(nickname) {
  if (!nickname || nickname.trim().length < 2) {
    return { valid: false, error: '昵称至少2个字符' };
  }
  if (nickname.trim().length > 12) {
    return { valid: false, error: '昵称最多12个字符' };
  }
  if (!/^[一-龥a-zA-Z0-9]+$/.test(nickname.trim())) {
    return { valid: false, error: '仅支持中文、字母、数字' };
  }
  return { valid: true, error: null };
}

// ==================== 主函数入口 ====================

exports.main = async (event, context) => {
  const { action } = event;

  // 支持定时任务传入房主身份（_asOwner 参数）
  let openid = cloud.getWXContext().OPENID;
  if (event._asOwner && ['generateWeeklyReport', 'sendWeeklyReport'].includes(action)) {
    openid = event._asOwner;
    console.log(`【room云函数】使用房主身份: ${openid}`);
  }

  console.log(`【room云函数】action=${action}, openid=${openid}`);

  try {
    switch (action) {
      // ========== 房间 CRUD ==========
      case 'createRoom':
        return await handleCreateRoom(event, openid);
      case 'getRoomInfo':
        return await handleGetRoomInfo(event, openid);
      case 'getRoomByCode':
        return await handleGetRoomByCode(event, openid);

      // ========== 成员管理 ==========
      case 'joinRoom':
        return await handleJoinRoom(event, openid);
      case 'leaveRoom':
        return await handleLeaveRoom(event, openid);
      case 'getMemberList':
        return await handleGetMemberList(event, openid);
      case 'updateNickname':
        return await handleUpdateNickname(event, openid);

      // ========== 打卡相关 ==========
      case 'checkin':
        return await handleCheckin(event, openid);
      case 'getTodayStatus':
        return await handleGetTodayStatus(event, openid);
      case 'getDynamics':
        return await handleGetDynamics(event, openid);

      // ========== 榜单相关 ==========
      case 'getRanking':
        return await handleGetRanking(event, openid);

      // ========== 🆕 订阅消息相关 ==========
      case 'subscribeRoom':
        return await handleSubscribeRoom(event, openid);
      case 'unsubscribeRoom':
        return await handleUnsubscribeRoom(event, openid);
      case 'getSubscribeStatus':
        return await handleGetSubscribeStatus(event, openid);
      case 'sendDailyReminder':
        return await handleSendDailyReminder(event); // 定时任务调用，无需openid
      case 'sendWeeklyReport':
        return await handleSendWeeklyReport(event, openid);
      case 'generateWeeklyReport':
        return await handleGenerateWeeklyReport(event, openid);

      // ========== 房主权限 ==========
      case 'updateRoomSettings':
        return await handleUpdateRoomSettings(event, openid);
      case 'manageMember':
        return await handleManageMember(event, openid);
      case 'generateInviteToken':
        return await handleGenerateInviteToken(event, openid);
      case 'transferOwnership':
        return await handleTransferOwnership(event, openid);
      case 'resetRoomStats':
        return await handleResetRoomStats(event, openid);
      case 'dissolveRoom':
        return await handleDissolveRoom(event, openid);

      default:
        return { code: -1, error: `未知操作: ${action}` };
    }
  } catch (err) {
    console.error('【room云函数】执行失败', err);
    return { code: -2, error: err.message || '服务器错误' };
  }
};

// ==================== 房间操作实现 ====================

/**
 * 创建房间
 */
async function handleCreateRoom(event, openid) {
  const { roomName, roomDesc, maxMember = 100, allowFreeJoin = true, allowOuterCheckIn = true, openRank = true } = event;

  if (!roomName || roomName.trim().length === 0) {
    return { code: -1, error: '房间名称不能为空' };
  }

  // 生成唯一房间码（碰撞检测）
  let roomCode;
  let attempts = 0;
  do {
    roomCode = generateRoomCode();
    const exist = await db.collection(COLLECTIONS.ROOMS).where({ roomCode }).count();
    if (exist.total === 0) break;
    attempts++;
    if (attempts > 10) {
      return { code: -1, error: '房间码生成失败，请重试' };
    }
  } while (true);

  const now = new Date();

  // 创建房间记录
  const roomResult = await db.collection(COLLECTIONS.ROOMS).add({
    data: {
      ownerOpenid: openid,
      roomCode,
      roomName: roomName.trim(),
      roomDesc: (roomDesc || '').trim(),
      roomNotice: '',
      maxMember,
      allowFreeJoin,
      allowOuterCheckIn,
      openRank,
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

  // 房主自动加入房间
  await db.collection(COLLECTIONS.ROOM_USER).add({
    data: {
      openid,
      roomId: roomResult._id,
      roomNickname: '房主', // 默认昵称，后续可修改
      continueDay: 0,
      totalCheckinCount: 0,
      lastCheckinTime: null,
      joinTime: now,
      leaveTime: null,
      isBlack: false,
      status: 'active',
    },
  });

  return {
    code: 0,
    data: {
      roomId: roomResult._id,
      roomCode,
      message: '房间创建成功',
    },
  };
}

/**
 * 根据房间码查询房间信息（公开接口）
 */
async function handleGetRoomByCode(event, openid) {
  const { roomCode } = event;

  if (!roomCode || !/^\d{6}$/.test(roomCode)) {
    return { code: -1, error: '房间码格式错误' };
  }

  const roomResult = await db.collection(COLLECTIONS.ROOMS)
    .where({ roomCode, status: 'active' })
    .get();

  if (roomResult.data.length === 0) {
    return { code: -1, error: '房间不存在或已解散' };
  }

  const room = roomResult.data[0];

  // 检查是否在黑名单中
  if (room.blackList && room.blackList.includes(openid)) {
    return { code: -3, error: '您已被禁止加入该房间' };
  }

  // 检查是否已是成员
  const memberResult = await db.collection(COLLECTIONS.ROOM_USER)
    .where({ roomId: room._id, openid, status: 'active' })
    .count();

  return {
    code: 0,
    data: {
      ...room,
      isMember: memberResult.total > 0,
      isOwner: room.ownerOpenid === openid,
    },
  };
}

/**
 * 获取房间详细信息
 */
async function handleGetRoomInfo(event, openid) {
  const { roomId } = event;

  if (!roomId) {
    return { code: -1, error: '房间ID不能为空' };
  }

  const roomResult = await db.collection(COLLECTIONS.ROOMS).doc(roomId).get();
  if (!roomResult.data) {
    return { code: -1, error: '房间不存在' };
  }

  const room = roomResult.data;
  const isOwner = room.ownerOpenid === openid;

  // 查询当前用户在该房间的成员信息
  let myMemberInfo = null;
  const memberResult = await db.collection(COLLECTIONS.ROOM_USER)
    .where({ roomId, openid, status: 'active' })
    .get();

  if (memberResult.data.length > 0) {
    myMemberInfo = memberResult.data[0];
  }

  // 统计数据
  const today = getTodayString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [memberCount, todayCheckinCount, weekCheckinCount] = await Promise.all([
    db.collection(COLLECTIONS.ROOM_USER).where({ roomId, status: 'active' }).count()
      .then(res => res.total),
    db.collection(COLLECTIONS.ROOM_CHECKIN).where({ roomId, date: today }).count()
      .then(res => res.total),
    db.collection(COLLECTIONS.ROOM_CHECKIN).where({
      roomId,
      createTime: _.gte(weekAgo),
    }).count().then(res => res.total),
  ]);

  return {
    code: 0,
    data: {
      ...room,
      isOwner,
      myMemberInfo,
      stats: {
        memberCount,
        todayCheckinCount,
        weekCheckinCount,
      },
    },
  };
}

/**
 * 加入房间
 */
async function handleJoinRoom(event, openid) {
  const { roomId, roomCode, inviteToken, nickname } = event;

  // 昵称校验
  const nicknameValidation = validateNickname(nickname);
  if (!nicknameValidation.valid) {
    return { code: -1, error: nicknameValidation.error };
  }

  let room = null;

  // 方式1：通过房间ID加入
  if (roomId) {
    const result = await db.collection(COLLECTIONS.ROOMS).doc(roomId).get();
    room = result.data;
  }
  // 方式2：通过房间码加入
  else if (roomCode) {
    const result = await db.collection(COLLECTIONS.ROOMS)
      .where({ roomCode, status: 'active' })
      .get();
    if (result.data.length === 0) {
      return { code: -1, error: '房间不存在或已解散' };
    }
    room = result.data[0];
  }
  // 方式3：通过邀请凭证加入
  else if (inviteToken) {
    const result = await db.collection(COLLECTIONS.ROOMS)
      .where({
        status: 'active',
        'inviteTokens.token': inviteToken,
        'inviteTokens.used': false,
      })
      .get();

    if (result.data.length === 0) {
      return { code: -1, error: '邀请凭证无效或已使用' };
    }

    room = result.data[0];

    // 检查凭证是否过期
    const tokenObj = room.inviteTokens.find(t => t.token === inviteToken);
    if (!tokenObj || new Date() > new Date(tokenObj.expireTime)) {
      return { code: -1, error: '邀请凭证已过期' };
    }

    // 标记凭证为已使用（事务操作）
    const tokenIndex = room.inviteTokens.findIndex(t => t.token === inviteToken);
    await db.collection(COLLECTIONS.ROOMS).doc(room._id).update({
      data: {
        [`inviteTokens.${tokenIndex}.used`]: true,
        [`inviteTokens.${tokenIndex}.usedBy`]: openid,
        [`inviteTokens.${tokenIndex}.useTime`]: new Date(),
      },
    });
  } else {
    return { code: -1, error: '请提供房间码或邀请凭证' };
  }

  if (!room) {
    return { code: -1, error: '房间不存在' };
  }

  // 检查房间状态
  if (room.status !== 'active') {
    return { code: -1, error: '房间已解散' };
  }

  // 检查黑名单
  if (room.blackList && room.blackList.includes(openid)) {
    return { code: -3, error: '您已被禁止加入该房间' };
  }

  // 检查是否已加入
  const existMember = await db.collection(COLLECTIONS.ROOM_USER)
    .where({ roomId: room._id, openid, status: 'active' })
    .count();

  if (existMember.total > 0) {
    return { code: 0, data: { message: '您已在房间中', alreadyMember: true } };
  }

  // 检查人数上限
  const currentCount = await db.collection(COLLECTIONS.ROOM_USER)
    .where({ roomId: room._id, status: 'active' })
    .count();

  if (currentCount.total >= room.maxMember) {
    return { code: -1, error: '房间人数已满' };
  }

  // 检查自由加入开关
  if (!inviteToken && !room.allowFreeJoin) {
    return { code: -1, error: '该房间已关闭自由加入，需要邀请凭证' };
  }

  // 加入房间
  const now = new Date();
  await db.collection(COLLECTIONS.ROOM_USER).add({
    data: {
      openid,
      roomId: room._id,
      roomNickname: nickname.trim(),
      continueDay: 0,
      totalCheckinCount: 0,
      lastCheckinTime: null,
      joinTime: now,
      leaveTime: null,
      isBlack: false,
      status: 'active',
    },
  });

  // 更新房间成员计数
  await db.collection(COLLECTIONS.ROOMS).doc(room._id).update({
    data: {
      memberCount: _.inc(1),
      updateTime: now,
    },
  });

  return {
    code: 0,
    data: {
      roomId: room._id,
      roomName: room.roomName,
      message: '成功加入房间',
    },
  };
}

/**
 * 离开房间
 */
async function handleLeaveRoom(event, openid) {
  const { roomId } = event;

  if (!roomId) {
    return { code: -1, error: '房间ID不能为空' };
  }

  // 房主不能离开（需先移交或解散）
  const room = await db.collection(COLLECTIONS.ROOMS).doc(roomId).get();
  if (room.data.ownerOpenid === openid) {
    return { code: -1, error: '房主无法离开房间，请先移交房主或解散房间' };
  }

  // 更新成员状态
  const result = await db.collection(COLLECTIONS.ROOM_USER)
    .where({ roomId, openid, status: 'active' })
    .update({
      data: {
        status: 'left',
        leaveTime: new Date(),
      },
    });

  if (result.stats.updated === 0) {
    return { code: -1, error: '您不在该房间中' };
  }

  // 更新房间成员计数
  await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
    data: {
      memberCount: _.inc(-1),
      updateTime: new Date(),
    },
  });

  return { code: 0, data: { message: '已离开房间' } };
}

/**
 * 修改房间昵称
 */
async function handleUpdateNickname(event, openid) {
  const { roomId, nickname } = event;

  const validation = validateNickname(nickname);
  if (!validation.valid) {
    return { code: -1, error: validation.error };
  }

  const result = await db.collection(COLLECTIONS.ROOM_USER)
    .where({ roomId, openid, status: 'active' })
    .update({
      data: { roomNickname: nickname.trim() },
    });

  if (result.stats.updated === 0) {
    return { code: -1, error: '更新失败，请确认您在房间中' };
  }

  return { code: 0, data: { message: '昵称修改成功' } };
}

// ==================== 打卡操作实现 ====================

/**
 * 打卡（核心逻辑）
 * 支持两种模式：
 * - type=1: 小程序存钱同步打卡
 * - type=2: 外部工具打卡签到
 */
async function handleCheckin(event, openid) {
  const { roomId, type = 2, planId } = event; // 默认外部打卡

  if (!roomId) {
    return { code: -1, error: '房间ID不能为空' };
  }

  // 验证房间存在且活跃
  const roomResult = await db.collection(COLLECTIONS.ROOMS).doc(roomId).get();
  if (!roomResult.data || roomResult.data.status !== 'active') {
    return { code: -1, error: '房间不存在或已解散' };
  }

  const room = roomResult.data;

  // 外部打卡权限检查
  if (type === 2 && !room.allowOuterCheckIn) {
    return { code: -1, error: '该房间不允许外部打卡' };
  }

  // 验证成员身份
  const memberResult = await db.collection(COLLECTIONS.ROOM_USER)
    .where({ roomId, openid, status: 'active' })
    .get();

  if (memberResult.data.length === 0) {
    return { code: -1, error: '您不是该房间成员' };
  }

  const member = memberResult.data[0];
  const today = getTodayString();
  const now = new Date();

  // 检查今日是否已打卡
  const todayCheckin = await db.collection(COLLECTIONS.ROOM_CHECKIN)
    .where({ roomId, openid, date: today })
    .count();

  if (todayCheckin.total > 0) {
    return { code: 0, data: { message: '今日已打卡', alreadyCheckedIn: true } };
  }

  // 使用事务保证数据一致性（连续天数计算 + 打卡记录写入）
  const transaction = await db.startTransaction();

  try {
    // 计算新的连续天数
    let newContinueDay = 1; // 默认从1开始
    if (!isBrokenChain(member.lastCheckinTime)) {
      // 未断签，连续天数+1
      newContinueDay = (member.continueDay || 0) + 1;
    }
    // 如果断签了，newContinueDay 保持为1（重新开始）

    // 1. 写入打卡记录
    await transaction.collection(COLLECTIONS.ROOM_CHECKIN).add({
      data: {
        roomId,
        openid,
        date: today,
        type, // 1-小程序同步 / 2-外部打卡
        planId: planId || null, // 关联的存钱计划ID（可选）
        createTime: now,
      },
    });

    // 2. 更新成员统计
    await transaction.collection(COLLECTIONS.ROOM_USER)
      .where({ _id: member._id })
      .update({
        data: {
          continueDay: newContinueDay,
          totalCheckinCount: _.inc(1),
          lastCheckinTime: now,
        },
      });

    await transaction.commit();

    console.log(`【打卡成功】openid=${openid}, roomId=${roomId}, 连续天数=${newContinueDay}`);

    return {
      code: 0,
      data: {
        message: '打卡成功',
        continueDay: newContinueDay,
        totalCheckinCount: (member.totalCheckinCount || 0) + 1,
      },
    };
  } catch (err) {
    await transaction.rollback();
    console.error('【打卡事务回滚】', err);
    return { code: -2, error: '打卡失败，请重试' };
  }
}

/**
 * 获取今日打卡状态
 */
async function handleGetTodayStatus(event, openid) {
  const { roomId } = event;

  if (!roomId) {
    return { code: -1, error: '房间ID不能为空' };
  }

  const memberResult = await db.collection(COLLECTIONS.ROOM_USER)
    .where({ roomId, openid, status: 'active' })
    .get();

  if (memberResult.data.length === 0) {
    return { code: 0, data: { isMember: false } };
  }

  const member = memberResult.data[0];
  const today = getTodayString();

  const todayCheckin = await db.collection(COLLECTIONS.ROOM_CHECKIN)
    .where({ roomId, openid, date: today })
    .count();

  return {
    code: 0,
    data: {
      isMember: true,
      isCheckedInToday: todayCheckin.total > 0,
      continueDay: member.continueDay || 0,
      totalCheckinCount: member.totalCheckinCount || 0,
      roomNickname: member.roomNickname,
    },
  };
}

/**
 * 获取动态流（最近20条）
 */
async function handleGetDynamics(event, openid) {
  const { roomId, limit = 20 } = event;

  if (!roomId) {
    return { code: -1, error: '房间ID不能为空' };
  }

  // 查询最近打卡记录，关联用户昵称
  const checkinRecords = await db.collection(COLLECTIONS.ROOM_CHECKIN)
    .where({ roomId })
    .orderBy('createTime', 'desc')
    .limit(limit)
    .get();

  // 批量查询用户昵称
  const openids = [...new Set(checkinRecords.data.map(r => r.openid))];
  const members = await db.collection(COLLECTIONS.ROOM_USER)
    .where({ roomId, openid: _.in(openids), status: 'active' })
    .field({ openid: 1, roomNickname: 1 })
    .get();

  const memberMap = {};
  members.data.forEach(m => { memberMap[m.openid] = m.roomNickname; });

  // 组装动态数据
  const dynamics = checkinRecords.data.map(record => ({
    id: record._id,
    nickname: memberMap[record.openid] || '未知用户',
    type: record.type, // 1-小程序 / 2-外部
    typeText: record.type === 1 ? '完成今日存钱打卡' : '完成今日存钱签到',
    time: record.createTime,
  }));

  return { code: 0, data: dynamics };
}

// ==================== 榜单操作实现 ====================

/**
 * 获取榜单数据
 * @param {string} rankingType 'continue' | 'total'
 */
async function handleGetRanking(event, openid) {
  const { roomId, rankingType = 'continue' } = event;

  if (!roomId) {
    return { code: -1, error: '房间ID不能为空' };
  }

  // 验证成员身份
  const isMemberResult = await db.collection(COLLECTIONS.ROOM_USER)
    .where({ roomId, openid, status: 'active' })
    .count();

  const isMember = isMemberResult.total > 0;

  // 房主始终可查看榜单
  const room = (await db.collection(COLLECTIONS.ROOMS).doc(roomId).get()).data;
  const isOwner = room.ownerOpenid === openid;

  // 权限检查：非房主且非成员且榜单关闭
  if (!isOwner && !isMember && !room.openRank) {
    return { code: 0, data: { ranking: [], permissionDenied: true } };
  }

  // 查询所有活跃成员
  const membersResult = await db.collection(COLLECTIONS.ROOM_USER)
    .where({ roomId, status: 'active' })
    .orderBy('continueDay', 'desc')
    .get();

  let members = membersResult.data;

  // 排序
  if (rankingType === 'continue') {
    // 连续榜排序
    members.sort((a, b) => {
      if (b.continueDay !== a.continueDay) return b.continueDay - a.continueDay;
      const timeA = a.lastCheckinTime ? new Date(a.lastCheckinTime).getTime() : 0;
      const timeB = b.lastCheckinTime ? new Date(b.lastCheckinTime).getTime() : 0;
      if (timeB !== timeA) return timeB - timeA;
      const joinA = a.joinTime ? new Date(a.joinTime).getTime() : Infinity;
      const joinB = b.joinTime ? new Date(b.joinTime).getTime() : Infinity;
      return joinA - joinB;
    });
    members = denseRank(members, 'continueDay');
  } else {
    // 累计榜排序
    members.sort((a, b) => {
      if (b.totalCheckinCount !== a.totalCheckinCount) return b.totalCheckinCount - a.totalCheckinCount;
      const timeA = a.lastCheckinTime ? new Date(a.lastCheckinTime).getTime() : 0;
      const timeB = b.lastCheckinTime ? new Date(b.lastCheckinTime).getTime() : 0;
      if (timeB !== timeA) return timeB - timeA;
      const joinA = a.joinTime ? new Date(a.joinTime).getTime() : Infinity;
      const joinB = b.joinTime ? new Date(b.joinTime).getTime() : Infinity;
      return joinA - joinB;
    });
    members = denseRank(members, 'totalCheckinCount');
  }

  // 过滤敏感字段（非房主隐藏openid）
  const ranking = members.map(m => ({
    rank: m.rank,
    nickname: m.roomNickname,
    continueDay: m.continueDay || 0,
    totalCheckinCount: m.totalCheckinCount || 0,
    lastCheckinTime: m.lastCheckinTime,
    isMe: m.openid === openid,
  }));

  return {
    code: 0,
    data: {
      ranking,
      rankingType,
      permissionDenied: false,
    },
  };
}

// ==================== 房主权限操作实现 ====================

/**
 * 更新房间设置（仅房主）
 */
async function handleUpdateRoomSettings(event, openid) {
  const { roomId, settings } = event;

  // 验证房主身份
  const room = await db.collection(COLLECTIONS.ROOMS).doc(roomId).get();
  if (!room.data || room.data.ownerOpenid !== openid) {
    return { code: -3, error: '无权限操作' };
  }

  // 允许更新的字段白名单
  const allowedFields = [
    'roomName', 'roomDesc', 'roomNotice',
    'maxMember', 'allowFreeJoin', 'allowOuterCheckIn',
    'openRank', 'autoReport', 'reportPush',
  ];

  const updateData = {};
  for (const field of allowedFields) {
    if (settings.hasOwnProperty(field)) {
      updateData[field] = settings[field];
    }
  }

  updateData.updateTime = new Date();

  await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({ data: updateData });

  return { code: 0, data: { message: '设置已更新' } };
}

/**
 * 成员管理（移除/拉黑）
 */
async function handleManageMember(event, openid) {
  const { roomId, targetOpenid, action: manageAction } = event;

  // 验证房主身份
  const room = await db.collection(COLLECTIONS.ROOMS).doc(roomId).get();
  if (!room.data || room.data.ownerOpenid !== openid) {
    return { code: -3, error: '无权限操作' };
  }

  // 不能操作自己
  if (targetOpenid === openid) {
    return { code: -1, error: '不能操作自己' };
  }

  const now = new Date();

  switch (manageAction) {
    case 'remove':
      // 移除成员
      await db.collection(COLLECTIONS.ROOM_USER)
        .where({ roomId, openid: targetOpenid, status: 'active' })
        .update({
          data: { status: 'left', leaveTime: now },
        });
      await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
        data: { memberCount: _.inc(-1), updateTime: now },
      });
      return { code: 0, data: { message: '已移除成员' } };

    case 'ban':
      // 移除并拉黑
      await db.collection(COLLECTIONS.ROOM_USER)
        .where({ roomId, openid: targetOpenid })
        .update({
          data: { status: 'left', leaveTime: now, isBlack: true },
        });
      // 加入房间黑名单
      await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
        data: {
          blackList: _.push([targetOpenid]),
          memberCount: _.inc(-1),
          updateTime: now,
        },
      });
      return { code: 0, data: { message: '已移除并拉黑' } };

    default:
      return { code: -1, error: '未知操作' };
  }
}

/**
 * 生成邀请凭证（仅房主）
 */
async function handleGenerateInviteToken(event, openid) {
  const { roomId } = event;

  // 验证房主身份
  const room = await db.collection(COLLECTIONS.ROOMS).doc(roomId).get();
  if (!room.data || room.data.ownerOpenid !== openid) {
    return { code: -3, error: '无权限操作' };
  }

  const token = generateInviteToken();
  const now = new Date();
  const expireTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24小时后过期

  // 添加到邀请凭证列表
  await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
    data: {
      inviteTokens: _.push([{
        token,
        used: false,
        usedBy: null,
        createTime: now,
        expireTime,
      }]),
      updateTime: now,
    },
  });

  return {
    code: 0,
    data: {
      token,
      expireTime,
      message: '邀请凭证生成成功',
    },
  };
}

/**
 * 移交房主
 */
async function handleTransferOwnership(event, openid) {
  const { roomId, newOwnerOpenid } = event;

  // 验证当前房主身份
  const room = await db.collection(COLLECTIONS.ROOMS).doc(roomId).get();
  if (!room.data || room.data.ownerOpenid !== openid) {
    return { code: -3, error: '只有房主可移交权限' };
  }

  // 验证新房主是成员
  const newOwner = await db.collection(COLLECTIONS.ROOM_USER)
    .where({ roomId, openid: newOwnerOpenid, status: 'active' })
    .get();

  if (newOwner.data.length === 0) {
    return { code: -1, error: '新房主必须是房间成员' };
  }

  // 执行移交
  await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
    data: {
      ownerOpenid: newOwnerOpenid,
      updateTime: new Date(),
    },
  });

  return { code: 0, data: { message: '房主移交成功' } };
}

/**
 * 重置房间统计（仅房主，不删除个人存钱数据）
 */
async function handleResetRoomStats(event, openid) {
  const { roomId } = event;

  // 验证房主身份
  const room = await db.collection(COLLECTIONS.ROOMS).doc(roomId).get();
  if (!room.data || room.data.ownerOpenid !== openid) {
    return { code: -3, error: '无权限操作' };
  }

  const now = new Date();

  // 重置所有成员的打卡统计
  await db.collection(COLLECTIONS.ROOM_USER)
    .where({ roomId, status: 'active' })
    .update({
      data: {
        continueDay: 0,
        totalCheckinCount: 0,
        lastCheckinTime: null,
      },
    });

  // 清空打卡记录
  // 注意：云数据库批量删除有限制，这里采用分批删除或标记删除策略
  // 实际生产环境建议使用云函数定时任务清理
  await db.collection(COLLECTIONS.ROOM_CHECKIN)
    .where({ roomId })
    .remove(); // 仅适用于数据量小的情况

  return { code: 0, data: { message: '房间统计已重置' } };
}

/**
 * 解散房间（仅房主）
 */
async function handleDissolveRoom(event, openid) {
  const { roomId } = event;

  // 验证房主身份
  const room = await db.collection(COLLECTIONS.ROOMS).doc(roomId).get();
  if (!room.data || room.data.ownerOpenid !== openid) {
    return { code: -3, error: '只有房主可解散房间' };
  }

  const now = new Date();

  // 软删除房间
  await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
    data: {
      status: 'dissolved',
      dissolveTime: now,
      updateTime: now,
    },
  });

  // 将所有成员标记为离开
  await db.collection(COLLECTIONS.ROOM_USER)
    .where({ roomId, status: 'active' })
    .update({
      data: { status: 'left', leaveTime: now },
    });

  return { code: 0, data: { message: '房间已解散' } };
}

/**
 * 获取成员列表（房主专用）
 */
async function handleGetMemberList(event, openid) {
  const { roomId } = event;

  // 验证房主身份
  const room = await db.collection(COLLECTIONS.ROOMS).doc(roomId).get();
  if (!room.data || room.data.ownerOpenid !== openid) {
    return { code: -3, error: '无权限查看' };
  }

  const members = await db.collection(COLLECTIONS.ROOM_USER)
    .where({ roomId })
    .orderBy('joinTime', 'asc')
    .get();

  const memberList = members.data.map(m => ({
    openid: m.openid, // 房主可见
    nickname: m.roomNickname,
    continueDay: m.continueDay || 0,
    totalCheckinCount: m.totalCheckinCount || 0,
    lastCheckinTime: m.lastCheckinTime,
    joinTime: m.joinTime,
    status: m.status,
    isBlack: m.isBlack,
  }));

  return { code: 0, data: memberList };
}

// ==================== 🆕 订阅消息功能实现 ====================

/**
 * 订阅房间打卡提醒
 * 用户主动订阅某房间的每日打卡提醒
 *
 * 流程：
 * 1. 验证用户是房间成员
 * 2. 检查是否已订阅（避免重复）
 * 3. 写入订阅记录（或更新已有记录的授权时间）
 */
async function handleSubscribeRoom(event, openid) {
  const { roomId } = event;

  if (!roomId) {
    return { code: -1, error: '房间ID不能为空' };
  }

  // 1. 验证房间存在且活跃
  const roomResult = await db.collection(COLLECTIONS.ROOMS).doc(roomId).get();
  if (!roomResult.data || roomResult.data.status !== 'active') {
    return { code: -1, error: '房间不存在或已解散' };
  }

  // 2. 验证成员身份
  const memberResult = await db.collection(COLLECTIONS.ROOM_USER)
    .where({ roomId, openid, status: 'active' })
    .get();

  if (memberResult.data.length === 0) {
    return { code: -1, error: '您不是该房间成员，无法订阅' };
  }

  // 3. 检查是否已订阅
  const existSub = await db.collection(COLLECTIONS.ROOM_SUBSCRIBE)
    .where({ roomId, openid, status: 'active' })
    .get();

  const now = new Date();

  if (existSub.data.length > 0) {
    // 已订阅，更新授权时间（续期）
    await db.collection(COLLECTIONS.ROOM_SUBSCRIBE)
      .doc(existSub.data[0]._id)
      .update({
        data: {
          authTime: now,
          updateTime: now,
        },
      });

    return {
      code: 0,
      data: {
        message: '已更新订阅',
        renewed: true,
      },
    };
  }

  // 4. 新增订阅记录
  await db.collection(COLLECTIONS.ROOM_SUBSCRIBE).add({
    data: {
      roomId,
      openid,
      roomName: roomResult.data.roomName,
      status: 'active', // active | cancelled | expired
      authTime: now, // 最近一次授权时间
      lastPushTime: null, // 上次推送时间
      totalPushCount: 0, // 累计推送次数
      createTime: now,
      updateTime: now,
    },
  });

  console.log(`【房间订阅】用户 ${openid} 订阅了房间 ${roomId} 的打卡提醒`);

  return {
    code: 0,
    data: {
      message: '订阅成功！每日20:00将收到打卡提醒',
      subscribed: true,
    },
  };
}

/**
 * 取消订阅房间提醒
 */
async function handleUnsubscribeRoom(event, openid) {
  const { roomId } = event;

  if (!roomId) {
    return { code: -1, error: '房间ID不能为空' };
  }

  const result = await db.collection(COLLECTIONS.ROOM_SUBSCRIBE)
    .where({ roomId, openid, status: 'active' })
    .update({
      data: {
        status: 'cancelled',
        cancelTime: new Date(),
        updateTime: new Date(),
      },
    });

  if (result.stats.updated === 0) {
    return { code: -1, error: '未找到订阅记录' };
  }

  return { code: 0, data: { message: '已取消订阅' } };
}

/**
 * 获取用户在某房间的订阅状态
 */
async function handleGetSubscribeStatus(event, openid) {
  const { roomId } = event;

  if (!roomId) {
    return { code: -1, error: '房间ID不能为空' };
  }

  const subResult = await db.collection(COLLECTIONS.ROOM_SUBSCRIBE)
    .where({ roomId, openid })
    .orderBy('createTime', 'desc')
    .limit(1)
    .get();

  if (subResult.data.length === 0) {
    return {
      code: 0,
      data: {
        subscribed: false,
        status: 'none', // none | active | cancelled | expired
      },
    };
  }

  const sub = subResult.data[0];
  let status = sub.status;

  // 检查是否过期（7天未重新授权）
  if (status === 'active') {
    const daysSinceAuth = Math.floor(
      (Date.now() - new Date(sub.authTime).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceAuth >= AUTH_VALID_DAYS) {
      status = 'expired';
      // 自动标记为过期
      await db.collection(COLLECTIONS.ROOM_SUBSCRIBE).doc(sub._id).update({
        data: { status: 'expired', updateTime: new Date() },
      });
    }
  }

  return {
    code: 0,
    data: {
      subscribed: status === 'active',
      status,
      authTime: sub.authTime,
      lastPushTime: sub.lastPushTime,
      totalPushCount: sub.totalPushCount || 0,
    },
  };
}

/**
 * 发送每日打卡提醒（定时任务调用）
 *
 * 触发时间：每天 20:00
 * 逻辑：
 * 1. 查询所有活跃房间
 * 2. 对每个房间，找出今日未打卡且已订阅的用户
 * 3. 发送订阅消息
 * 4. 记录推送日志
 *
 * ⚠️ 此接口由云函数定时触发器调用，不需要用户openid
 */
async function handleSendDailyReminder(event) {
  console.log('【定时任务】开始发送每日打卡提醒...');

  const today = getTodayString();
  const now = new Date();
  let totalSent = 0;
  let totalFailed = 0;
  const errors = [];

  try {
    // 1. 查询所有活跃房间
    const roomsResult = await db.collection(COLLECTIONS.ROOMS)
      .where({ status: 'active' })
      .field({ _id: 1, roomName: 1 })
      .get();

    console.log(`【定时任务】找到 ${roomsResult.data.length} 个活跃房间`);

    // 2. 遍历每个房间
    for (const room of roomsResult.data) {
      try {
        // 查询该房间的活跃订阅用户
        const subsResult = await db.collection(COLLECTIONS.ROOM_SUBSCRIBE)
          .where({
            roomId: room._id,
            status: 'active',
            authTime: _.gte(new Date(Date.now() - AUTH_VALID_DAYS * 24 * 60 * 60 * 1000)),
          })
          .get();

        if (subsResult.data.length === 0) continue;

        // 找出今日已打卡的用户openid
        const checkedInResult = await db.collection(COLLECTIONS.ROOM_CHECKIN)
          .where({ roomId: room._id, date: today })
          .field({ openid: 1 })
          .get();

        const checkedInOpenids = new Set(checkedInResult.data.map(r => r.openid));

        // 过滤出未打卡的订阅用户
        const uncheckedSubs = subsResult.data.filter(sub => !checkedInOpenids.has(sub.openid));

        if (uncheckedSubs.length === 0) {
          console.log(`【定时任务】房间 ${room.roomName} 全员已打卡`);
          continue;
        }

        console.log(`【定时任务】房间 ${room.roomName} 有 ${uncheckedSubs.length} 人未打卡，准备发送提醒`);

        // 3. 逐个发送订阅消息
        for (const sub of uncheckedSubs) {
          try {
            await cloud.openapi.subscribeMessage.send({
              touser: sub.openid,
              templateId: SUBSCRIBE_TEMPLATE_ID,
              page: `/pages/room-detail/room-detail?roomId=${room._id}`,
              data: {
                thing1: { value: room.roomName.slice(0, 20) }, // 房间名称（最多20字）
                thing2: { value: '今日存钱打卡还没完成哦，加油！' }, // 提醒内容
              },
            });

            // 更新推送记录
            await db.collection(COLLECTIONS.ROOM_SUBSCRIBE).doc(sub._id).update({
              data: {
                lastPushTime: now,
                totalPushCount: _.inc(1),
                updateTime: now,
              },
            });

            totalSent++;
          } catch (err) {
            console.error(`【定时任务】发送失败 openid=${sub.openid}`, err);
            totalFailed++;
            errors.push({ openid: sub.openid, error: err.message });
          }
        }
      } catch (err) {
        console.error(`【定时任务】处理房间 ${room._id} 失败`, err);
        errors.push({ roomId: room._id, error: err.message });
      }
    }

    console.log(`【定时任务】每日提醒发送完成：成功 ${totalSent}，失败 ${totalFailed}`);

    return {
      code: 0,
      data: {
        success: true,
        totalSent,
        totalFailed,
        processTime: new Date(),
        errors: errors.slice(0, 10), // 最多返回10条错误
      },
    };
  } catch (err) {
    console.error('【定时任务】执行异常', err);
    return { code: -2, error: err.message };
  }
}

/**
 * 生成周报数据
 *
 * 周报内容：
 * - 房间名称、统计周期
 * - 本周打卡总人次
 * - 房间打卡参与率
 * - 最佳坚持用户（展示昵称）
 * - 正向鼓励文案
 */
async function handleGenerateWeeklyReport(event, openid) {
  const { roomId } = event;

  if (!roomId) {
    return { code: -1, error: '房间ID不能为空' };
  }

  // 验证房主身份
  const room = await db.collection(COLLECTIONS.ROOMS).doc(roomId).get();
  if (!room.data || room.data.ownerOpenid !== openid) {
    return { code: -3, error: '只有房主可生成周报' };
  }

  // 计算本周时间范围
  const now = new Date();
  const dayOfWeek = now.getDay() || 7; // 周日=7
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  // 查询本周打卡记录
  const weekCheckins = await db.collection(COLLECTIONS.ROOM_CHECKIN)
    .where({
      roomId,
      createTime: _.gte(monday).and(_.lte(sunday)),
    })
    .count();

  // 查询总成员数
  const memberCount = await db.collection(COLLECTIONS.ROOM_USER)
    .where({ roomId, status: 'active' })
    .count();

  // 计算参与率
  const participationRate = memberCount.total > 0
    ? Math.round((weekCheckins.total / memberCount.total) * 100)
    : 0;

  // 找出本周最佳坚持用户（打卡次数最多）
  const topUsers = await db.collection(COLLECTIONS.ROOM_CHECKIN)
    .where({
      roomId,
      createTime: _.gte(monday).and(_.lte(sunday)),
    })
    .groupBy('openid')
    .groupField(db.command.sum(1))
    .orderBy('total', 'desc')
    .limit(3)
    .get(); // 注意：聚合查询可能需要调整语法

  // 简化版：查询所有记录后在前端聚合
  const allWeekCheckins = await db.collection(COLLECTIONS.ROOM_CHECKIN)
    .where({
      roomId,
      createTime: _.gte(monday).and(_.lte(sunday)),
    })
    .field({ openid: 1, date: 1 })
    .get();

  // 统计每人打卡天数（去重）
  const userCheckinDays = {};
  allWeekCheckins.data.forEach(record => {
    if (!userCheckinDays[record.openid]) {
      userCheckinDays[record.openid] = new Set();
    }
    userCheckinDays[record.openid].add(record.date);
  });

  // 排序取前3
  const sortedUsers = Object.entries(userCheckinDays)
    .map(([openid, days]) => ({ openid, days: days.size }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 3);

  // 获取昵称
  const topOpenids = sortedUsers.map(u => u.openid);
  const membersInfo = await db.collection(COLLECTIONS.ROOM_USER)
    .where({ roomId, openid: _.in(topOpenids), status: 'active' })
    .field({ openid: 1, roomNickname: 1 })
    .get();

  const nicknameMap = {};
  membersInfo.data.forEach(m => { nicknameMap[m.openid] = m.roomNickname; });

  const topUsersFormatted = sortedUsers.map(u => ({
    nickname: nicknameMap[u.openid] || '匿名用户',
    days: u.days,
  }));

  // 组装周报数据
  const report = {
    roomId: room.data._id,
    roomName: room.data.roomName,
    period: {
      start: monday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0],
    },
    stats: {
      totalCheckins: weekCheckins.total,
      memberCount: memberCount.total,
      participationRate,
    },
    topUsers: topUsersFormatted,
    encouragement: getEncouragementText(participationRate),
    generateTime: now.toISOString(),
  };

  // 保存周报到数据库（可选，用于历史查看）
  await db.collection('room_weekly_reports').add({
    data: {
      ...report,
      creatorOpenid: openid,
      createTime: now,
    },
  });

  return {
    code: 0,
    data: {
      report,
      message: '周报生成成功',
    },
  };
}

/**
 * 发送周报通知给订阅了推送的成员
 */
async function handleSendWeeklyReport(event, openid) {
  const { roomId, reportId } = event;

  if (!roomId) {
    return { code: -1, error: '房间ID不能为空' };
  }

  // 验证房主身份
  const room = await db.collection(COLLECTIONS.ROOMS).doc(roomId).get();
  if (!room.data || room.data.ownerOpenid !== openid) {
    return { code: -3, error: '只有房主可发送周报' };
  }

  // 获取最新周报
  let report;
  if (reportId) {
    const reportResult = await db.collection('room_weekly_reports').doc(reportId).get();
    report = reportResult.data;
  } else {
    // 使用最新的
    const latestReport = await db.collection('room_weekly_reports')
      .where({ roomId })
      .orderBy('createTime', 'desc')
      .limit(1)
      .get();
    report = latestReport.data[0];
  }

  if (!report) {
    return { code: -1, error: '未找到周报数据' };
  }

  // 查询订阅了周报推送的成员
  const subsResult = await db.collection(COLLECTIONS.ROOM_SUBSCRIBE)
    .where({
      roomId,
      status: 'active',
      authTime: _.gte(new Date(Date.now() - AUTH_VALID_DAYS * 24 * 60 * 60 * 1000)),
    })
    .get();

  let sentCount = 0;
  const now = new Date();

  for (const sub of subsResult.data) {
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: sub.openid,
        templateId: SUBSCRIBE_TEMPLATE_ID,
        page: `/pages/room-detail/room-detail?roomId=${roomId}`,
        data: {
          thing1: { value: `${report.roomName}周报来啦`.slice(0, 20) },
          thing2: { value: `本周参与率${report.stats.participationRate}%，点击查看详情`.slice(0, 30) },
        },
      });

      // 更新推送记录
      await db.collection(COLLECTIONS.ROOM_SUBSCRIBE).doc(sub._id).update({
        data: {
          lastPushTime: now,
          totalPushCount: _.inc(1),
          updateTime: now,
        },
      });

      sentCount++;
    } catch (err) {
      console.error(`【周报推送】发送失败 openid=${sub.openid}`, err);
    }
  }

  return {
    code: 0,
    data: {
      message: `周报已推送给 ${sentCount} 位成员`,
      sentCount,
    },
  };
}

/**
 * 根据参与率生成鼓励文案
 */
function getEncouragementText(rate) {
  if (rate >= 80) return '太棒了！大家这周非常努力，继续保持！💪';
  if (rate >= 60) return '不错的开始！再接再厉，下周会更好！🌟';
  if (rate >= 40) return '还有提升空间，互相监督，一起加油！🔥';
  return '新的一周，新的开始！坚持就是胜利！✨';
}

