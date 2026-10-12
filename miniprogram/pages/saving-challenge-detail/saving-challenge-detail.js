const savingChallengeService = require('../../utils/savingChallengeService');
const savingChallengeSubscribe = require('../../utils/savingChallengeSubscribe');

const SHARE_POSTER = 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/other/shengqian-share.jpg';
const REPAIR_CHECKIN_AD_UNIT_ID = 'adunit-4246932e8146615c';

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildMonthCalendar(year, month, statusMap, startDate, endDate) {
  const todayKey = formatDate(new Date());
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const weekOffset = (first.getDay() + 6) % 7;
  const cells = [];

  for (let i = 0; i < weekOffset; i++) {
    cells.push({ empty: true, key: `e-${i}` });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dateKey = formatDate(date);
    const inChallengeRange = !!startDate && !!endDate && dateKey >= startDate && dateKey <= endDate;
    const status = inChallengeRange ? (statusMap[dateKey] || 'pending') : 'inactive';
    const isTodayPending = status === 'pending' && dateKey === todayKey;
    cells.push({
      key: dateKey,
      empty: false,
      day,
      status,
      isToday: dateKey === todayKey,
      className: `status-${status}${isTodayPending ? ' status-pending-today' : ''}`,
    });
  }

  return cells;
}

function getCheckedDays(statusMap) {
  const map = statusMap || {};
  return Object.keys(map).filter((key) => map[key] === 'checked' || map[key] === 'repair').length;
}

Page({
  data: {
    challengeId: '',
    challenge: null,
    weekTitles: ['一', '二', '三', '四', '五', '六', '日'],
    monthLabel: '',
    calendarCells: [],
    subscribeBtnStatus: 'active',
    subscribeBtnText: '开启提醒',
  },

  onLoad(options) {
    this.setData({ challengeId: options.id || '' });
    const today = new Date();
    this.setData({ monthLabel: `${today.getFullYear()}年${today.getMonth() + 1}月` });
    if (wx.showShareMenu) {
      wx.showShareMenu({
        menus: ['shareAppMessage'],
      });
    }
  },

  onShareAppMessage() {
    const challenge = this.data.challenge || {};
    const challengeName = (challenge.name || '').trim() || '省钱挑战';
    const checkedDays = Number(challenge.checkedDays) || 0;
    const savedAmount = Number(challenge.savedAmount) || 0;
    const title = `${challengeName}我已坚持${checkedDays}天，省下¥${savedAmount}，邀请你一起加入！`;
    return {
      title,
      imageUrl: SHARE_POSTER,
      path: '/pages/saving-challenge-create/saving-challenge-create?from=invite',
    };
  },

  onShow() {
    this.loadDetail();
    savingChallengeSubscribe.syncStatusFromCloud(this.data.challengeId).finally(() => {
      this.updateSubscribeButtonStatus();
    });
  },

  updateSubscribeButtonStatus() {
    const challengeId = this.data.challengeId;
    if (!challengeId) return;
    const status = savingChallengeSubscribe.getButtonStatus(challengeId);
    this.setData({
      subscribeBtnStatus: status.status,
      subscribeBtnText: status.text,
    });
  },

  onSubscribeTap() {
    const challengeId = this.data.challengeId;
    if (!challengeId) return;

    const requested = savingChallengeSubscribe.triggerManual(challengeId);
    if (requested) {
      setTimeout(() => {
        this.updateSubscribeButtonStatus();
      }, 1000);
      return;
    }

    savingChallengeSubscribe.syncStatusFromCloud(challengeId).finally(() => {
      this.updateSubscribeButtonStatus();
    });
  },

  trySubscribeBeforeCheckin() {
    const challengeId = this.data.challengeId;
    if (!challengeId) return;
    const status = savingChallengeSubscribe.getButtonStatus(challengeId);
    if (status.status !== 'active') return;
    savingChallengeSubscribe.triggerManual(challengeId);
  },

  watchRepairCheckinAd() {
    return new Promise((resolve, reject) => {
      if (typeof wx.createRewardedVideoAd !== 'function') {
        reject(new Error('UNSUPPORTED_REWARDED_AD'));
        return;
      }

      const rewardedVideoAd = wx.createRewardedVideoAd({ adUnitId: REPAIR_CHECKIN_AD_UNIT_ID });
      const onClose = (res) => {
        rewardedVideoAd.offClose(onClose);
        rewardedVideoAd.offError(onError);
        resolve(!!(res && res.isEnded));
      };
      const onError = () => {
        rewardedVideoAd.offClose(onClose);
        rewardedVideoAd.offError(onError);
        reject(new Error('AD_LOAD_FAIL'));
      };

      rewardedVideoAd.onClose(onClose);
      rewardedVideoAd.onError(onError);
      rewardedVideoAd.show()
        .catch(() => rewardedVideoAd.load().then(() => rewardedVideoAd.show()))
        .catch(() => {
          rewardedVideoAd.offClose(onClose);
          rewardedVideoAd.offError(onError);
          reject(new Error('AD_LOAD_FAIL'));
        });
    });
  },

  async submitCheckin(key, canRepair) {
    this.trySubscribeBeforeCheckin();
    try {
      const ret = await savingChallengeService.checkinChallenge(
        this.data.challengeId,
        key,
        canRepair ? 'repair' : 'checked',
      );
      if (!ret.ok) {
        wx.showToast({ title: ret.error || '打卡失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: canRepair ? '补打卡成功' : '打卡成功', icon: 'success' });
      this.loadDetail();
      this.updateSubscribeButtonStatus();
      if (!canRepair) {
        this.promptTomorrowReminder();
      }
    } catch (err) {
      wx.showToast({ title: '打卡失败', icon: 'none' });
    }
  },

  openRepairCheckinWithAd(key) {
    this.watchRepairCheckinAd()
      .then((completed) => {
        if (!completed) {
          wx.showToast({ title: '广告未完整观看', icon: 'none' });
          return;
        }
        this.submitCheckin(key, true);
      })
      .catch((err) => {
        if (err && err.message === 'UNSUPPORTED_REWARDED_AD') {
          wx.showToast({ title: '当前版本不支持激励广告', icon: 'none' });
          return;
        }
        wx.showToast({ title: '暂无广告资源，请稍后再试', icon: 'none' });
      });
  },

  promptTomorrowReminder() {
    const challengeId = this.data.challengeId;
    if (!challengeId) return;

    wx.showModal({
      title: '今日打卡完成',
      content: '要不要顺手开启提醒，明天也别忘了来打卡？',
      confirmText: '提醒明天打卡',
      cancelText: '稍后',
      success: (res) => {
        if (!res.confirm) return;
        const requested = savingChallengeSubscribe.triggerManual(challengeId);
        if (requested) {
          setTimeout(() => {
            this.updateSubscribeButtonStatus();
          }, 1000);
        }
      },
    });
  },

  async loadDetail() {
    const id = this.data.challengeId;
    if (!id) {
      wx.showToast({ title: '挑战不存在', icon: 'none' });
      return;
    }

    try {
      const res = await savingChallengeService.getChallengeDetail(id);
      if (!res.ok || !res.challenge) {
        wx.showToast({ title: res.error || '加载失败', icon: 'none' });
        return;
      }

      const challenge = res.challenge;
      const checkedDays = getCheckedDays(challenge.statusMap);
      challenge.checkedDays = checkedDays;
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1;
      const calendarCells = buildMonthCalendar(
        year,
        month,
        challenge.statusMap || {},
        challenge.startDate,
        challenge.endDate,
      );

      this.setData({
        challenge,
        monthLabel: `${year}年${month}月`,
        calendarCells,
      });
    } catch (err) {
      wx.showToast({ title: '挑战详情加载失败', icon: 'none' });
    }
  },

  async onDayTap(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const cells = this.data.calendarCells || [];
    const index = cells.findIndex((cell) => cell.key === key);
    if (index < 0) return;
    const cell = cells[index];
    if (cell.empty) return;

    const challenge = this.data.challenge || {};
    const todayKey = formatDate(new Date());
    const canCheckinToday = cell.status === 'pending' && key === todayKey;
    const canRepair = cell.status === 'pending' && key < todayKey;
    if (!challenge.startDate || !challenge.endDate) return;
    if (key < challenge.startDate || key > challenge.endDate) return;

    if (cell.status === 'pending' && key > todayKey) {
      wx.showToast({
        title: '这一天还没到呢，暂时不能提前打卡哦',
        icon: 'none',
      });
      return;
    }

    if (!canCheckinToday && !canRepair) return;

    const actionTitle = canRepair ? '补打卡' : '今日待打卡';
    wx.showModal({
      title: actionTitle,
      content: '灵魂拷问：你真的做到了吗？',
      confirmText: '做到了',
      cancelText: '没做到',
      success: async (res) => {
        if (!res.confirm) return;
        if (canRepair) {
          this.openRepairCheckinWithAd(key);
          return;
        }
        this.submitCheckin(key, false);
      },
    });
  },

  onDeleteChallengeTap() {
    const challengeId = this.data.challengeId;
    if (!challengeId) return;

    wx.showModal({
      title: '删除挑战',
      content: '删除后不可恢复，确认删除这个挑战吗？',
      confirmColor: '#D65A5A',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        try {
          const ret = await savingChallengeService.deleteChallenge(challengeId);
          if (!ret.ok) {
            wx.showToast({ title: ret.error || '删除失败', icon: 'none' });
            return;
          }
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => {
            wx.navigateBack();
          }, 300);
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },
});
