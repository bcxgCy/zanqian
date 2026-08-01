const BADGES = [
  { id: 'first_save', name: '初出茅庐', desc: '完成第一笔存入', icon: '🌱', check: (s) => s.recordCount >= 1 },
  { id: 'save_7', name: '坚持一周', desc: '累计存钱7天', icon: '🔥', check: (s) => s.savingDays >= 7 },
  { id: 'save_30', name: '月度达人', desc: '累计存钱30天', icon: '⭐', check: (s) => s.savingDays >= 30 },
  { id: 'save_100', name: '百元达成', desc: '累计存入100元', icon: '💯', check: (s) => s.savedTotal >= 100 },
  { id: 'save_1000', name: '千元大户', desc: '累计存入1000元', icon: '🏆', check: (s) => s.savedTotal >= 1000 },
  { id: 'save_10000', name: '万元梦想', desc: '累计存入10000元', icon: '👑', check: (s) => s.savedTotal >= 10000 },
  { id: 'plan_3', name: '多线作战', desc: '同时拥有3个存钱计划', icon: '🎯', check: (s) => s.planCount >= 3 },
  { id: 'record_10', name: '勤记账', desc: '累计存入10笔', icon: '📝', check: (s) => s.recordCount >= 10 },
];

function getBadges(stats) {
  const payload = Object.assign({}, stats, { planCount: stats.planCount || 0 });
  return BADGES.map((b) => ({
    id: b.id,
    name: b.name,
    desc: b.desc,
    icon: b.icon,
    unlocked: b.check(payload),
  }));
}

module.exports = { BADGES, getBadges };
