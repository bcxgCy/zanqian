const TEMPLATE_GROUPS = [
  {
    title: '☕饮品零食类',
    list: [
      { name: '不喝奶茶咖啡', dailyAmount: 18 },
      { name: '不买零食小吃', dailyAmount: 15 },
      { name: '不买瓶装饮料', dailyAmount: 6 },
      { name: '不买甜品蛋糕', dailyAmount: 20 },
    ],
  },
  {
    title: '🍱餐饮外卖类',
    list: [
      { name: '不点外卖，自带餐食', dailyAmount: 30 },
      { name: '不外出聚餐', dailyAmount: 80 },
      { name: '不吃夜宵', dailyAmount: 25 },
    ],
  },
  {
    title: '🚗出行消费类',
    list: [
      { name: '不打车，公交 / 骑行通勤', dailyAmount: 22 },
      { name: '不产生付费停车费', dailyAmount: 16 },
    ],
  },
  {
    title: '🛍️网购剁手类',
    list: [
      { name: '不网购非必需品', dailyAmount: 50 },
      { name: '不看直播下单', dailyAmount: 40 },
      { name: '不买服饰鞋帽', dailyAmount: 60 },
    ],
  },
  {
    title: '🎮娱乐消遣类',
    list: [
      { name: '不做游戏 / 会员充值', dailyAmount: 25 },
      { name: '不去影院、付费娱乐场所', dailyAmount: 45 },
      { name: '不购买盲盒、潮玩手办', dailyAmount: 35 },
    ],
  },
  {
    title: '💄美妆生活类',
    list: [
      { name: '不买护肤品、彩妆', dailyAmount: 70 },
      { name: '不做美甲美睫', dailyAmount: 50 },
    ],
  },
  {
    title: '✅通用极简省钱类',
    list: [
      { name: '不购买任何非必要消费品', dailyAmount: 60 },
      { name: '杜绝临时冲动消费', dailyAmount: 35 },
    ],
  },
  {
    title: '🧩新增补充模板',
    list: [
      { name: '不买便利店速食', dailyAmount: 12 },
      { name: '不购买水果外卖', dailyAmount: 20 },
      { name: '不点上门外卖跑腿', dailyAmount: 15 },
      { name: '不洗高价干洗衣物', dailyAmount: 28 },
      { name: '不买文创小饰品', dailyAmount: 25 },
      { name: '不购买手机周边配件', dailyAmount: 30 },
      { name: '不主动买单请客', dailyAmount: 40 },
    ],
  },
];

Page({
  data: {
    form: {
      name: '',
      days: 7,
      dailyAmount: '',
      note: '',
      syncToPlaza: false,
    },
    dayOptions: [
      { label: '3天', value: 3 },
      { label: '5天', value: 5 },
      { label: '7天', value: 7 },
      { label: '30天', value: 30 },
      { label: '自定义', value: 'custom' },
    ],
    selectedDayOption: 7,
    customDays: '',
    quickTemplates: [
      { name: '不喝奶茶', dailyAmount: 18 },
      { name: '不喝咖啡', dailyAmount: 18 },
      { name: '坚持骑车通勤', dailyAmount: 22 },
    ],
    showTemplateSheet: false,
    templateKeyword: '',
    filteredTemplateGroups: TEMPLATE_GROUPS,
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onSyncChange(e) {
    this.setData({ 'form.syncToPlaza': !!e.detail.value });
  },

  onSelectDayOption(e) {
    const value = e.currentTarget.dataset.value;
    if (value === 'custom') {
      this.setData({ selectedDayOption: 'custom', 'form.days': '' });
      return;
    }
    this.setData({ selectedDayOption: Number(value), customDays: '', 'form.days': Number(value) });
  },

  onCustomDaysInput(e) {
    const input = String(e.detail.value || '').replace(/[^\d]/g, '');
    this.setData({ customDays: input, 'form.days': input ? Number(input) : '' });
  },

  pickQuickTemplate(e) {
    const name = e.currentTarget.dataset.name;
    const dailyAmount = Number(e.currentTarget.dataset.amount || 0);
    if (!name || !dailyAmount) return;
    this.setData({
      'form.name': name,
      'form.dailyAmount': String(dailyAmount),
    });
  },

  openTemplateSheet() {
    this.setData({
      showTemplateSheet: true,
      templateKeyword: '',
      filteredTemplateGroups: TEMPLATE_GROUPS,
    });
  },

  closeTemplateSheet() {
    this.setData({ showTemplateSheet: false });
  },

  onTemplateSearchInput(e) {
    const keyword = String(e.detail.value || '').trim();
    const lower = keyword.toLowerCase();
    const filtered = !lower
      ? TEMPLATE_GROUPS
      : TEMPLATE_GROUPS
        .map((group) => ({
          title: group.title,
          list: group.list.filter((item) => item.name.toLowerCase().includes(lower)),
        }))
        .filter((group) => group.list.length > 0);

    this.setData({
      templateKeyword: keyword,
      filteredTemplateGroups: filtered,
    });
  },

  pickTemplateFromSheet(e) {
    const name = e.currentTarget.dataset.name;
    const dailyAmount = Number(e.currentTarget.dataset.amount || 0);
    if (!name || !dailyAmount) return;
    this.setData({
      'form.name': name,
      'form.dailyAmount': String(dailyAmount),
      showTemplateSheet: false,
    });
  },

  submit() {
    const { name, days, dailyAmount } = this.data.form;
    if (!name.trim()) {
      wx.showToast({ title: '请输入挑战名称', icon: 'none' });
      return;
    }
    if (!days || Number(days) <= 0) {
      wx.showToast({ title: '请输入有效周期', icon: 'none' });
      return;
    }
    if (Number(days) > 365) {
      wx.showToast({ title: '自定义周期不能超过365天', icon: 'none' });
      return;
    }
    if (!dailyAmount || Number(dailyAmount) <= 0) {
      wx.showToast({ title: '请输入每日预估省钱', icon: 'none' });
      return;
    }
    wx.showToast({ title: '创建成功（前端演示）', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 500);
  },
});
