const ledgerService = require('../../utils/lightLedgerService');

function currentMonth() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

Page({
  data: {
    month: currentMonth(),
    selectedBookId: 'all',
    selectedBookName: '全部账本',
    books: [],
    bookOptions: [{ id: 'all', name: '全部账本' }],
    typeFilter: 'all',
    necessityFilter: 'all',
    amountRangeFilter: 'all',
    keyword: '',
    list: [],
    page: 1,
    pageSize: 20,
    hasMore: false,
    loading: false,
  },

  onLoad(options) {
    const month = options && options.month;
    const bookId = options && options.bookId;
    this.setData({
      month: month || currentMonth(),
      selectedBookId: bookId || 'all',
    });
  },

  onShow() {
    this.reload();
  },

  onPullDownRefresh() {
    this.reload().finally(() => wx.stopPullDownRefresh());
  },

  async reload() {
    this.setData({ page: 1, list: [] });
    await this.loadBills(true);
  },

  async loadBills(reset) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const res = await ledgerService.getAllBills({
        month: this.data.month,
        bookId: this.data.selectedBookId,
        type: this.data.typeFilter,
        necessity: this.data.necessityFilter,
        amountRange: this.data.amountRangeFilter,
        keyword: this.data.keyword,
        page: this.data.page,
        pageSize: this.data.pageSize,
      });
      if (!res.ok) {
        wx.showToast({ title: res.error || '加载失败', icon: 'none' });
        return;
      }

      const books = Array.isArray(res.books) ? res.books : [];
      const options = [{ id: 'all', name: '全部账本' }].concat(books.map((b) => ({ id: b.id, name: b.name })));
      const selectedBookId = res.selectedBookId || this.data.selectedBookId;
      const selectedBook = options.find((item) => item.id === selectedBookId);
      const append = Array.isArray(res.list) ? res.list : [];

      this.setData({
        month: res.month || this.data.month,
        selectedBookId,
        selectedBookName: (selectedBook && selectedBook.name) || '全部账本',
        books,
        bookOptions: options,
        list: reset ? append : this.data.list.concat(append),
        hasMore: !!res.hasMore,
      });
    } catch (err) {
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onBookChange(e) {
    const index = Number(e.detail.value);
    const option = this.data.bookOptions[index];
    if (!option) return;
    this.setData({ selectedBookId: option.id }, () => this.reload());
  },

  onMonthChange(e) {
    this.setData({ month: e.detail.value }, () => this.reload());
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearchTap() {
    this.reload();
  },

  onTypeTap(e) {
    const value = e.currentTarget.dataset.value;
    if (!value || value === this.data.typeFilter) return;
    const next = { typeFilter: value };
    if (value === 'income' && this.data.necessityFilter !== 'all') {
      next.necessityFilter = 'all';
    }
    this.setData(next, () => this.reload());
  },

  onNecessityTap(e) {
    const value = e.currentTarget.dataset.value;
    if (!value || value === this.data.necessityFilter) return;
    if (this.data.typeFilter === 'income' && value !== 'all') {
      wx.showToast({ title: '收入不区分必要性', icon: 'none' });
      return;
    }
    this.setData({ necessityFilter: value }, () => this.reload());
  },

  onAmountRangeTap(e) {
    const value = e.currentTarget.dataset.value;
    if (!value || value === this.data.amountRangeFilter) return;
    this.setData({ amountRangeFilter: value }, () => this.reload());
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loading) return;
    this.setData({ page: this.data.page + 1 }, () => this.loadBills(false));
  },
});
