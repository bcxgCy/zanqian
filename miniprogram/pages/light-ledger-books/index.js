const ledgerService = require('../../utils/lightLedgerService');
const CREATE_LEDGER_BOOK_AD_UNIT_ID = 'adunit-e04c4da980c8ce65';

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

    const isEdit = !!this.data.editingId;
    if (isEdit) {
      this.submitBookRequest(false);
      return;
    }

    this.submitBookRequest(false);
  },

  watchCreateBookAd() {
    return new Promise((resolve, reject) => {
      if (typeof wx.createRewardedVideoAd !== 'function') {
        reject(new Error('UNSUPPORTED_REWARDED_AD'));
        return;
      }

      const rewardedVideoAd = wx.createRewardedVideoAd({ adUnitId: CREATE_LEDGER_BOOK_AD_UNIT_ID });
      const onClose = (res) => {
        rewardedVideoAd.offClose(onClose);
        rewardedVideoAd.offError(onError);
        const completed = !!(res && (res.isEnded || res === undefined));
        resolve(completed);
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

  openCreateWithAd() {
    wx.showToast({ title: '先看一小段广告，马上给你开新账本～', icon: 'none' });
    this.watchCreateBookAd()
      .then((completed) => {
        if (!completed) {
          wx.showToast({ title: '广告未完整观看', icon: 'none' });
          return;
        }
        wx.showToast({ title: '感谢支持，新账本名额已解锁 📒', icon: 'none' });
        this.submitBookRequest(true);
      })
      .catch((err) => {
        if (err && err.message === 'UNSUPPORTED_REWARDED_AD') {
          wx.showToast({ title: '当前版本不支持激励广告', icon: 'none' });
          return;
        }
        wx.showToast({ title: '暂无广告资源，请稍后再试', icon: 'none' });
      });
  },

  async submitBookRequest(adUnlocked) {
    this.setData({ submitting: true });
    try {
      const isEdit = !!this.data.editingId;
      const payload = isEdit
        ? this.data.form
        : Object.assign({}, this.data.form, { adUnlocked: !!adUnlocked });
      const res = isEdit
        ? await ledgerService.updateBook(this.data.editingId, payload)
        : await ledgerService.createBook(payload);

      if (!res.ok) {
        if (!isEdit && res.needAd && !adUnlocked) {
          wx.showModal({
            title: '新增账本需观看广告',
            content: '每次新增账本前需先观看激励广告，是否现在去观看？',
            confirmText: '去观看',
            cancelText: '取消',
            success: (modalRes) => {
              if (!modalRes.confirm) return;
              this.openCreateWithAd();
            },
          });
          return;
        }
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

  onShareAppMessage() {
    const books = Array.isArray(this.data.books) ? this.data.books : [];
    const total = books.length;
    const title = total > 0
      ? `我在轻账本管理了${total}个账本，分账记账太方便，这个小程序真好用！`
      : '我在用轻账本管理账本，这个小程序特别好用，推荐你试试！';
    return {
      title,
      path: '/pages/light-ledger-books/index',
      imageUrl: '',
    };
  },

  onShareTimeline() {
    const books = Array.isArray(this.data.books) ? this.data.books.length : 0;
    return {
      title: `轻账本已创建${books}个账本，记账体验很棒，这个小程序好用！`,
      query: '',
      imageUrl: '',
    };
  },

  noop() {},
});
