const CATEGORY = {
  progress: 'progress',
  checkin: 'checkin',
  behavior: 'behavior',
};

const BADGES = [
  {
    id: 'first_bucket',
    name: '第一桶金',
    category: CATEGORY.progress,
    desc: '恭喜完成你的第一个攒钱计划，开启储蓄之路',
    slogan: '开启储蓄第一步，未来可期！',
    image: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/1.jpg',
    lockedImage: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/14.jpg',
  },
  {
    id: 'save_1000',
    name: '小有积蓄',
    category: CATEGORY.progress,
    desc: '累计攒钱达到 1000 元，积少成多，步步向前',
    slogan: '点滴积累，初见成效',
    image: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/2.jpg',
    lockedImage: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/15.jpg',
  },
  {
    id: 'save_5000',
    name: '积少成多',
    category: CATEGORY.progress,
    desc: '累计攒钱达到 5000 元，点滴付出终有回报',
    slogan: '聚沙成塔，攒钱路上稳步前行',
    image: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/3.jpg',
    lockedImage: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/16.jpg',
  },
  {
    id: 'save_10000',
    name: '财富萌芽',
    category: CATEGORY.progress,
    desc: '累计攒钱达到 10000 元，财富的种子正在发芽',
    slogan: '财富生根发芽，未来持续增值',
    image: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/4.jpg',
    lockedImage: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/17.jpg',
  },
  {
    id: 'save_30000',
    name: '储蓄新星',
    category: CATEGORY.progress,
    desc: '累计攒钱达到 30000 元，你是名副其实储蓄新星',
    slogan: '超强储蓄力，新晋攒钱达人',
    image: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/5.jpg',
    lockedImage: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/18.jpg',
  },
  {
    id: 'first_checkin',
    name: '首日打卡',
    category: CATEGORY.checkin,
    desc: '完成第一次存钱打卡，储蓄习惯由此开始',
    slogan: '储蓄习惯，从此刻开始',
    image: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/6.jpg',
    lockedImage: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/19.jpg',
  },
  {
    id: 'streak_7',
    name: '七日坚守',
    category: CATEGORY.checkin,
    desc: '连续打卡 7 天，坚持是储蓄最好的伙伴',
    slogan: '自律 7 天，好习惯正在养成',
    image: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/7.jpg',
    lockedImage: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/20.jpg',
  },
  {
    id: 'streak_30',
    name: '月度储蓄家',
    category: CATEGORY.checkin,
    desc: '连续打卡 30 天，一个月的自律值得嘉奖',
    slogan: '整月坚持，极度自律！',
    image: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/8.jpg',
    lockedImage: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/21.jpg',
  },
  {
    id: 'streak_90',
    name: '持之以恒',
    category: CATEGORY.checkin,
    desc: '连续打卡 90 天，长期坚持收获更好的自己',
    slogan: '90 天长期主义，战胜拖延',
    image: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/9.jpg',
    lockedImage: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/22.jpg',
  },
  {
    id: 'create_5',
    name: '计划大师',
    category: CATEGORY.behavior,
    desc: '累计创建 5 个攒钱计划，善于规划自己的目标',
    slogan: '擅长规划，目标感超强',
    image: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/10.jpg',
    lockedImage: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/23.jpg',
  },
  {
    id: 'multi_3',
    name: '多线奋斗',
    category: CATEGORY.behavior,
    desc: '同时拥有多个进行中的攒钱计划，多目标并行努力',
    slogan: '多目标并行，努力加倍',
    image: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/11.jpg',
    lockedImage: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/24.jpg',
  },
  {
    id: 'record_10',
    name: '复盘达人',
    category: CATEGORY.behavior,
    desc: '完成多次存钱记录，善于记录和复盘收支',
    slogan: '善于复盘，财富稳步增长',
    image: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/12.jpg',
    lockedImage: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/25.jpg',
  },
  {
    id: 'restart_once',
    name: '重整旗鼓',
    category: CATEGORY.behavior,
    desc: '跌倒之后重新出发，重新开启你的攒钱计划',
    slogan: '不惧重来，自律更坚定',
    image: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/13.jpg',
    lockedImage: 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/badges/26.jpg',
  },
];

const BADGE_MAP = BADGES.reduce((map, badge) => {
  map[badge.id] = badge;
  return map;
}, {});

function getMaxContinuousDays(records) {
  if (!records || !records.length) return 0;
  const dates = [...new Set(records.map((record) => record.date))].sort();
  if (!dates.length) return 0;
  let max = 1;
  let current = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T00:00:00').getTime();
    const now = new Date(dates[i] + 'T00:00:00').getTime();
    const diff = Math.round((now - prev) / 86400000);
    if (diff === 1) {
      current += 1;
      if (current > max) max = current;
    } else {
      current = 1;
    }
  }
  return max;
}

function evaluateUnlockIds(payload) {
  const completedPlanCount = payload.completedPlanCount || 0;
  const savedTotal = payload.savedTotal || 0;
  const recordCount = payload.recordCount || 0;
  const streakDays = payload.maxStreakDays || 0;
  const createdPlanCount = payload.createdPlanCount || 0;
  const activePlanCount = payload.activePlanCount || 0;
  const rebuiltOnce = !!payload.rebuiltOnce;

  const unlockedIds = [];
  if (completedPlanCount >= 1) unlockedIds.push('first_bucket');
  if (savedTotal >= 1000) unlockedIds.push('save_1000');
  if (savedTotal >= 5000) unlockedIds.push('save_5000');
  if (savedTotal >= 10000) unlockedIds.push('save_10000');
  if (savedTotal >= 30000) unlockedIds.push('save_30000');
  if (recordCount >= 1) unlockedIds.push('first_checkin');
  if (streakDays >= 7) unlockedIds.push('streak_7');
  if (streakDays >= 30) unlockedIds.push('streak_30');
  if (streakDays >= 90) unlockedIds.push('streak_90');
  if (createdPlanCount >= 5) unlockedIds.push('create_5');
  if (activePlanCount >= 3) unlockedIds.push('multi_3');
  if (recordCount >= 10) unlockedIds.push('record_10');
  if (rebuiltOnce) unlockedIds.push('restart_once');
  return unlockedIds;
}

function getBadgeById(id) {
  return BADGE_MAP[id] || null;
}

function getDefaultBadgeState() {
  return {
    unlocked: [],
    dayShare: { date: '', count: 0 },
  };
}

module.exports = {
  CATEGORY,
  BADGES,
  BADGE_MAP,
  getBadgeById,
  getDefaultBadgeState,
  getMaxContinuousDays,
  evaluateUnlockIds,
};
