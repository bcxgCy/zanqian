const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const QUIZ_RESULT_COLLECTION = 'quiz_results';
const USER_COLLECTION = 'users';

const QUIZ_TYPE_DOUBLE11 = 'double11';
const QUIZ_TYPE_SAVING_PERSONA = 'saving_persona';

function normalizeQuizType(quizType) {
  const type = String(quizType || '').trim();
  if (type === QUIZ_TYPE_DOUBLE11 || type === QUIZ_TYPE_SAVING_PERSONA) return type;
  return '';
}

function generateQuizResultId() {
  return 'qres_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function getQuizResultDocId(openid, quizType) {
  return openid + '_' + quizType;
}

function getDefaultUser() {
  return {
    nickName: '好友',
    avatarUrl: '',
  };
}

function matchLegacyQuizResultByType(legacyResult, quizType) {
  if (!legacyResult || typeof legacyResult !== 'object') return false;
  if (quizType === QUIZ_TYPE_DOUBLE11) {
    return String(legacyResult.version || '').startsWith('double11_quiz_');
  }
  if (quizType === QUIZ_TYPE_SAVING_PERSONA) {
    return !!(legacyResult.persona && legacyResult.recommendations);
  }
  return false;
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (err) {
    if (!String(err.errMsg || '').includes('collection exists')) {
      console.warn('创建集合失败：' + name, err);
    }
  }
}

async function getUserState(openid) {
  try {
    const res = await db.collection(USER_COLLECTION).doc(openid).get();
    return res.data || {};
  } catch (err) {
    return {};
  }
}

function extractLegacyQuizResult(userState, quizType) {
  if (!userState || typeof userState !== 'object') return null;

  const typed = userState.quizResults && userState.quizResults[quizType]
    ? userState.quizResults[quizType]
    : null;
  if (typed) return typed;

  const legacy = userState.quizResult || null;
  if (matchLegacyQuizResultByType(legacy, quizType)) {
    return legacy;
  }

  return null;
}

function buildOwnerProfile(userState) {
  const user = (userState && userState.user) || {};
  return {
    nickName: user.nickName || '好友',
    avatarUrl: user.avatarUrl || '',
  };
}

async function saveQuizResult(openid, quizResult, quizType) {
  const type = normalizeQuizType(quizType);
  if (!type) {
    return {
      openid,
      success: false,
      error: '测评类型不支持',
    };
  }

  await ensureCollection(QUIZ_RESULT_COLLECTION);

  if (!quizResult) {
    try {
      await db.collection(QUIZ_RESULT_COLLECTION).doc(getQuizResultDocId(openid, type)).remove();
    } catch (err) {
      // 文档不存在时忽略
    }

    return {
      openid,
      success: true,
      quizType: type,
      quizResult: null,
      hasQuizResult: false,
    };
  }

  const userState = await getUserState(openid);
  const nextQuizResult = Object.assign({}, quizResult, {
    updatedAt: Date.now(),
    resultId: quizResult.resultId || generateQuizResultId(),
  });

  const docData = {
    openid,
    quizType: type,
    resultId: nextQuizResult.resultId,
    owner: buildOwnerProfile(userState),
    quizResult: nextQuizResult,
    updatedAt: db.serverDate(),
  };

  await db.collection(QUIZ_RESULT_COLLECTION).doc(getQuizResultDocId(openid, type)).set({
    data: docData,
  });

  return {
    openid,
    success: true,
    quizType: type,
    quizResult: nextQuizResult,
    hasQuizResult: true,
    owner: docData.owner,
  };
}

async function getQuizResult(openid, quizType) {
  const type = normalizeQuizType(quizType);
  if (!type) {
    return {
      openid,
      success: false,
      error: '测评类型不支持',
    };
  }

  await ensureCollection(QUIZ_RESULT_COLLECTION);

  try {
    const res = await db.collection(QUIZ_RESULT_COLLECTION).doc(getQuizResultDocId(openid, type)).get();
    const data = res.data || {};
    if (data.quizResult) {
      return {
        openid,
        success: true,
        quizType: type,
        quizResult: data.quizResult,
        hasQuizResult: true,
        owner: data.owner || getDefaultUser(),
      };
    }
  } catch (err) {
    // 未命中则继续走兼容读取
  }

  const userState = await getUserState(openid);
  const legacyResult = extractLegacyQuizResult(userState, type);
  if (!legacyResult) {
    return {
      openid,
      success: true,
      quizType: type,
      quizResult: null,
      hasQuizResult: false,
    };
  }

  const saved = await saveQuizResult(openid, legacyResult, type);
  return Object.assign({}, saved, {
    migratedFromLegacy: true,
  });
}

async function getQuizResultById(openid, quizType, resultId) {
  const type = normalizeQuizType(quizType);
  const safeResultId = String(resultId || '').trim();

  if (!type) {
    return {
      openid,
      success: false,
      error: '测评类型不支持',
    };
  }

  if (!safeResultId) {
    return {
      openid,
      success: false,
      error: '测评结果ID不能为空',
    };
  }

  await ensureCollection(QUIZ_RESULT_COLLECTION);

  try {
    const res = await db.collection(QUIZ_RESULT_COLLECTION)
      .where({
        quizType: type,
        resultId: safeResultId,
      })
      .limit(1)
      .get();

    if (!res.data || !res.data.length) {
      return {
        openid,
        success: false,
        error: '结果已失效或已被覆盖',
      };
    }

    const data = res.data[0] || {};
    return {
      openid,
      success: true,
      quizType: type,
      resultId: safeResultId,
      owner: data.owner || getDefaultUser(),
      quizResult: data.quizResult || null,
    };
  } catch (err) {
    console.error('按ID获取测评结果失败', err);
    return {
      openid,
      success: false,
      error: err.errMsg || '获取结果失败',
    };
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action || '';

  if (action === 'saveQuizResult') {
    return saveQuizResult(openid, event.quizResult || null, event.quizType || '');
  }

  if (action === 'getQuizResult') {
    return getQuizResult(openid, event.quizType || '');
  }

  if (action === 'getQuizResultById') {
    return getQuizResultById(openid, event.quizType || '', event.resultId || '');
  }

  return {
    openid,
    success: false,
    error: 'Unknown action: ' + action,
    availableActions: ['saveQuizResult', 'getQuizResult', 'getQuizResultById'],
  };
};
