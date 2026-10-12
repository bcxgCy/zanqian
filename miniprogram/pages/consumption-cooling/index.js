const coolingService = require('../../utils/coolingService');
const lightLedgerService = require('../../utils/lightLedgerService');

const EXTEND_HOURS_OPTIONS = [12, 24, 48, 72, 168];

function formatAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0.00';
  return amount.toFixed(2);
}

function hasMoreThanTwoDecimals(value) {
  const text = String(value || '').trim();
  if (!text || /e/i.test(text)) return false;
  const decimal = text.split('.')[1] || '';
  return decimal.length > 2;
}

function formatCountdown(remainMs) {
  if (!(remainMs > 0)) return '00:00:00';
  const totalSeconds = Math.floor(remainMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (num) => String(num).padStart(2, '0');
  return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
}

function decorateRecord(record) {
  const now = Date.now();
  const endTime = Number(record.endTime) || 0;
  const status = String(record.status || 'cooling');
  const isPending = status === 'pendingDecision';
  return {
    id: record.id,
    goodsName: record.goodsName || '',
    price: Number(record.price) || 0,
    priceText: formatAmount(record.price),
    remark: record.remark || '',
    status,
    statusText: record.statusText || (isPending ? '待决策' : '三思中'),
    endTime,
    extendCount: Number(record.extendCount) || 0,
    isPending,
    countdownText: status === 'cooling' ? formatCountdown(endTime - now) : '已到期',
  };
}

function sortRecords(list) {
  return (list || []).slice().sort((a, b) => {
    if (a.isPending !== b.isPending) return a.isPending ? -1 : 1;
    if (!a.isPending && !b.isPending) {
      return (a.endTime || 0) - (b.endTime || 0);
    }
    return (b.endTime || 0) - (a.endTime || 0);
  });
}

Page({
  data: {
    loading: true,
    records: [],
    stats: {
      successCount: 0,
      savedTotalText: '0.00',
      extendCountTotal: 0,
      activeCount: 0,
    },
    extendHoursOptions: EXTEND_HOURS_OPTIONS,
    showAddModal: false,
    addForm: { goodsName: '', price: '', remark: '' },
    showEditModal: false,
    editRecord: null,
    editForm: { goodsName: '', price: '', remark: '' },
    buyConfirmVisible: false,
    buyConfirmRecord: null,
    giveUpConfirmVisible: false,
    giveUpConfirmRecord: null,
    decisionVisible: false,
    decisionRecord: null,
    extendVisible: false,
    extendRecord: null,
    extendHours: 24,
    submitting: false,
  },

  onShow() {
    this.refreshData();
    this.startTimer();
  },

  onHide() {
    this.stopTimer();
  },

  onUnload() {
    this.stopTimer();
  },

  onPullDownRefresh() {
    this.refreshData().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  startTimer() {
    if (this.countdownTimer) return;
    this.countdownTimer = setInterval(() => this.tickCountdown(), 1000);
  },

  stopTimer() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  },

  tickCountdown() {
    const records = this.data.records || [];
    if (!records.length) return;
    const now = Date.now();
    let changed = false;
    let shouldSync = false;

    const nextRecords = records.map((item) => {
      if (item.status !== 'cooling') return item;
      const remain = item.endTime - now;
      if (remain <= 0) {
        shouldSync = true;
        if (item.countdownText !== '00:00:00') {
          changed = true;
          return Object.assign({}, item, { countdownText: '00:00:00' });
        }
        return item;
      }
      const countdownText = formatCountdown(remain);
      if (countdownText !== item.countdownText) {
        changed = true;
        return Object.assign({}, item, { countdownText });
      }
      return item;
    });

    if (changed) {
      this.setData({ records: sortRecords(nextRecords) });
    }

    if (shouldSync && !this.expireSyncing) {
      this.expireSyncing = true;
      this.refreshData({ silent: true }).finally(() => {
        this.expireSyncing = false;
      });
    }
  },

  async refreshData(options) {
    const silent = options && options.silent;
    if (!silent) this.setData({ loading: true });
    try {
      const res = await coolingService.getRecords();
      if (!res.ok) {
        wx.showToast({ title: res.error || '加载失败', icon: 'none' });
        return;
      }
      const data = res.data || {};
      const records = sortRecords((data.active || []).map(decorateRecord));
      const stats = data.stats || {};
      this.setData({
        loading: false,
        records,
        stats: {
          successCount: stats.successCount || 0,
          savedTotalText: formatAmount(stats.savedTotal || 0),
          extendCountTotal: stats.extendCountTotal || 0,
          activeCount: stats.activeCount || 0,
        },
      });
    } catch (err) {
      wx.showToast({ title: '冷静数据加载失败', icon: 'none' });
    } finally {
      if (!silent) this.setData({ loading: false });
    }
  },

  goHistory() {
    wx.navigateTo({ url: '/pages/consumption-cooling-history/index' });
  },

  openAddModal() {
    this.setData({
      showAddModal: true,
      addForm: { goodsName: '', price: '', remark: '' },
    });
  },

  closeAddModal() {
    this.setData({ showAddModal: false });
  },

  onGoodsNameInput(e) {
    this.setData({ 'addForm.goodsName': e.detail.value });
  },

  onPriceInput(e) {
    this.setData({ 'addForm.price': e.detail.value });
  },

  onRemarkInput(e) {
    this.setData({ 'addForm.remark': e.detail.value });
  },

  async submitAdd() {
    if (this.data.submitting) return;
    const goodsName = String(this.data.addForm.goodsName || '').trim();
    const price = Number(this.data.addForm.price);
    const remark = String(this.data.addForm.remark || '').trim();

    if (!goodsName) return wx.showToast({ title: '请填写物品名称', icon: 'none' });
    if (goodsName.length > 20) return wx.showToast({ title: '物品名称不能超过20字', icon: 'none' });
    if (!(price > 0)) return wx.showToast({ title: '请填写正确的预估价格', icon: 'none' });
    if (hasMoreThanTwoDecimals(this.data.addForm.price)) {
      return wx.showToast({ title: '金额最多保留两位小数', icon: 'none' });
    }

    this.setData({ submitting: true });
    try {
      const res = await coolingService.createRecord({ goodsName, price, remark });
      if (!res.ok) {
        wx.showToast({ title: res.error || '创建失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '已开始24小时冷静', icon: 'success' });
      this.setData({ showAddModal: false });
      this.refreshData({ silent: true });
    } catch (err) {
      wx.showToast({ title: '创建失败，请稍后重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  openEditModal(e) {
    const id = e.currentTarget.dataset.id;
    const record = this.data.records.find((item) => item.id === id);
    if (!record) return;
    this.setData({
      showEditModal: true,
      editRecord: record,
      editForm: {
        goodsName: record.goodsName || '',
        price: String(record.priceText || record.price || ''),
        remark: record.remark || '',
      },
    });
  },

  closeEditModal() {
    this.setData({ showEditModal: false, editRecord: null });
  },

  onEditGoodsNameInput(e) {
    this.setData({ 'editForm.goodsName': e.detail.value });
  },

  onEditPriceInput(e) {
    this.setData({ 'editForm.price': e.detail.value });
  },

  onEditRemarkInput(e) {
    this.setData({ 'editForm.remark': e.detail.value });
  },

  async submitEdit() {
    const record = this.data.editRecord;
    if (!record || this.data.submitting) return;

    const goodsName = String(this.data.editForm.goodsName || '').trim();
    const price = Number(this.data.editForm.price);
    const remark = String(this.data.editForm.remark || '').trim();

    if (!goodsName) return wx.showToast({ title: '请填写物品名称', icon: 'none' });
    if (goodsName.length > 20) return wx.showToast({ title: '物品名称不能超过20字', icon: 'none' });
    if (!(price > 0)) return wx.showToast({ title: '请填写正确的预估价格', icon: 'none' });
    if (hasMoreThanTwoDecimals(this.data.editForm.price)) {
      return wx.showToast({ title: '金额最多保留两位小数', icon: 'none' });
    }

    this.setData({ submitting: true });
    try {
      const res = await coolingService.updateRecord(record.id, { goodsName, price, remark });
      if (!res.ok) {
        wx.showToast({ title: res.error || '修改失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '修改成功', icon: 'success' });
      this.closeEditModal();
      this.refreshData({ silent: true });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onDeleteRecordTap(e) {
    const id = e.currentTarget.dataset.id;
    const record = this.data.records.find((item) => item.id === id);
    if (!record || this.data.submitting) return;

    wx.showModal({
      title: '删除记录',
      content: '删除后无法恢复，确认删除该冷静记录吗？',
      confirmColor: '#D65A5A',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ submitting: true });
        try {
          const ret = await coolingService.deleteRecord(record.id);
          if (!ret.ok) {
            wx.showToast({ title: ret.error || '删除失败', icon: 'none' });
            return;
          }
          wx.showToast({ title: '已删除', icon: 'success' });
          this.refreshData({ silent: true });
        } finally {
          this.setData({ submitting: false });
        }
      },
    });
  },

  openBuyConfirm(e) {
    const id = e.currentTarget.dataset.id;
    const record = this.data.records.find((item) => item.id === id);
    if (!record) return;
    this.setData({ buyConfirmVisible: true, buyConfirmRecord: record });
  },

  closeBuyConfirm() {
    this.setData({ buyConfirmVisible: false, buyConfirmRecord: null });
  },

  async doConfirmBuyFromCooling() {
    const record = this.data.buyConfirmRecord;
    if (!record) return;
    await this.doConfirmBuy(record.id);
    this.closeBuyConfirm();
  },

  async doResetCooling() {
    const record = this.data.buyConfirmRecord;
    if (!record || this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const res = await coolingService.resetCooling(record.id);
      if (!res.ok) {
        wx.showToast({ title: res.error || '操作失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '已重新开始24小时冷静', icon: 'none' });
      this.closeBuyConfirm();
      this.refreshData({ silent: true });
    } finally {
      this.setData({ submitting: false });
    }
  },

  openGiveUpConfirm(e) {
    const id = e.currentTarget.dataset.id;
    const record = this.data.records.find((item) => item.id === id);
    if (!record) return;
    this.setData({ giveUpConfirmVisible: true, giveUpConfirmRecord: record });
  },

  closeGiveUpConfirm() {
    this.setData({ giveUpConfirmVisible: false, giveUpConfirmRecord: null });
  },

  async doGiveUp() {
    const record = this.data.giveUpConfirmRecord;
    if (!record || this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const res = await coolingService.giveUp(record.id);
      if (!res.ok) {
        wx.showToast({ title: res.error || '操作失败', icon: 'none' });
        return;
      }
      wx.showToast({
        title: '太棒了！成功抵御一次冲动，省下' + record.priceText + '元',
        icon: 'none',
        duration: 2500,
      });
      this.closeGiveUpConfirm();
      this.refreshData({ silent: true });
    } finally {
      this.setData({ submitting: false });
    }
  },

  openDecision(e) {
    const id = e.currentTarget.dataset.id;
    const record = this.data.records.find((item) => item.id === id);
    if (!record) return;
    this.setData({ decisionVisible: true, decisionRecord: record });
  },

  closeDecision() {
    this.setData({ decisionVisible: false, decisionRecord: null });
  },

  async doConfirmBuyFromDecision() {
    const record = this.data.decisionRecord;
    if (!record) return;
    await this.doConfirmBuy(record.id);
    this.closeDecision();
  },

  async doConfirmBuy(recordId) {
    if (this.data.submitting) return;
    const source = (this.data.records || []).find((item) => item.id === recordId) || this.data.decisionRecord || this.data.buyConfirmRecord;
    this.setData({ submitting: true });
    try {
      const res = await coolingService.confirmBuy(recordId);
      if (!res.ok) {
        wx.showToast({ title: res.error || '操作失败', icon: 'none' });
        return;
      }

      if (source && source.goodsName && Number(source.price) > 0) {
        lightLedgerService.createBillFromCooling({
          goodsName: source.goodsName,
          price: Number(source.price),
          category: '购物',
        }).catch(() => {});
      }

      wx.showToast({ title: '已确认购买', icon: 'none' });
      this.refreshData({ silent: true });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async doGiveUpFromDecision() {
    const record = this.data.decisionRecord;
    if (!record) return;
    await this.doGiveUpById(record.id, record.priceText);
    this.closeDecision();
  },

  async doGiveUpById(recordId, priceText) {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const res = await coolingService.giveUp(recordId);
      if (!res.ok) {
        wx.showToast({ title: res.error || '操作失败', icon: 'none' });
        return;
      }
      wx.showToast({
        title: '太棒了！成功抵御一次冲动，省下' + priceText + '元',
        icon: 'none',
        duration: 2500,
      });
      this.refreshData({ silent: true });
    } finally {
      this.setData({ submitting: false });
    }
  },

  openExtend(e) {
    const id = e.currentTarget.dataset.id;
    const record = this.data.records.find((item) => item.id === id) || this.data.decisionRecord;
    if (!record) return;
    this.setData({
      extendVisible: true,
      extendRecord: record,
      extendHours: 24,
      decisionVisible: false,
      decisionRecord: null,
    });
  },

  closeExtend() {
    this.setData({ extendVisible: false, extendRecord: null });
  },

  selectExtendHours(e) {
    const hours = Number(e.currentTarget.dataset.hours);
    if (EXTEND_HOURS_OPTIONS.indexOf(hours) === -1) return;
    this.setData({ extendHours: hours });
  },

  async doExtend() {
    const record = this.data.extendRecord;
    const hours = this.data.extendHours;
    if (!record || this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const res = await coolingService.extendCooling(record.id, hours);
      if (!res.ok) {
        wx.showToast({ title: res.error || '操作失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '已延长' + hours + '小时冷静期', icon: 'none' });
      this.closeExtend();
      this.refreshData({ silent: true });
    } finally {
      this.setData({ submitting: false });
    }
  },

  noop() {},
});
