const ledgerService = require('../../utils/lightLedgerService');

const EXPENSE_CATEGORIES = ['餐饮', '购物', '交通', '住房', '娱乐', '医疗', '学习', '其他'];
const INCOME_CATEGORIES = ['工资', '奖金', '理财', '副业', '退款', '其他'];

function currentMonth() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function amountText(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

const CATEGORY_ICON_MAP = {
  餐饮: '🍜',
  购物: '🛍',
  交通: '🚌',
  住房: '🏠',
  娱乐: '🎮',
  医疗: '💊',
  学习: '📚',
  工资: '💼',
  奖金: '🎁',
  理财: '📈',
  副业: '🧩',
  退款: '↩️',
  其他: '🧾',
};

function buildCategoryOptions(type) {
  const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return list.map((name) => ({
    name,
    icon: CATEGORY_ICON_MAP[name] || '🧾',
  }));
}

function hasMoreThanTwoDecimals(value) {
  const text = String(value || '').trim();
  if (!text || /e/i.test(text)) return false;
  const decimal = text.split('.')[1] || '';
  return decimal.length > 2;
}

Page({
  data: {
    loading: true,
    month: currentMonth(),
    selectedBookId: 'all',
    books: [],
    bookOptions: [{ id: 'all', name: '全部账本' }],
    selectedBookName: '全部账本',
    summary: {
      totalIncomeText: '0.00',
      totalExpenseText: '0.00',
      balanceText: '0.00',
      nonNecessaryExpenseText: '0.00',
    },
    categoryChart: [],
    billGroups: [],
    visibleBillGroups: [],
    showAllMonthBills: false,
    showBillSheet: false,
    editingBillId: '',
    billForm: {
      bookId: '',
      type: 'expense',
      amount: '',
      category: '餐饮',
      necessity: 'necessary',
      occurDate: '',
      remark: '',
    },
    detailVisible: false,
    detailBill: null,
    submitting: false,
    sheetBookIndex: 0,
    categoryOptions: buildCategoryOptions('expense'),
  },

  onShow() {
    this.loadHomeData();
  },

  onPullDownRefresh() {
    this.loadHomeData().finally(() => wx.stopPullDownRefresh());
  },

  async loadHomeData() {
    this.setData({ loading: true });
    try {
      const res = await ledgerService.getHomeData({
        month: this.data.month,
        bookId: this.data.selectedBookId,
      });
      if (!res.ok) {
        wx.showToast({ title: res.error || '加载失败', icon: 'none' });
        return;
      }

      const books = Array.isArray(res.books) ? res.books : [];
      const options = [{ id: 'all', name: '全部账本' }].concat(books.map((b) => ({ id: b.id, name: b.name })));
      const selectedBookId = res.selectedBookId || 'all';
      const selectedBook = options.find((item) => item.id === selectedBookId);

      this.setData({
        loading: false,
        month: res.month || this.data.month,
        selectedBookId,
        selectedBookName: (selectedBook && selectedBook.name) || '全部账本',
        books,
        bookOptions: options,
        summary: Object.assign({}, this.data.summary, res.summary || {}),
        categoryChart: Array.isArray(res.categoryChart) ? res.categoryChart : [],
        billGroups: Array.isArray(res.billGroups) ? res.billGroups : [],
        showAllMonthBills: false,
        categoryOptions: buildCategoryOptions(this.data.billForm.type || 'expense'),
      }, () => {
        this.applyBillPreview();
      });
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onBookChange(e) {
    const index = Number(e.detail.value);
    const option = this.data.bookOptions[index];
    if (!option) return;
    this.setData({ selectedBookId: option.id }, () => this.loadHomeData());
  },

  onMonthChange(e) {
    this.setData({ month: e.detail.value }, () => this.loadHomeData());
  },

  openAddBill() {
    const defaultBookId = this.data.selectedBookId !== 'all'
      ? this.data.selectedBookId
      : ((this.data.books[0] && this.data.books[0].id) || '');
    this.setData({
      showBillSheet: true,
      editingBillId: '',
      billForm: {
        bookId: defaultBookId,
        type: 'expense',
        amount: '',
        category: '餐饮',
        necessity: 'necessary',
        occurDate: (new Date()).toISOString().slice(0, 10),
        remark: '',
      },
      sheetBookIndex: this.findBookIndex(defaultBookId),
      categoryOptions: buildCategoryOptions('expense'),
    });
  },

  closeBillSheet() {
    if (this.data.submitting) return;
    this.setData({ showBillSheet: false, editingBillId: '' });
  },

  onBillTypeChange(e) {
    const type = e.currentTarget.dataset.type;
    if (!type || type === this.data.billForm.type) return;
    this.setData({
      'billForm.type': type,
      'billForm.category': type === 'income' ? '工资' : '餐饮',
      'billForm.necessity': 'necessary',
      categoryOptions: buildCategoryOptions(type),
    });
  },

  onBillInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [`billForm.${field}`]: e.detail.value });
  },

  onBookPickerInSheet(e) {
    const list = this.data.books || [];
    const index = Number(e.detail.value);
    const target = list[index];
    if (!target) return;
    this.setData({
      'billForm.bookId': target.id,
      sheetBookIndex: index,
    });
  },

  onCategoryTap(e) {
    const category = e.currentTarget.dataset.name || e.currentTarget.dataset.category;
    if (!category) return;
    this.setData({ 'billForm.category': category });
  },

  onNecessityChange(e) {
    const necessity = e.currentTarget.dataset.necessity;
    if (!necessity) return;
    this.setData({ 'billForm.necessity': necessity });
  },

  onBillDateChange(e) {
    this.setData({ 'billForm.occurDate': e.detail.value });
  },

  buildPayload() {
    const form = this.data.billForm;
    const type = form.type === 'income' ? 'income' : 'expense';
    const amount = Number(form.amount);
    const occurTime = new Date(`${form.occurDate} 12:00:00`).getTime();

    return {
      billId: this.data.editingBillId,
      bookId: form.bookId,
      type,
      amount,
      category: form.category,
      necessity: type === 'expense' ? form.necessity : 'necessary',
      remark: String(form.remark || '').trim(),
      occurTime,
    };
  },

  async submitBill() {
    if (this.data.submitting) return;
    const payload = this.buildPayload();
    if (!payload.bookId) {
      wx.showToast({ title: '请选择账本', icon: 'none' });
      return;
    }
    if (!(payload.amount > 0)) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }
    if (hasMoreThanTwoDecimals(this.data.billForm.amount)) {
      wx.showToast({ title: '金额最多保留两位小数', icon: 'none' });
      return;
    }
    if (payload.amount > 999999.99) {
      wx.showToast({ title: '金额不能超过999999.99', icon: 'none' });
      return;
    }
    if (!this.data.billForm.occurDate) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const res = await ledgerService.saveBill(payload);
      if (!res.ok) {
        wx.showToast({ title: res.error || '保存失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: this.data.editingBillId ? '已保存' : '已记账', icon: 'success' });
      this.setData({ showBillSheet: false, detailVisible: false, detailBill: null, editingBillId: '' });
      this.loadHomeData();
    } catch (err) {
      wx.showToast({ title: '保存失败，请稍后重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onBillTap(e) {
    const bill = e.currentTarget.dataset.bill;
    if (!bill) return;
    this.setData({ detailVisible: true, detailBill: bill });
  },

  closeDetail() {
    this.setData({ detailVisible: false, detailBill: null });
  },

  editDetailBill() {
    const bill = this.data.detailBill;
    if (!bill) return;
    const date = new Date(Number(bill.occurTime) || Date.now());
    const occurDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    this.setData({
      detailVisible: false,
      showBillSheet: true,
      editingBillId: bill.id,
      billForm: {
        bookId: bill.bookId,
        type: bill.type,
        amount: bill.amountText,
        category: bill.category,
        necessity: bill.necessity || 'necessary',
        occurDate,
        remark: bill.remark || '',
      },
      sheetBookIndex: this.findBookIndex(bill.bookId),
      categoryOptions: buildCategoryOptions(bill.type),
    });
  },

  applyBillPreview() {
    const groups = Array.isArray(this.data.billGroups) ? this.data.billGroups : [];
    if (this.data.showAllMonthBills || !groups.length) {
      this.setData({ visibleBillGroups: groups });
      return;
    }

    const first = groups[0] && groups[0].list && groups[0].list[0];
    const baseTs = Number(first && first.occurTime) || Date.now();
    const threshold = new Date(baseTs - 6 * 24 * 3600 * 1000);
    const key = `${threshold.getFullYear()}-${String(threshold.getMonth() + 1).padStart(2, '0')}-${String(threshold.getDate()).padStart(2, '0')}`;

    const visible = groups.filter((group) => String(group.dateKey || '') >= key);
    this.setData({ visibleBillGroups: visible });
  },

  toggleBillPreview() {
    this.setData({ showAllMonthBills: !this.data.showAllMonthBills }, () => this.applyBillPreview());
  },

  onDeleteBill() {
    const bill = this.data.detailBill;
    if (!bill) return;
    wx.showModal({
      title: '删除账单',
      content: '删除后不可恢复，确认删除吗？',
      confirmColor: '#D65A5A',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const ret = await ledgerService.deleteBill(bill.id);
          if (!ret.ok) {
            wx.showToast({ title: ret.error || '删除失败', icon: 'none' });
            return;
          }
          wx.showToast({ title: '已删除', icon: 'success' });
          this.setData({ detailVisible: false, detailBill: null });
          this.loadHomeData();
        } catch (err) {
          wx.showToast({ title: '删除失败，请稍后重试', icon: 'none' });
        }
      },
    });
  },

  goBooksPage() {
    wx.navigateTo({ url: '/pages/light-ledger-books/index' });
  },

  goAllBillsPage() {
    wx.navigateTo({
      url: `/pages/light-ledger-bills/index?bookId=${this.data.selectedBookId}&month=${this.data.month}`,
    });
  },

  findBookIndex(id) {
    const list = this.data.books || [];
    const idx = list.findIndex((item) => item.id === id);
    return idx >= 0 ? idx : 0;
  },

  noop() {},
});
