function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildMonthCalendar(year, month, statusMap) {
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
    const status = statusMap[dateKey] || 'pending';
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

const mockChallengeMap = {
  c1: {
    id: 'c1',
    name: '7天不喝奶茶',
    periodDays: 7,
    dailyAmount: 15,
    savedAmount: 45,
    statusMap: {
      '2026-09-01': 'checked',
      '2026-09-02': 'checked',
      '2026-09-03': 'missed',
      '2026-09-04': 'repair',
      '2026-09-05': 'checked',
      '2026-09-06': 'pending',
      '2026-09-07': 'pending',
    },
  },
  c2: {
    id: 'c2',
    name: '7天不打车',
    periodDays: 7,
    dailyAmount: 20,
    savedAmount: 40,
    statusMap: {
      '2026-09-01': 'checked',
      '2026-09-02': 'repair',
      '2026-09-03': 'checked',
      '2026-09-04': 'missed',
      '2026-09-05': 'checked',
      '2026-09-06': 'pending',
      '2026-09-07': 'pending',
    },
  },
};

Page({
  data: {
    challenge: null,
    weekTitles: ['一', '二', '三', '四', '五', '六', '日'],
    monthLabel: '',
    calendarCells: [],
  },

  onLoad(options) {
    const id = options.id;
    const challenge = mockChallengeMap[id] || mockChallengeMap.c1;

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;

    const calendarCells = buildMonthCalendar(year, month, challenge.statusMap || {});

    this.setData({
      challenge,
      monthLabel: `${year}年${month}月`,
      calendarCells,
    });
  },

  onDayTap(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const cells = this.data.calendarCells || [];
    const index = cells.findIndex((cell) => cell.key === key);
    if (index < 0) return;
    const cell = cells[index];
    if (cell.empty) return;

    const canCheckinToday = cell.status === 'pending' && cell.isToday;
    const canRepair = cell.status === 'missed';
    if (!canCheckinToday && !canRepair) return;

    const actionTitle = canRepair ? '补打卡' : '今日待打卡';
    wx.showModal({
      title: actionTitle,
      content: '灵魂拷问：你真的做到了吗？',
      confirmText: '做到了',
      cancelText: '没做到',
      success: (res) => {
        const nextCells = this.data.calendarCells.slice();
        const next = Object.assign({}, cell);

        if (res.confirm) {
          next.status = canRepair ? 'repair' : 'checked';
        } else {
          next.status = canRepair ? 'missed' : 'missed';
        }
        next.className = `status-${next.status}`;
        nextCells[index] = next;
        this.setData({ calendarCells: nextCells });
      },
    });
  },
});
