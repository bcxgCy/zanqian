const coolingService = require('../../utils/coolingService');

function formatAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0.00';
  return amount.toFixed(2);
}

function formatDate(ts) {
  const date = new Date(Number(ts) || 0);
  if (!date.getTime()) return '';
  const pad = (num) => String(num).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function formatDuration(startTs, endTs) {
  const start = Number(startTs) || 0;
  const end = Number(endTs) || 0;
  if (!(start > 0) || !(end > start)) return '';
  const hours = Math.floor((end - start) / 3600000);
  if (hours < 24) return `${hours}小时`;
  const days = Math.floor(hours / 24);
  const remain = hours % 24;
  return remain ? `${days}天${remain}小时` : `${days}天`;
}

function getMonthKey(ts) {
  const date = new Date(Number(ts) || 0);
  if (!date.getTime()) return '未知月份';
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function formatMonthLabel(monthKey) {
  const [year, month] = String(monthKey || '').split('-');
  if (!year || !month) return monthKey || '未知月份';
  return `${year}年${Number(month)}月`;
}

Page({
  data: {
    loading: true,
    history: [],
    monthGroups: [],
    filterStatus: 'all',
    filteredCount: 0,
    filterTabs: [
      { key: 'all', label: '全部' },
      { key: 'Success', label: '已克制' },
      { key: 'Buy', label: '已购买' },
      { key: 'Cancel', label: '已放弃' },
    ],
    stats: {
      successCount: 0,
      savedTotalText: '0.00',
      extendCountTotal: 0,
    },
  },

  onShow() {
    this.loadHistory();
  },

  onPullDownRefresh() {
    this.loadHistory().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadHistory() {
    this.setData({ loading: true });
    try {
      const res = await coolingService.getRecords();
      if (!res.ok) {
        wx.showToast({ title: res.error || '加载失败', icon: 'none' });
        return;
      }
      const data = res.data || {};
      const history = (data.history || []).map((item) => ({
        id: item.id,
        goodsName: item.goodsName || '',
        priceText: formatAmount(item.price),
        remark: item.remark || '',
        status: item.status,
        statusText: item.statusText || '',
        extendCount: Number(item.extendCount) || 0,
        sortTime: Number(item.updateTime || item.createTime) || 0,
        monthKey: getMonthKey(item.updateTime || item.createTime),
        dateText: formatDate(item.updateTime || item.createTime),
        durationText: formatDuration(item.startTime || item.createTime, item.decisionTime || item.updateTime),
      }));
      const stats = data.stats || {};
      this.setData({
        loading: false,
        history,
        stats: {
          successCount: stats.successCount || 0,
          savedTotalText: formatAmount(stats.savedTotal || 0),
          extendCountTotal: stats.extendCountTotal || 0,
        },
      }, () => this.applyFilterAndGroup());
    } catch (err) {
      wx.showToast({ title: '历史记录加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onFilterChange(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.filterStatus) return;
    this.setData({ filterStatus: key }, () => this.applyFilterAndGroup());
  },

  applyFilterAndGroup() {
    const all = Array.isArray(this.data.history) ? this.data.history : [];
    const filterStatus = this.data.filterStatus;
    const filtered = filterStatus === 'all'
      ? all
      : all.filter((item) => item.status === filterStatus);

    const monthMap = {};
    filtered.forEach((item) => {
      const key = item.monthKey || '未知月份';
      if (!monthMap[key]) {
        monthMap[key] = {
          monthKey: key,
          monthLabel: formatMonthLabel(key),
          items: [],
        };
      }
      monthMap[key].items.push(item);
    });

    const monthGroups = Object.keys(monthMap)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((key) => {
        const group = monthMap[key];
        group.items.sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0));
        return group;
      });

    this.setData({
      monthGroups,
      filteredCount: filtered.length,
    });
  },

  onShareAppMessage() {
    const stats = this.data.stats || {};
    const successCount = Number(stats.successCount) || 0;
    const saved = Number(stats.savedTotalText) || 0;
    const title = successCount > 0
      ? `购前三思已累计克制${successCount}次，省下¥${saved.toFixed(2)}，这个小程序真好用！`
      : '我在用购前三思做消费复盘，这个小程序很好用！';
    return {
      title,
      path: '/pages/consumption-cooling-history/index',
      imageUrl: '',
    };
  },

  onShareTimeline() {
    const stats = this.data.stats || {};
    const saved = Number(stats.savedTotalText) || 0;
    return {
      title: saved > 0
        ? `购前三思累计省下¥${saved.toFixed(2)}，这款小程序超实用！`
        : '购前三思帮我养成理性消费，这个小程序很不错！',
      query: '',
      imageUrl: '',
    };
  },
});
