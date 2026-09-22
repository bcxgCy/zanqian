const storage = require('./storage');

const PLAN_ADD_AD_UNIT_ID = 'adunit-f86047ca07ec5daa';

function showModalAsync(options) {
  return new Promise((resolve) => {
    wx.showModal(Object.assign({}, options, {
      success: (res) => resolve(!!res.confirm),
      fail: (err) => {
        console.warn('[planAddAd] showModal fail', err);
        resolve(false);
      },
    }));
  });
}

function watchRewardedVideo() {
  return new Promise((resolve, reject) => {
    if (typeof wx.createRewardedVideoAd !== 'function') {
      reject(new Error('UNSUPPORTED_REWARDED_AD'));
      return;
    }

    const rewardedVideoAd = wx.createRewardedVideoAd({ adUnitId: PLAN_ADD_AD_UNIT_ID });
    const onClose = (res) => {
      rewardedVideoAd.offClose(onClose);
      rewardedVideoAd.offError(onError);
      resolve(!!(res && res.isEnded));
    };
    const onError = (err) => {
      console.warn('[planAddAd] onError', err);
      rewardedVideoAd.offClose(onClose);
      rewardedVideoAd.offError(onError);
      reject(new Error('AD_LOAD_FAIL'));
    };

    rewardedVideoAd.onClose(onClose);
    rewardedVideoAd.onError(onError);
    rewardedVideoAd.show()
      .catch((showErr) => {
        console.warn('[planAddAd] show 失败，准备重试', showErr);
        return rewardedVideoAd.load().then(() => rewardedVideoAd.show());
      })
      .catch((err) => {
        console.warn('[planAddAd] show/load 失败', err);
        rewardedVideoAd.offClose(onClose);
        rewardedVideoAd.offError(onError);
        reject(new Error('AD_LOAD_FAIL'));
      });
  });
}

async function ensurePlanAddQuota() {
  wx.showLoading({ title: '校验中', mask: true });
  let consumeResult;
  let access;
  try {
    consumeResult = await storage.consumePlanAddQuota();
    if (consumeResult.allowed) {
      return true;
    }

    access = await storage.getPlanAddAccess();
  } finally {
    wx.hideLoading();
  }

  const content = `你已创建${access.freePlanLimit}个免费存钱计划，观看一段短视频，即可解锁1个额外心愿计划创建名额。`;
  const confirmed = await showModalAsync({
    title: '已达免费计划上限',
    content,
    cancelText: '取消',
    confirmText: '去解锁',
  });
  if (!confirmed) return false;

  const completed = await watchRewardedVideo();
  if (!completed) {
    wx.showToast({ title: '广告未完整观看，名额解锁失败', icon: 'none' });
    return false;
  }

  const rewardToken = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  wx.showLoading({ title: '解锁中', mask: true });
  let postConsume;
  try {
    await storage.grantPlanAddQuotaByAd(PLAN_ADD_AD_UNIT_ID, rewardToken);
    postConsume = await storage.consumePlanAddQuota();
  } finally {
    wx.hideLoading();
  }
  if (!postConsume.allowed) {
    wx.showToast({ title: '名额解锁失败，请稍后再试', icon: 'none' });
    return false;
  }

  wx.showToast({ title: '解锁成功', icon: 'success' });
  return true;
}

module.exports = {
  PLAN_ADD_AD_UNIT_ID,
  ensurePlanAddQuota,
};
