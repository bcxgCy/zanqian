const dateUtil = require('./date');
const planUtil = require('./plan');

const QUIZ_SHARE_IMAGE = 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/other/ceshi-share.jpg';
const QUIZ_POPUP_IMAGE = 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/other/ceshi-popup.jpg';

const OPTION_KEYS = ['A', 'B', 'C'];

const QUESTIONS = [
  {
    id: 1,
    title: '发工资当天你第一反应？',
    options: {
      A: '先犒劳自己，想买的东西先安排，剩下再存',
      B: '固定先转一笔钱存起来，剩余再消费',
      C: '看心情，有钱就存，没钱就算',
    },
  },
  {
    id: 2,
    title: '看到直播间 / 短视频种草好物，你的行为？',
    options: {
      A: '冲动下单，喜欢就买，很难忍住',
      B: '加入收藏，冷静 3-7 天再决定要不要买',
      C: '几乎不被种草，非刚需绝不消费',
    },
  },
  {
    id: 3,
    title: '每月实际存钱情况？',
    options: {
      A: '几乎存不下，月光或者结余很少',
      B: '能存一部分，但经常中途破功',
      C: '可以稳定存下预设金额',
    },
  },
  {
    id: 4,
    title: '如果存钱计划中断 1-2 天，你会？',
    options: {
      A: '直接摆烂，干脆放弃整个计划',
      B: '稍微遗憾，调整后继续坚持',
      C: '无所谓，补上记录继续打卡',
    },
  },
  {
    id: 5,
    title: '更能接受哪一种存钱节奏？',
    options: {
      A: '短周期，7-15 天快速看到成果',
      B: '中等周期，30-100 天循序渐进',
      C: '长期持久战，半年、一年慢慢积累',
    },
  },
  {
    id: 6,
    title: '意外多出一笔小钱（红包 / 奖金），你会？',
    options: {
      A: '直接拿来吃喝玩乐花掉',
      B: '一半花一半存起来',
      C: '全部归入存钱小金库',
    },
  },
  {
    id: 7,
    title: '面对临时开销（朋友聚餐、临时购物）',
    options: {
      A: '没有预留预算，花完挤压存款',
      B: '有备用小金库，不打乱存钱目标',
      C: '想到再说，走一步看一步',
    },
  },
  {
    id: 8,
    title: '关于打卡坚持这件事',
    options: {
      A: '需要强激励，很容易三分钟热度',
      B: '可以坚持，但需要提醒督促',
      C: '自律很强，不需要提醒也能完成',
    },
  },
  {
    id: 9,
    title: '你的存钱核心动机？',
    options: {
      A: '想攒钱，但没有明确目标，玩玩而已',
      B: '有小目标，买手机、旅行这类短期心愿',
      C: '大额目标，买房、储备应急金等长期目标',
    },
  },
  {
    id: 10,
    title: '对于存钱失败你的心态',
    options: {
      A: '很挫败，会否定自己',
      B: '当成经验，调整方案重新再来',
      C: '看淡得失，计划灵活调整就好',
    },
  },
];

const PERSONA_MAP = {
  impulsive: {
    key: 'impulsive',
    emoji: '🔥',
    title: '热血冲动型选手',
    tag: '🔥冲动选手',
    description: '热情满满但是抵挡不住消费诱惑，很容易开局猛，中途摆烂。不建议直接上 365 天长周期！',
    recommendationText: '推荐先用 7 天打卡建立成就感，再衔接 15 天轻量计划。',
  },
  struggling: {
    key: 'struggling',
    emoji: '⚖️',
    title: '摇摆挣扎型选手',
    tag: '⚖️摇摆选手',
    description: '心里想存钱，但现实总被各种开销打乱，经常反复横跳。自律中等，需要阶段性正向反馈。',
    recommendationText: '推荐 30 天打卡或 100 天挑战，用中周期推进稳定习惯。',
  },
  steady: {
    key: 'steady',
    emoji: '🛡',
    title: '稳扎稳打型选手',
    tag: '🛡稳扎选手',
    description: '消费克制，目标感强，执行力在线，不容易被外界消费裹挟。',
    recommendationText: '推荐 100 天挑战或 365 天全年打卡，发挥长期执行优势。',
  },
  easygoing: {
    key: 'easygoing',
    emoji: '☁️',
    title: '佛系随缘型选手',
    tag: '☁️佛系选手',
    description: '存钱全看缘分，不强求自己，拒绝焦虑式攒钱。不适合高强度打卡。',
    recommendationText: '推荐自定义存钱计划，不强制每日打卡，随心记录。',
  },
};

function getPresetTotal(presetId, fallback) {
  const preset = planUtil.getPreset(presetId);
  return (preset && Number(preset.totalAmount)) || fallback;
}

const RECOMMENDATIONS = {
  impulsive: [
    {
      id: 'preset-7day',
      name: '7天打卡',
      type: 'preset',
      presetId: '7day',
      targetAmount: getPresetTotal('7day', 28),
    },
    {
      id: 'custom-15day',
      name: '15天轻量计划',
      type: 'custom',
      customType: 'fixed',
      frequency: 'day',
      durationDays: 15,
      amountPerPeriod: 20,
      targetAmount: 300,
    },
  ],
  struggling: [
    {
      id: 'preset-30day',
      name: '30天打卡',
      type: 'preset',
      presetId: '30day',
      targetAmount: getPresetTotal('30day', 465),
    },
    {
      id: 'preset-100day',
      name: '100天挑战',
      type: 'preset',
      presetId: '100day',
      targetAmount: getPresetTotal('100day', 5050),
    },
  ],
  steady: [
    {
      id: 'preset-100day',
      name: '100天挑战',
      type: 'preset',
      presetId: '100day',
      targetAmount: getPresetTotal('100day', 5050),
    },
    {
      id: 'preset-365',
      name: '365存钱法',
      type: 'preset',
      presetId: '365',
      targetAmount: getPresetTotal('365', 66795),
    },
  ],
  easygoing: [
    {
      id: 'custom-flexible',
      name: '自定义存钱计划',
      type: 'custom',
      customType: 'fixed',
      frequency: 'week',
      durationDays: 84,
      amountPerPeriod: 100,
      targetAmount: 1200,
    },
  ],
};

function normalizeAnswer(answer) {
  if (typeof answer !== 'string') return '';
  const normalized = answer.trim().toUpperCase();
  return OPTION_KEYS.includes(normalized) ? normalized : '';
}

function getOptionCounts(answers) {
  const counts = { A: 0, B: 0, C: 0 };
  (answers || []).forEach((answer) => {
    const key = normalizeAnswer(answer);
    if (key) counts[key] += 1;
  });
  return counts;
}

function isBalancedCount(counts) {
  const values = OPTION_KEYS.map((key) => counts[key] || 0);
  const max = Math.max.apply(null, values);
  const min = Math.min.apply(null, values);
  return max - min <= 1;
}

function resolvePersonaByCounts(counts) {
  if (isBalancedCount(counts)) return 'easygoing';

  const ranked = OPTION_KEYS
    .map((key) => ({ key, count: counts[key] || 0 }))
    .sort((a, b) => b.count - a.count);

  if (ranked[0].count > ranked[1].count) {
    if (ranked[0].key === 'A') return 'impulsive';
    if (ranked[0].key === 'B') return 'struggling';
    return 'steady';
  }

  return 'struggling';
}

function buildTemplateForRecommendation(rec, today) {
  const startDate = today || dateUtil.today();
  if (rec.type === 'preset') {
    return {
      name: rec.name,
      icon: '🎯',
      targetAmount: rec.targetAmount,
      startDate,
      planType: 'preset',
      presetId: rec.presetId,
    };
  }

  const durationDays = Math.max(Number(rec.durationDays) || 30, 1);
  const endDate = dateUtil.formatDate(dateUtil.addDays(dateUtil.parseDate(startDate), durationDays - 1));
  const amountPerPeriod = Number(rec.amountPerPeriod) || 50;

  return {
    name: rec.name,
    icon: '💰',
    targetAmount: rec.targetAmount || amountPerPeriod * Math.ceil(durationDays / 7),
    startDate,
    endDate,
    planType: rec.customType === 'deadline' ? 'custom_deadline' : 'custom_fixed',
    customConfig: {
      frequency: rec.frequency || 'day',
      amountPerPeriod,
      endDate,
    },
  };
}

function evaluateQuiz(answers) {
  const questionCount = QUESTIONS.length;
  const normalizedAnswers = (answers || []).slice(0, questionCount).map(normalizeAnswer);
  const answeredCount = normalizedAnswers.filter(Boolean).length;
  const counts = getOptionCounts(normalizedAnswers);
  const personaKey = resolvePersonaByCounts(counts);
  const persona = PERSONA_MAP[personaKey];
  const recommendations = (RECOMMENDATIONS[personaKey] || []).map((rec) => Object.assign({}, rec));

  return {
    questionCount,
    answeredCount,
    completed: answeredCount === questionCount,
    answers: normalizedAnswers,
    counts,
    personaKey,
    persona,
    recommendations,
    shareImage: QUIZ_SHARE_IMAGE,
    popupImage: QUIZ_POPUP_IMAGE,
  };
}

function buildPlanAddTemplate(rec, today) {
  if (!rec) return null;
  return buildTemplateForRecommendation(rec, today);
}

function cachePlanTemplate(wxApi, template) {
  if (!wxApi || typeof wxApi.setStorageSync !== 'function' || !template) return '';
  const key = `quiz_template_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  wxApi.setStorageSync(key, template);
  return key;
}

function buildPlanAddPath(templateKey) {
  if (!templateKey) return '/pages/plan-add/plan-add';
  return `/pages/plan-add/plan-add?templateKey=${encodeURIComponent(templateKey)}`;
}

function buildResultTrackingPayload(result) {
  if (!result) return null;
  return {
    personaKey: result.personaKey,
    personaTag: result.persona ? result.persona.tag : '',
    counts: result.counts,
    answeredCount: result.answeredCount,
    questionCount: result.questionCount,
    completed: !!result.completed,
    recommendationIds: (result.recommendations || []).map((item) => item.id),
    createdAt: Date.now(),
  };
}

module.exports = {
  QUIZ_SHARE_IMAGE,
  QUIZ_POPUP_IMAGE,
  QUESTIONS,
  PERSONA_MAP,
  RECOMMENDATIONS,
  evaluateQuiz,
  buildPlanAddTemplate,
  cachePlanTemplate,
  buildPlanAddPath,
  buildResultTrackingPayload,
};
