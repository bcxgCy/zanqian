const ledgerService = require('../../utils/lightLedgerService');

Page({
  data: {
    books: [],
    currentBookId: '',
    showEditor: false,
    editingId: '',
    form: {
      name: '',
      description: '',
    },
    submitting: false,
  },

  onShow() {
    this.loadBooks();
  },

  async loadBooks() {
    try {
      const res = await ledgerService.getBooks();
      if (!res.ok) {
        wx.showToast({ title: res.error || '加载失败', icon: 'none' });
        return;
      }
      this.setData({
        books: Array.isArray(res.books) ? res.books : [],
        currentBookId: res.currentBookId || '',
      });
    } catch (err) {
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' });
    }
  },

  openCreate() {
    this.setData({
      showEditor: true,
      editingId: '',
      form: { name: '', description: '' },
    });
  },

  openEdit(e) {
    const id = e.currentTarget.dataset.id;
    const target = (this.data.books || []).find((item) => item.id === id);
    if (!target) return;
    this.setData({
      showEditor: true,
      editingId: id,
      form: {
        name: target.name || '',
        description: target.description || '',
      },
    });
  },

  closeEditor() {
    if (this.data.submitting) return;
    this.setData({ showEditor: false, editingId: '' });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  async submitBook() {
    if (this.data.submitting) return;
    const name = String(this.data.form.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入账本名称', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const res = this.data.editingId
        ? await ledgerService.updateBook(this.data.editingId, this.data.form)
        : await ledgerService.createBook(this.data.form);
      if (!res.ok) {
        wx.showToast({ title: res.error || '保存失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.setData({ showEditor: false, editingId: '' });
      this.loadBooks();
    } catch (err) {
      wx.showToast({ title: '保存失败，请稍后重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async setCurrent(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || id === this.data.currentBookId) return;
    try {
      const res = await ledgerService.setCurrentBook(id);
      if (!res.ok) {
        wx.showToast({ title: res.error || '设置失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '已设为当前账本', icon: 'success' });
      this.loadBooks();
    } catch (err) {
      wx.showToast({ title: '设置失败，请稍后重试', icon: 'none' });
    }
  },

  removeBook(e) {
    const id = e.currentTarget.dataset.id;
    const target = (this.data.books || []).find((item) => item.id === id);
    if (!target || target.isDefault) return;
    wx.showModal({
      title: '删除账本',
      content: '删除账本会同时删除账本内所有账单，确认删除吗？',
      confirmColor: '#D65A5A',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const ret = await ledgerService.deleteBook(id);
          if (!ret.ok) {
            wx.showToast({ title: ret.error || '删除失败', icon: 'none' });
            return;
          }
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadBooks();
        } catch (err) {
          wx.showToast({ title: '删除失败，请稍后重试', icon: 'none' });
        }
      },
    });
  },

  noop() {},
});
