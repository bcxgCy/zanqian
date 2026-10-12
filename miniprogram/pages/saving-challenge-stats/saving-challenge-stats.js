const savingChallengeService = require('../../utils/savingChallengeService');
const savingHomeService = require('../../utils/savingHomeService');

function toMoney(value) {
  const num = Number(value) || 0;
  return num.toFixed(2);
}

function toDateKey(ts) {
  const date = new Date(Number(ts) || Date.now());
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toMonthKey(ts) {
  return toDateKey(ts).slice(0, 7);
}

function formatMonthLabel(monthKey) {
  const [y, m] = String(monthKey || '').split('-');
  if (!y || !m) return monthKey;
  return `${m}月`;
}

function addDays(date, offset) {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return next;
}

Page({
  data: {
    summary: {
      totalSaved: '0.00',
      challengeSaved: '0.00',
      coolingSaved: '0.00',
      budgetSaved: '0.00',
      totalChallenges: 0,
      ongoingCount: 0,
      successCount: 0,
      failedCount: 0,
      avgPerChallenge: '0.00',
      bestStreak: 0,
    },
    topList: [],
    monthlyList: [],
    barData: [],
    lineData: [],
    ringData: [],
    ringTotal: 0,
    calendarCells: [],
    calendarMaxCount: 0,
    calendarStats: {
      activeDays: 0,
      totalCheckins: 0,
      avgPerActiveDay: '0.0',
    },
  },

  onShow() {
    this.loadStats();
  },

  async loadStats() {
    wx.showLoading({ title: '加载中' });
    try {
      const [challengeRes, homeRes] = await Promise.all([
        savingChallengeService.getChallenges(),
        savingHomeService.getHomeData().catch(() => null),
      ]);

      if (!challengeRes.ok) {
        wx.showToast({ title: challengeRes.error || '加载失败', icon: 'none' });
        return;
      }

      const ongoing = Array.isArray(challengeRes.ongoingList) ? challengeRes.ongoingList : [];
      const history = Array.isArray(challengeRes.historyList) ? challengeRes.historyList : [];
      const allList = ongoing.concat(history);

      const totalSavedNum = allList.reduce((sum, item) => sum + (Number(item.savedAmount) || 0), 0);
      const totalChallenges = allList.length;
      const successCount = history.filter((item) => item.status === 'success').length;
      const failedCount = history.filter((item) => item.status === 'failed').length;
      const bestStreak = allList.reduce((max, item) => Math.max(max, Number(item.streakDays) || 0), 0);

      const topList = allList
        .slice()
        .sort((a, b) => (Number(b.savedAmount) || 0) - (Number(a.savedAmount) || 0))
        .slice(0, 5)
        .map((item, index) => ({
          rank: index + 1,
          id: item.id,
          name: item.name,
          savedAmount: toMoney(item.savedAmount),
          dailyAmount: toMoney(item.dailyAmount),
          periodDays: Number(item.periodDays) || 0,
          statusText: item.resultText || (item.status === 'ongoing' ? '进行中' : '已结束'),
        }));

      const monthMap = {};
      const dayMap = {};
      allList.forEach((item) => {
        const ts = Number(item.updatedAt) || Number(item.createdAt) || 0;
        if (!ts) return;
        const key = toMonthKey(ts);
        if (!monthMap[key]) {
          monthMap[key] = { month: key, savedAmount: 0, count: 0 };
        }
        monthMap[key].savedAmount += Number(item.savedAmount) || 0;
        monthMap[key].count += 1;

        const dayKey = toDateKey(ts);
        if (!dayMap[dayKey]) {
          dayMap[dayKey] = { count: 0, savedAmount: 0 };
        }
        dayMap[dayKey].count += 1;
        dayMap[dayKey].savedAmount += Number(item.savedAmount) || 0;
      });

      const monthlyList = Object.keys(monthMap)
        .sort((a, b) => (a < b ? 1 : -1))
        .slice(0, 6)
        .map((key) => ({
          month: key,
          savedAmount: toMoney(monthMap[key].savedAmount),
          count: monthMap[key].count,
        }));

      const monthTrend = Object.keys(monthMap)
        .sort((a, b) => (a > b ? 1 : -1))
        .slice(-6)
        .map((key) => ({
          key,
          month: key,
          label: formatMonthLabel(key),
          savedAmount: Number(monthMap[key].savedAmount) || 0,
          count: monthMap[key].count || 0,
        }));

      const barData = monthTrend.map((item) => ({ label: item.label, value: item.savedAmount }));
      const lineData = monthTrend.map((item) => ({ label: item.label, value: item.count }));

      const remoteSummary = (homeRes && homeRes.ok && homeRes.summary) ? homeRes.summary : {};
      const challengeSavedNum = Number(remoteSummary.challengeSaved);
      const coolingSavedNum = Number(remoteSummary.coolingSaved);
      const budgetSavedNum = Number(remoteSummary.budgetSaved);
      const totalSavedByModule = Number(remoteSummary.totalSaved);

      const challengeSaved = Number.isFinite(challengeSavedNum) ? challengeSavedNum : totalSavedNum;
      const coolingSaved = Number.isFinite(coolingSavedNum) ? coolingSavedNum : 0;
      const budgetSaved = Number.isFinite(budgetSavedNum) ? budgetSavedNum : 0;
      const totalSaved = Number.isFinite(totalSavedByModule)
        ? totalSavedByModule
        : (challengeSaved + coolingSaved + budgetSaved);

      const ringData = [
        { name: '挑战', value: Number(toMoney(challengeSaved)), color: '#79D149' },
        { name: '冷静期', value: Number(toMoney(coolingSaved)), color: '#A8D84E' },
        { name: '预算挑战', value: Number(toMoney(budgetSaved)), color: '#F6D27A' },
      ].filter((item) => item.value > 0);

      const today = new Date();
      const calendarDays = 84;
      const calendarCells = [];
      for (let i = calendarDays - 1; i >= 0; i -= 1) {
        const date = addDays(today, -i);
        const dateKey = toDateKey(date.getTime());
        const daily = dayMap[dateKey] || { count: 0, savedAmount: 0 };
        calendarCells.push({
          dateKey,
          dayNum: String(date.getDate()),
          count: daily.count,
          savedAmount: toMoney(daily.savedAmount),
          monthShort: `${date.getMonth() + 1}/${date.getDate()}`,
        });
      }

      const calendarMaxCount = calendarCells.reduce((max, cell) => Math.max(max, cell.count), 0);
      const levelize = (count) => {
        if (!count) return 0;
        if (calendarMaxCount <= 1) return 4;
        const ratio = count / calendarMaxCount;
        if (ratio > 0.75) return 4;
        if (ratio > 0.5) return 3;
        if (ratio > 0.25) return 2;
        return 1;
      };
      const calendarWithLevel = calendarCells.map((cell) => ({
        ...cell,
        level: levelize(cell.count),
      }));

      const activeDays = calendarWithLevel.filter((cell) => cell.count > 0).length;
      const totalCheckins = calendarWithLevel.reduce((sum, cell) => sum + cell.count, 0);

      this.setData({
        summary: {
          totalSaved: toMoney(totalSaved),
          challengeSaved: toMoney(challengeSaved),
          coolingSaved: toMoney(coolingSaved),
          budgetSaved: toMoney(budgetSaved),
          totalChallenges,
          ongoingCount: ongoing.length,
          successCount,
          failedCount,
          avgPerChallenge: toMoney(totalChallenges ? totalSavedNum / totalChallenges : 0),
          bestStreak,
        },
        topList,
        monthlyList,
        barData,
        lineData,
        ringData,
        ringTotal: Number(toMoney(totalSaved)),
        calendarCells: calendarWithLevel,
        calendarMaxCount,
        calendarStats: {
          activeDays,
          totalCheckins,
          avgPerActiveDay: (activeDays ? (totalCheckins / activeDays) : 0).toFixed(1),
        },
      });
    } catch (err) {
      wx.showToast({ title: '统计加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/saving-challenge-detail/saving-challenge-detail?id=' + id });
  },

  onTapCalendarCell(e) {
    const { dateKey, count } = e.currentTarget.dataset;
    if (!dateKey) return;

    const parts = String(dateKey).split('-').map((item) => Number(item));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return;

    const [year, month, day] = parts;
    const date = new Date(year, month - 1, day);
    const weekText = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
    const currentYear = new Date().getFullYear();
    const dateText = year === currentYear
      ? `${month}月${day}日（${weekText}）`
      : `${year}年${month}月${day}日（${weekText}）`;

    wx.showToast({
      icon: 'none',
      title: `${dateText} 活跃${count || 0}次`,
    });
  },
});
