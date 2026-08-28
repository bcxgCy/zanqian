/**
 * 房间管理工具类
 *
 * 核心功能：
 * - 房间码生成（6位纯数字）
 * - 昵称校验与消毒
 * - 打卡状态判断
 * - 断签计算
 * - 榜单排序（dense_rank）
 */

// ==================== 常量配置 ====================

const ROOM_CODE_LENGTH = 6; // 房间码长度（纯数字）
const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 12;
const INVITE_TOKEN_LENGTH = 8; // 邀请凭证长度
const INVITE_TOKEN_EXPIRE_HOURS = 24; // 凭证有效期（小时）

// ==================== 房间码生成 ====================

/**
 * 生成6位纯数字房间码
 * @returns {string} 6位数字字符串（100000-999999）
 */
function generateRoomCode() {
  return String(Math.floor(Math.random() * 900000) + 100000);
}

/**
 * 校验房间码格式
 * @param {string} code 待校验的房间码
 * @returns {boolean} 是否合法
 */
function isValidRoomCode(code) {
  return /^\d{6}$/.test(code);
}

// ==================== 邀请凭证生成 ====================

/**
 * 生成8位一次性邀请凭证（纯数字）
 * @returns {string} 8位数字字符串
 */
function generateInviteToken() {
  let token = '';
  for (let i = 0; i < INVITE_TOKEN_LENGTH; i++) {
    token += Math.floor(Math.random() * 10);
  }
  return token;
}

/**
 * 计算凭证过期时间
 * @returns {Date} 24小时后的时间戳
 */
function getInviteTokenExpireTime() {
  return new Date(Date.now() + INVITE_TOKEN_EXPIRE_HOURS * 60 * 60 * 1000);
}

/**
 * 检查凭证是否过期
 * @param {Date} expireTime 过期时间
 * @returns {boolean} 是否已过期
 */
function isInviteTokenExpired(expireTime) {
  return new Date() > new Date(expireTime);
}

// ==================== 昵称校验与消毒 ====================

/**
 * 昵称严格校验
 * 规则：2-12字符，仅支持中文、字母、数字
 *
 * @param {string} nickname 待校验昵称
 * @returns {{ valid: boolean, error: string|null }} 校验结果
 */
function validateNickname(nickname) {
  if (!nickname || nickname.trim().length === 0) {
    return { valid: false, error: '昵称不能为空' };
  }

  const trimmed = nickname.trim();

  if (trimmed.length < NICKNAME_MIN_LENGTH) {
    return { valid: false, error: `昵称至少 ${NICKNAME_MIN_LENGTH} 个字符` };
  }

  if (trimmed.length > NICKNAME_MAX_LENGTH) {
    return { valid: false, error: `昵称最多 ${NICKNAME_MAX_LENGTH} 个字符` };
  }

  // 仅允许中文、大小写字母、数字
  const legalPattern = /^[一-龥a-zA-Z0-9]+$/;
  if (!legalPattern.test(trimmed)) {
    return { valid: false, error: '仅支持中文、字母、数字' };
  }

  // TODO: 敏感词校验（可扩展词库）
  if (containsSensitiveWord(trimmed)) {
    return { valid: false, error: '昵称包含违规内容，请重新输入' };
  }

  return { valid: true, error: null };
}

/**
 * 昵称消毒（强制过滤非法字符）
 * @param {string} nickname 原始昵称
 * @returns {string} 清洗后的昵称
 */
function sanitizeNickname(nickname) {
  if (!nickname) return '';

  // 移除所有非中文字符、字母、数字的字符
  let sanitized = nickname.replace(/[^一-龥a-zA-Z0-9]/g, '');

  // 截断到最大长度
  return sanitized.slice(0, NICKNAME_MAX_LENGTH);
}

/**
 * 简易敏感词检测（可扩展）
 * @param {string} text 待检测文本
 * @returns {boolean} 是否包含敏感词
 */
function containsSensitiveWord(text) {
  // 基础敏感词列表（可根据业务需要扩展）
  const sensitiveWords = [
    '敏感词1', '敏感词2', // 示例，实际使用时替换为真实词库
  ];

  const lowerText = text.toLowerCase();
  return sensitiveWords.some(word => lowerText.includes(word.toLowerCase()));
}

// ==================== 打卡状态计算 ====================

/**
 * 判断是否断签
 * 规则：上次打卡时间不是昨天或今天 → 断签
 *
 * @param {Date|string} lastCheckinTime 上次打卡时间
 * @returns {boolean} 是否断签
 */
function isBrokenChain(lastCheckinTime) {
  if (!lastCheckinTime) return true;

  const lastDate = new Date(lastCheckinTime).toDateString();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  // 上次打卡不是昨天或今天 → 断签
  return lastDate !== yesterday && lastDate !== today;
}

/**
 * 获取今天的日期字符串 YYYY-MM-DD
 * @returns {string}
 */
function getTodayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 获取昨天的日期字符串 YYYY-MM-DD
 * @returns {string}
 */
function getYesterdayString() {
  const d = new Date(Date.now() - 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ==================== 榜单排序算法 ====================

/**
 * Dense Rank 并列排名算法
 * 同分同名次，下名不跳号
 * 例：[10, 10, 8] → [1, 1, 3]
 *
 * @param {Array} list 已排序列表
 * @param {string} scoreField 排序字段名
 * @returns {Array} 添加了 rank 字段的列表
 */
function denseRank(list, scoreField) {
  let rank = 0;
  let prevScore = null;

  return list.map((item, index) => {
    const currentScore = item[scoreField];

    // 首个元素或分数变化时更新排名
    if (index === 0 || currentScore !== prevScore) {
      rank = index + 1;
    }

    prevScore = currentScore;
    return { ...item, rank };
  });
}

/**
 * 连续榜排序
 * 排序优先级：
 * 1. 当前连续打卡天数 降序
 * 2. 最后打卡时间 新的在前
 * 3. 入房时间 早的在前
 *
 * @param {Array} members 成员列表
 * @returns {Array} 排序后的列表（含排名）
 */
function sortContinueRank(members) {
  const sorted = [...members].sort((a, b) => {
    // 优先级1：连续天数降序
    if (b.continueDay !== a.continueDay) {
      return b.continueDay - a.continueDay;
    }

    // 优先级2：最后打卡时间降序（新的在前）
    const timeA = a.lastCheckinTime ? new Date(a.lastCheckinTime).getTime() : 0;
    const timeB = b.lastCheckinTime ? new Date(b.lastCheckinTime).getTime() : 0;
    if (timeB !== timeA) {
      return timeB - timeA;
    }

    // 优先级3：入房时间升序（早的在前）
    const joinA = a.joinTime ? new Date(a.joinTime).getTime() : Infinity;
    const joinB = b.joinTime ? new Date(b.joinTime).getTime() : Infinity;
    return joinA - joinB;
  });

  return denseRank(sorted, 'continueDay');
}

/**
 * 累计打卡榜排序
 * 排序优先级：
 * 1. 房间累计打卡总次数 降序
 * 2. 最后打卡时间 新的在前
 * 3. 入房时间 早的在前
 *
 * @param {Array} members 成员列表
 * @returns {Array} 排序后的列表（含排名）
 */
function sortTotalRank(members) {
  const sorted = [...members].sort((a, b) => {
    // 优先级1：累计次数降序
    if (b.totalCheckinCount !== a.totalCheckinCount) {
      return b.totalCheckinCount - a.totalCheckinCount;
    }

    // 优先级2：最后打卡时间降序
    const timeA = a.lastCheckinTime ? new Date(a.lastCheckinTime).getTime() : 0;
    const timeB = b.lastCheckinTime ? new Date(b.lastCheckinTime).getTime() : 0;
    if (timeB !== timeA) {
      return timeB - timeA;
    }

    // 优先级3：入房时间升序
    const joinA = a.joinTime ? new Date(a.joinTime).getTime() : Infinity;
    const joinB = b.joinTime ? new Date(b.joinTime).getTime() : Infinity;
    return joinA - joinB;
  });

  return denseRank(sorted, 'totalCheckinCount');
}

// ==================== 权限判断 ====================

/**
 * 判断用户是否为房主
 * @param {object} room 房间信息
 * @param {string} openid 用户openid
 * @returns {boolean}
 */
function isRoomOwner(room, openid) {
  return room && room.ownerOpenid === openid;
}

/**
 * 判断用户是否在黑名单中
 * @param {object} room 房间信息
 * @param {string} openid 用户openid
 * @returns {boolean}
 */
function isInBlacklist(room, openid) {
  return room && Array.isArray(room.blackList) && room.blackList.includes(openid);
}

// ==================== 数据格式化 ====================

/**
 * 格式化房间数据（用于前端展示）
 * @param {object} room 原始房间数据
 * @returns {object} 格式化后的数据
 */
function formatRoomForDisplay(room) {
  if (!room) return null;

  return {
    ...room,
    // 统计字段（冗余或实时计算）
    memberCount: room.memberCount || 0,
    todayCheckinCount: room.todayCheckinCount || 0,
    weekCheckinCount: room.weekCheckinCount || 0,

    // 格式化时间
    createTimeFormatted: formatDate(room.createTime),
    updateTimeFormatted: formatDate(room.updateTime),
  };
}

/**
 * 格式化成员数据（用于前端展示）
 * @param {object} member 原始成员数据
 * @returns {object}
 */
function formatMemberForDisplay(member) {
  if (!member) return null;

  return {
    ...member,
    joinTimeFormatted: formatDate(member.joinTime),
    lastCheckinTimeFormatted: formatDateTime(member.lastCheckinTime),
    isTodayCheckedIn: isCheckedInToday(member.lastCheckinTime),
  };
}

/**
 * 判断今日是否已打卡
 * @param {Date|string} lastCheckinTime 最后打卡时间
 * @returns {boolean}
 */
function isCheckedInToday(lastCheckinTime) {
  if (!lastCheckinTime) return false;
  const lastDate = new Date(lastCheckinTime).toDateString();
  const today = new Date().toDateString();
  return lastDate === today;
}

/**
 * 格式化日期（YYYY-MM-DD）
 * @param {Date|string|number} date
 * @returns {string}
 */
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 格式化日期时间（YYYY-MM-DD HH:mm）
 * @param {Date|string|number} date
 * @returns {string}
 */
function formatDateTime(date) {
  if (!date) return '';
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

// ==================== 导出模块 ====================

module.exports = {
  // 常量
  ROOM_CODE_LENGTH,
  NICKNAME_MIN_LENGTH,
  NICKNAME_MAX_LENGTH,
  INVITE_TOKEN_LENGTH,
  INVITE_TOKEN_EXPIRE_HOURS,

  // 房间码
  generateRoomCode,
  isValidRoomCode,

  // 邀请凭证
  generateInviteToken,
  getInviteTokenExpireTime,
  isInviteTokenExpired,

  // 昵称
  validateNickname,
  sanitizeNickname,

  // 打卡状态
  isBrokenChain,
  getTodayString,
  getYesterdayString,
  isCheckedInToday,

  // 榜单排序
  denseRank,
  sortContinueRank,
  sortTotalRank,

  // 权限
  isRoomOwner,
  isInBlacklist,

  // 数据格式化
  formatRoomForDisplay,
  formatMemberForDisplay,
  formatDate,
  formatDateTime,
};
