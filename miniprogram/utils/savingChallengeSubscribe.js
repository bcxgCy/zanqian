const TEMPLATE_ID = 'sUAAtSpg266YBGZLK68uQKqgFd_73cfnEZ0OhglS7Ow';
const STORAGE_PREFIX = 'challenge_subscribe_';

function getStorageKey(challengeId, type) {
  return `${STORAGE_PREFIX}${challengeId}_${type}`;
}

function today() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function clearAuth(challengeId) {
  try {
    wx.removeStorageSync(getStorageKey(challengeId, 'auth'));
    wx.removeStorageSync(getStorageKey(challengeId, 'used'));
  } catch (e) {
    console.warn('清除挑战提醒授权失败', e);
  }
}

function hasValidAuth(challengeId) {
  try {
    const authTime = wx.getStorageSync(getStorageKey(challengeId, 'auth'));
    if (!authTime) return false;
    const used = wx.getStorageSync(getStorageKey(challengeId, 'used'));
    return !used;
  } catch (e) {
    console.warn('检查挑战提醒状态失败', e);
    return false;
  }
}

function getButtonStatus(challengeId) {
  if (hasValidAuth(challengeId)) {
    return {
      status: 'disabled',
      text: '今日提醒已生效',
      remainingDays: 0,
    };
  }

  return {
    status: 'active',
    text: '开启打卡提醒',
    remainingDays: 0,
  };
}

function recordAuth(challengeId) {
  try {
    wx.setStorageSync(getStorageKey(challengeId, 'auth'), today());
    wx.removeStorageSync(getStorageKey(challengeId, 'used'));
    syncAuthToCloud(challengeId);
  } catch (e) {
    console.warn('记录挑战提醒授权失败', e);
  }
}

function syncAuthToCloud(challengeId) {
  try {
    wx.cloud.callFunction({
      name: 'reminderSender',
      data: {
        type: 'syncChallengeAuth',
        challengeId,
      },
    }).catch((err) => {
      console.warn('同步挑战提醒授权到云端失败', err);
    });
  } catch (e) {
    console.warn('挑战提醒云端同步不可用', e);
  }
}

function triggerManual(challengeId) {
  if (!challengeId) return false;

  const btnStatus = getButtonStatus(challengeId);
  if (btnStatus.status === 'disabled') {
    wx.showToast({ title: '提醒已生效', icon: 'none' });
    return false;
  }

  wx.requestSubscribeMessage({
    tmplIds: [TEMPLATE_ID],
    success: (res) => {
      if (res[TEMPLATE_ID] === 'accept') {
        recordAuth(challengeId);
        wx.showToast({ title: '挑战提醒已开启', icon: 'success' });
      } else {
        wx.showToast({ title: '已取消', icon: 'none' });
      }
    },
    fail: (err) => {
      console.warn('挑战提醒订阅失败', err);
    },
  });

  return true;
}

function syncStatusFromCloud(challengeId) {
  if (!challengeId) return Promise.resolve(null);
  try {
    return wx.cloud.callFunction({
      name: 'reminderSender',
      data: {
        type: 'getChallengeStatus',
        challengeId,
      },
    }).then((res) => {
      const result = (res && res.result) || {};
      const record = result.record || null;
      if (!record) return null;

      if (record.authTime) {
        wx.setStorageSync(getStorageKey(challengeId, 'auth'), record.authTime);
      }

      if (record.quotaUsed) {
        wx.setStorageSync(getStorageKey(challengeId, 'used'), today());
        wx.removeStorageSync(getStorageKey(challengeId, 'auth'));
      } else if (record.authTime) {
        wx.removeStorageSync(getStorageKey(challengeId, 'used'));
      }

      wx.removeStorageSync(getStorageKey(challengeId, 'reject'));

      return record;
    }).catch((err) => {
      console.warn('同步挑战提醒云端状态失败', err);
      return null;
    });
  } catch (e) {
    console.warn('挑战提醒云端状态同步不可用', e);
    return Promise.resolve(null);
  }
}

module.exports = {
  TEMPLATE_ID,
  getButtonStatus,
  triggerManual,
  syncStatusFromCloud,
};
