const QUIZ_VERSION = 'double11_quiz_v1';
const QUIZ_DONE_KEY = 'double11_quiz_done_v1';
const QUIZ_DRAFT_KEY = 'double11_quiz_draft_v1';
const QUIZ_POPUP_FREQ_KEY = 'double11_quiz_popup_freq_v1';

const QUIZ_POPUP_IMAGE = 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/other/ceshi-11-popup.jpg';

const DIMENSIONS = {
  A: { key: 'A', label: '预算规划能力', maxRaw: 20 },
  B: { key: 'B', label: '营销抵抗力', maxRaw: 25 },
  C: { key: 'C', label: '凑单囤货自控', maxRaw: 25 },
  D: { key: 'D', label: '存钱目标优先级', maxRaw: 15 },
  E: { key: 'E', label: '消费复盘习惯', maxRaw: 15 },
};

const RADAR_INDICATORS = [
  '预算规划能力',
  '营销抵抗力',
  '凑单囤货自控',
  '存钱目标优先级',
  '消费复盘习惯',
];

const QUESTIONS = [
  {
    id: 1,
    dimension: 'A',
    title: '往年双十一，你会提前设置总消费预算上限吗？',
    options: [
      { key: 'A', text: '每次都会，并且严格遵守', score: 5 },
      { key: 'B', text: '会设置，但经常不小心超支', score: 4 },
      { key: 'C', text: '想过，但不会写下来', score: 2 },
      { key: 'D', text: '完全不做预算，看到喜欢就买', score: 0 },
    ],
  },
  {
    id: 2,
    dimension: 'A',
    title: '本次双十一，你会提前写购物清单吗？',
    options: [
      { key: 'A', text: '详细清单，只买清单内物品', score: 5 },
      { key: 'B', text: '简单记录，看到好物会额外加购', score: 3 },
      { key: 'C', text: '想到什么加什么，不提前写清单', score: 1 },
      { key: 'D', text: '不做任何清单，刷到随缘下单', score: 0 },
    ],
  },
  {
    id: 3,
    dimension: 'A',
    title: '双十一购物，你会预留独立预算，不占用存钱计划吗？',
    options: [
      { key: 'A', text: '单独预留，绝不挪用存钱的钱', score: 5 },
      { key: 'B', text: '少量占用，后续尽快补回存款', score: 3 },
      { key: 'C', text: '大概率会挤占存钱目标', score: 1 },
      { key: 'D', text: '直接动用存款，优先满足购物', score: 0 },
    ],
  },
  {
    id: 4,
    dimension: 'A',
    title: '当想买的商品超出本次双十一预算，你通常怎么做？',
    options: [
      { key: 'A', text: '直接放弃，延后购买', score: 5 },
      { key: 'B', text: '压缩其他非必要开支挤出预算', score: 3 },
      { key: 'C', text: '寻找平替低价方案', score: 2 },
      { key: 'D', text: '透支消费，先买再说', score: 0 },
    ],
  },
  {
    id: 5,
    dimension: 'B',
    title: '看到“限时特价、最后几小时、限量”这类话术，你会？',
    options: [
      { key: 'A', text: '不受影响，只看是否真的需要', score: 5 },
      { key: 'B', text: '会被吸引，需要反复克制', score: 3 },
      { key: 'C', text: '很容易被紧迫感带动下单', score: 1 },
      { key: 'D', text: '看到这种字眼就忍不住立刻下单', score: 0 },
    ],
  },
  {
    id: 6,
    dimension: 'B',
    title: '你判断一件商品是不是真低价，依靠什么？',
    options: [
      { key: 'A', text: '提前记录历史价格对比', score: 5 },
      { key: 'B', text: '看最终满减后价格', score: 3 },
      { key: 'C', text: '相信商家宣传的全年最低价', score: 1 },
      { key: 'D', text: '看博主/直播间推荐就觉得划算', score: 0 },
    ],
  },
  {
    id: 7,
    dimension: 'B',
    title: '直播、短视频种草对你下单的影响？',
    options: [
      { key: 'A', text: '几乎不会被种草影响', score: 5 },
      { key: 'B', text: '会心动，但会冷静评估需求', score: 3 },
      { key: 'C', text: '容易被种草，加入购物车', score: 1 },
      { key: 'D', text: '直播间当场冲动下单', score: 0 },
    ],
  },
  {
    id: 8,
    dimension: 'B',
    title: '购买大额商品，你会使用24小时冷静期吗？',
    options: [
      { key: 'A', text: '大额商品一定会等待冷静期', score: 5 },
      { key: 'B', text: '偶尔会等待冷静思考', score: 3 },
      { key: 'C', text: '很少，看中直接付款', score: 1 },
      { key: 'D', text: '从不等待，看到优惠直接下单', score: 0 },
    ],
  },
  {
    id: 9,
    dimension: 'B',
    title: '下单前，你会评估商品一年大概使用多少次吗？',
    options: [
      { key: 'A', text: '每次大额消费都会估算频次', score: 5 },
      { key: 'B', text: '偶尔会想一想', score: 3 },
      { key: 'C', text: '基本不会，好看便宜就买', score: 1 },
      { key: 'D', text: '完全不会考虑使用频次', score: 0 },
    ],
  },
  {
    id: 10,
    dimension: 'C',
    title: '你会不会为凑满减，购买原本不需要的商品？',
    options: [
      { key: 'A', text: '绝对不会，拒绝为优惠多花钱', score: 5 },
      { key: 'B', text: '偶尔小额凑单', score: 3 },
      { key: 'C', text: '经常为凑满减加购商品', score: 1 },
      { key: 'D', text: '为了凑满减大量囤货', score: 0 },
    ],
  },
  {
    id: 11,
    dimension: 'C',
    title: '往年双十一囤货，你遇到过哪种情况？',
    options: [
      { key: 'A', text: '按需囤货，基本不会浪费', score: 5 },
      { key: 'B', text: '少量囤货，偶尔有闲置', score: 3 },
      { key: 'C', text: '囤多了，部分过期闲置', score: 1 },
      { key: 'D', text: '大量囤货，经常过期浪费', score: 0 },
    ],
  },
  {
    id: 12,
    dimension: 'C',
    title: '你怎么看待双十一囤货？',
    options: [
      { key: 'A', text: '只囤刚需消耗品，控制总量', score: 5 },
      { key: 'B', text: '合适的情况下少量囤货', score: 3 },
      { key: 'C', text: '趁大促多囤，节省未来开销', score: 1 },
      { key: 'D', text: '折扣大就大量囤，不用考虑存量', score: 0 },
    ],
  },
  {
    id: 13,
    dimension: 'C',
    title: '你购买商品，会优先查看保价规则吗？',
    options: [
      { key: 'A', text: '每次下单前都查看保价', score: 5 },
      { key: 'B', text: '偶尔会看，不会仔细研究', score: 3 },
      { key: 'C', text: '很少关注保价', score: 1 },
      { key: 'D', text: '从不看保价，买完随缘', score: 0 },
    ],
  },
  {
    id: 14,
    dimension: 'C',
    title: '往年双十一，你买到闲置商品占比？',
    options: [
      { key: 'A', text: '几乎没有，全部是刚需', score: 5 },
      { key: 'B', text: '大约1/4是非刚需闲置', score: 3 },
      { key: 'C', text: '大约1/2是非刚需闲置', score: 1 },
      { key: 'D', text: '大部分都是冲动购买，闲置多', score: 0 },
    ],
  },
  {
    id: 15,
    dimension: 'D',
    title: '双十一期间，你会使用花呗/信用卡透支消费吗？',
    options: [
      { key: 'A', text: '坚决不透支，只用已有存款', score: 5 },
      { key: 'B', text: '小额透支，发工资立刻还清', score: 3 },
      { key: 'C', text: '经常透支，还款压力较大', score: 1 },
      { key: 'D', text: '依靠透支完成购物', score: 0 },
    ],
  },
  {
    id: 16,
    dimension: 'D',
    title: '你认为双十一省钱的核心是什么？',
    options: [
      { key: 'A', text: '只买刚需，不被优惠绑架', score: 5 },
      { key: 'B', text: '尽可能多领优惠券薅福利', score: 3 },
      { key: 'C', text: '趁大促集中采购，多囤货', score: 1 },
      { key: 'D', text: '喜欢就买，折扣优先', score: 0 },
    ],
  },
  {
    id: 17,
    dimension: 'D',
    title: '双十一消费对你存钱计划的影响？',
    options: [
      { key: 'A', text: '完全不影响存钱目标', score: 5 },
      { key: 'B', text: '会小幅挤占存钱进度', score: 3 },
      { key: 'C', text: '大幅推迟存钱目标达成', score: 1 },
      { key: 'D', text: '直接中断存钱计划', score: 0 },
    ],
  },
  {
    id: 18,
    dimension: 'E',
    title: '大促结束后，你会复盘哪些是不必要支出吗？',
    options: [
      { key: 'A', text: '每年都会复盘，优化下一年消费', score: 5 },
      { key: 'B', text: '想复盘，但经常懒得记录', score: 3 },
      { key: 'C', text: '偶尔复盘，简单看看账单', score: 1 },
      { key: 'D', text: '不会复盘，买完就结束', score: 0 },
    ],
  },
  {
    id: 19,
    dimension: 'E',
    title: '你希望通过哪种方式控制双十一支出？',
    options: [
      { key: 'A', text: '预算+记账+消费评估工具多重管控', score: 5 },
      { key: 'B', text: '固定预算，简单记账记录订单', score: 3 },
      { key: 'C', text: '靠自己意志力提醒少买东西', score: 1 },
      { key: 'D', text: '不做任何消费管控', score: 0 },
    ],
  },
  {
    id: 20,
    dimension: 'E',
    title: '本次双十一你的消费目标？',
    options: [
      { key: 'A', text: '尽量少买，守住存钱目标', score: 5 },
      { key: 'B', text: '适度购买，遇到划算好物入手', score: 3 },
      { key: 'C', text: '集中采购，趁活动多囤货', score: 1 },
      { key: 'D', text: '不控制，喜欢就直接下单', score: 0 },
    ],
  },
];

const ROLE_LIST = [
  {
    key: 'rational_guardian',
    min: 80,
    max: 100,
    name: '理性守财人',
    slogan: '优惠套路千千万，我的存钱不动摇',
    intro: '大促清醒玩家，优惠套路很难收割你。你会提前做好预算清单，不会被限时、满减、直播话术裹挟。下单前评估使用频次，坚持大额消费冷静期。双十一优先守住存钱目标，不为折扣买入闲置物品，是省钱搭子里的靠谱榜样。',
    diagnosis: '你的消费风险很低，能把大促支出控制在预留预算内，能识别涨价再打折、囤货浪费等陷阱。雷达图整体多边形饱满，各维度均衡。',
    advice: '继续保持，把本次双十一预算录入小程序，实时记账；可以发起省钱搭子挑战，带动伙伴一起理性消费。',
    entries: ['新建「双十一专项存钱计划」', '开启【不冲动下单】省钱挑战'],
  },
  {
    key: 'careful_planner',
    min: 60,
    max: 79,
    name: '谨慎规划党',
    slogan: '心中有预算，种草不盲目',
    intro: '你会提前做购物规划，预留预算。但遇到直播间种草、巨大折扣时容易动摇，偶尔为凑满减额外加购。大体能守住存钱目标，但存在小幅超支风险。',
    diagnosis: '中等偏低风险，大部分购买是刚需，但要警惕临时冲动单品。雷达图通常会在【营销抵抗力】或【凑单囤货自控】出现凹陷。',
    advice: '加购商品先用消费评估工具逐一打分；超过500元的商品强制开启24小时冷静期。',
    entries: ['单品消费评估', '记账记录大促支出', '省钱搭子互相帮你把关购物清单'],
  },
  {
    key: 'bundle_hunter',
    min: 40,
    max: 59,
    name: '凑单爱好者',
    slogan: '优惠虽香，别为满减多花钱',
    intro: '你喜欢研究优惠券、满减玩法，热衷于薅优惠。但经常为凑满减，买下原本不需要的商品。预算容易超标，囤货多，部分商品最后闲置，会小幅挤压存钱目标。',
    diagnosis: '中等消费风险。核心误区：把“省了多少钱”当成赚到，忽略了“多花出去的钱”。雷达图明显凹陷项一般是【凑单囤货自控】。',
    advice: '牢记：不买，才是最大的折扣。下单前用小程序评估每一件凑单商品，判断是否真的需要，设置消费上限，超预算就停止加购。',
    entries: ['消费评估表单', '每周支出复盘', '挑战：双十一不凑无用满减'],
  },
  {
    key: 'impulse_star',
    min: 20,
    max: 39,
    name: '冲动种草星',
    slogan: '种草一时爽，复盘泪两行',
    intro: '很容易被直播、短视频、博主推荐打动。看到限时、限量就忍不住下单，缺少购物清单，预算经常失控。容易买到闲置，双十一支出会明显挤占存钱计划。',
    diagnosis: '高冲动风险。容易踩先涨价后降价、囤货过期等陷阱，买完大概率产生后悔情绪。雷达图【营销抵抗力】得分偏低。',
    advice: '减少刷直播种草内容；所有非刚需商品必须等待24小时冷静期。下单前先在小程序填写消费评估，再决定是否付款。',
    entries: ['24小时冷静消费评估', '开启「双十一不盲目种草」省钱挑战', '找省钱搭子帮忙审核购物清单'],
  },
  {
    key: 'free_spender',
    min: 0,
    max: 19,
    name: '随心剁手党',
    slogan: '快乐消费，也要守住存钱目标',
    intro: '双十一主打取悦自己，很少提前做预算和购物清单。遇到喜欢的直接下单，不怎么比价，透支消费概率高，大促支出会严重推迟甚至中断存钱目标。',
    diagnosis: '极高消费风险。容易大量购入闲置物品，大促结束后容易产生经济压力与后悔情绪。雷达图多个维度向内凹陷。',
    advice: '先暂停新增加购，给自己设置硬性双十一总预算。每一笔大额消费，都先用消费评估工具做评估，优先保护你的存钱目标。',
    entries: ['新建存钱目标，设置支出预警', '记账追踪每一笔订单', '消费评估，大额商品强制冷静'],
  },
];

function getRoleByScore(totalScore) {
  const score = Math.max(0, Math.min(100, Math.round(totalScore || 0)));
  const match = ROLE_LIST.find((item) => score >= item.min && score <= item.max);
  return match || ROLE_LIST[ROLE_LIST.length - 1];
}

function getOptionScore(question, optionKey) {
  if (!question) return 0;
  const options = Array.isArray(question.options) ? question.options : [];
  const option = options.find((item) => item.key === optionKey);
  return option ? option.score : 0;
}

function computeDimensionScores(answerMap) {
  const raw = { A: 0, B: 0, C: 0, D: 0, E: 0 };

  QUESTIONS.forEach((question) => {
    const selected = answerMap[question.id] || '';
    raw[question.dimension] += getOptionScore(question, selected);
  });

  const normalized = {
    A: Number((raw.A / DIMENSIONS.A.maxRaw * 25).toFixed(1)),
    B: Number((raw.B / DIMENSIONS.B.maxRaw * 25).toFixed(1)),
    C: Number((raw.C / DIMENSIONS.C.maxRaw * 25).toFixed(1)),
    D: Number((raw.D / DIMENSIONS.D.maxRaw * 25).toFixed(1)),
    E: Number((raw.E / DIMENSIONS.E.maxRaw * 25).toFixed(1)),
  };

  return {
    raw,
    normalized,
  };
}

function buildWeaknessTip(normalized) {
  const pairs = Object.keys(normalized).map((key) => ({
    key,
    label: DIMENSIONS[key].label,
    score: normalized[key],
  })).sort((a, b) => a.score - b.score);

  const weak = pairs.slice(0, 2).filter((item) => item.score < 18);
  if (!weak.length) {
    return '你的五维能力整体比较均衡，继续保持“预算先行 + 冷静决策 + 复盘优化”的节奏。';
  }

  const weakLabels = weak.map((item) => item.label).join('、');
  return `你的薄弱项：${weakLabels}，建议围绕该维度优先建立1条可执行规则。`;
}

function evaluateQuiz(answerMap) {
  const answers = answerMap || {};
  const dimension = computeDimensionScores(answers);
  const radar = [
    dimension.normalized.A,
    dimension.normalized.B,
    dimension.normalized.C,
    dimension.normalized.D,
    dimension.normalized.E,
  ];

  const totalScore = Math.round((radar.reduce((sum, item) => sum + item, 0) / 125) * 100);
  const role = getRoleByScore(totalScore);

  return {
    version: QUIZ_VERSION,
    updatedAt: Date.now(),
    answers,
    totalScore,
    role,
    slogan: role.slogan,
    radar,
    indicators: RADAR_INDICATORS,
    dimensionScores: {
      A: { key: 'A', label: DIMENSIONS.A.label, raw: dimension.raw.A, score: dimension.normalized.A, max: 25 },
      B: { key: 'B', label: DIMENSIONS.B.label, raw: dimension.raw.B, score: dimension.normalized.B, max: 25 },
      C: { key: 'C', label: DIMENSIONS.C.label, raw: dimension.raw.C, score: dimension.normalized.C, max: 25 },
      D: { key: 'D', label: DIMENSIONS.D.label, raw: dimension.raw.D, score: dimension.normalized.D, max: 25 },
      E: { key: 'E', label: DIMENSIONS.E.label, raw: dimension.raw.E, score: dimension.normalized.E, max: 25 },
    },
    diagnosis: role.diagnosis,
    advice: role.advice,
    entries: role.entries,
    weaknessTip: buildWeaknessTip(dimension.normalized),
  };
}

module.exports = {
  QUIZ_VERSION,
  QUIZ_DONE_KEY,
  QUIZ_DRAFT_KEY,
  QUIZ_POPUP_FREQ_KEY,
  QUIZ_POPUP_IMAGE,
  QUESTIONS,
  DIMENSIONS,
  RADAR_INDICATORS,
  ROLE_LIST,
  getRoleByScore,
  evaluateQuiz,
};
