const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const USER_COLLECTION = 'users';

function getDefaultState(openid) {
  return {
    openid,
    user: {
      nickName: '存钱达人',
      avatarUrl: '',
      savingDays: 0,
    },
    plans: [],
    updatedAt: db.serverDate(),
  };
}

async function getState(openid) {
  try {
    const res = await db.collection(USER_COLLECTION).doc(openid).get();
    return res.data;
  } catch (err) {
    try {
      await db.createCollection(USER_COLLECTION);
    } catch (createErr) {
      if (!String(createErr.errMsg || '').includes('collection exists')) {
        console.warn('创建 users 集合失败', createErr);
      }
    }
    const state = getDefaultState(openid);
    await db.collection(USER_COLLECTION).doc(openid).set({
      data: state,
    });
    return state;
  }
}

async function updateState(openid, data) {
  const state = await getState(openid);
  const next = Object.assign({}, state, data, {
    openid,
    updatedAt: db.serverDate(),
  });
  delete next._id;
  await db.collection(USER_COLLECTION).doc(openid).set({
    data: next,
  });
  return next;
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action || 'login';

  if (action === 'login' || action === 'getState') {
    const state = await getState(openid);
    return {
      openid,
      user: state.user || getDefaultState(openid).user,
      plans: state.plans || [],
    };
  }

  if (action === 'saveUser') {
    const state = await updateState(openid, {
      user: event.user || getDefaultState(openid).user,
    });
    return { openid, user: state.user, plans: state.plans || [] };
  }

  if (action === 'savePlans') {
    const state = await updateState(openid, {
      plans: event.plans || [],
    });
    return { openid, user: state.user || getDefaultState(openid).user, plans: state.plans };
  }

  if (action === 'clear') {
    const state = await updateState(openid, {
      plans: [],
    });
    return { openid, user: state.user || getDefaultState(openid).user, plans: [] };
  }

  return {
    openid,
    error: 'Unknown action: ' + action,
  };
};
