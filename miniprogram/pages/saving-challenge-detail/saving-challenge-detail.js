const savingChallengeService = require('../../utils/savingChallengeService');

const SHARE_POSTER = 'cloud://cloud1-d1g1g2urwd9ff5a66.636c-cloud1-d1g1g2urwd9ff5a66-1462912205/other/shengqian-share.jpg';

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
    cells.push({
      key: dateKey,
      empty: false,
      day,
      status,
      isToday: dateKey === todayKey,
      className: `status-${status}`,
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
    const checkedDays = Number(challenge.checkedDays) || 0;
    const savedAmount = Number(challenge.savedAmount) || 0;
    const title = `我已打卡${checkedDays}天，省下¥${savedAmount}，来一起加入省钱挑战！`;
    return {
      title,
      imageUrl: SHARE_POSTER,
      path: '/pages/saving-challenge-create/saving-challenge-create?from=invite',
    };
  },

  onShow() {
    this.loadDetail();
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

    const canCheckinToday = cell.status === 'pending' && cell.isToday;
    const canRepair = cell.status === 'pending' && !cell.isToday;
    const challenge = this.data.challenge || {};
    const todayKey = formatDate(new Date());
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
        } catch (err) {
          wx.showToast({ title: '打卡失败', icon: 'none' });
        }
      },
    });
  },
});
