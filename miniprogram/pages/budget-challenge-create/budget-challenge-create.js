const budgetChallengeService = require('../../utils/budgetChallengeService');

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(dateKey, offset) {
  const [y, m, d] = String(dateKey || '').split('-').map((item) => Number(item));
  if (!y || !m || !d) return formatDateKey(new Date());
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + offset);
  return formatDateKey(date);
}

function toMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function hasMoreThanTwoDecimals(value) {
  const text = String(value || '').trim();
  const decimal = text.split('.')[1] || '';
  return decimal.length > 2;
}

Page({
  data: {
    mode: 'create',
    challengeId: '',
    loading: false,
    submitting: false,
    form: {
      name: '',
      totalBudget: '',
      startDate: formatDateKey(new Date()),
      endDate: formatDateKey(new Date()),
      alertEnable: true,
    },
    quickPeriods: [
      { label: '今天', days: 0 },
      { label: '7天', days: 6 },
      { label: '14天', days: 13 },
      { label: '30天', days: 29 },
      { label: '90天', days: 89 },
    ],
  },

  onLoad(options) {
    const challengeId = (options && options.id) || '';
    if (!challengeId) {
      return;
    }

    this.setData({ mode: 'edit', challengeId });
    wx.setNavigationBarTitle({ title: '编辑预算' });
    this.loadDetailForEdit();
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onStartDateChange(e) {
    const startDate = e.detail.value;
    const endDate = this.data.form.endDate;
    this.setData({
      'form.startDate': startDate,
      'form.endDate': endDate < startDate ? startDate : endDate,
    });
  },

  onEndDateChange(e) {
    this.setData({ 'form.endDate': e.detail.value });
  },

  onAlertChange(e) {
    this.setData({ 'form.alertEnable': !!e.detail.value });
  },

  onPickPeriod(e) {
    const offset = Number(e.currentTarget.dataset.days);
    if (!Number.isFinite(offset)) return;
    const startDate = this.data.form.startDate;
    this.setData({
      'form.endDate': addDays(startDate, offset),
    });
  },

  validateForm() {
    const name = String(this.data.form.name || '').trim();
    const totalBudget = toMoney(this.data.form.totalBudget);
    const startDate = this.data.form.startDate;
    const endDate = this.data.form.endDate;

    if (!name) {
      wx.showToast({ title: '请输入预算名称', icon: 'none' });
      return null;
    }

    if (name.length > 20) {
      wx.showToast({ title: '预算名称最多20字', icon: 'none' });
      return null;
    }

    if (!totalBudget || totalBudget <= 0) {
      wx.showToast({ title: '请输入有效预算金额', icon: 'none' });
      return null;
    }

    if (hasMoreThanTwoDecimals(this.data.form.totalBudget)) {
      wx.showToast({ title: '金额最多保留两位小数', icon: 'none' });
      return null;
    }

    if (!startDate || !endDate) {
      wx.showToast({ title: '请选择预算起止日期', icon: 'none' });
      return null;
    }

    if (endDate < startDate) {
      wx.showToast({ title: '结束日期不能早于开始日期', icon: 'none' });
      return null;
    }

    return {
      name,
      totalBudget,
      startDate,
      endDate,
      alertEnable: !!this.data.form.alertEnable,
    };
  },

  async loadDetailForEdit() {
    if (!this.data.challengeId) return;
    this.setData({ loading: true });
    wx.showLoading({ title: '加载中', mask: true });

    try {
      const res = await budgetChallengeService.getBudgetChallengeDetail(this.data.challengeId);
      if (!res.ok || !res.challenge) {
        wx.showToast({ title: res.error || '加载失败', icon: 'none' });
        return;
      }

      const challenge = res.challenge;
      if (!(challenge.canEditBudget || challenge.status === 'running' || challenge.status === 'notStart')) {
        wx.showToast({ title: '当前状态不可编辑预算', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 400);
        return;
      }

      this.setData({
        form: {
          name: challenge.name || '',
          totalBudget: String(challenge.totalBudget || ''),
          startDate: challenge.startDate || formatDateKey(new Date()),
          endDate: challenge.endDate || formatDateKey(new Date()),
          alertEnable: challenge.alertEnable !== false,
        },
      });
    } catch (err) {
      wx.showToast({ title: '预算详情加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  },

  async submit() {
    if (this.data.submitting) return;

    const payload = this.validateForm();
    if (!payload) return;

    this.setData({ submitting: true });
    wx.showLoading({ title: this.data.mode === 'edit' ? '保存中' : '创建中', mask: true });

    try {
      const isEdit = this.data.mode === 'edit';
      const res = isEdit
        ? await budgetChallengeService.updateBudgetChallenge(this.data.challengeId, payload)
        : await budgetChallengeService.createBudgetChallenge(payload);

      if (!res.ok) {
        const errText = res.error || (isEdit ? '保存失败' : '创建失败');
        if (String(errText).includes('超出新预算周期')) {
          wx.showModal({
            title: '预算周期冲突',
            content: errText,
            showCancel: false,
            confirmText: '我知道了',
          });
        } else {
          wx.showToast({ title: errText, icon: 'none' });
        }
        return;
      }

      wx.showToast({ title: isEdit ? '保存成功' : '创建成功', icon: 'success' });

      if (!isEdit && res.challenge && res.challenge.id) {
        setTimeout(() => {
          wx.redirectTo({
            url: '/pages/budget-challenge-detail/budget-challenge-detail?id=' + res.challenge.id,
          });
        }, 320);
        return;
      }

      setTimeout(() => {
        wx.navigateBack();
      }, 320);
    } catch (err) {
      wx.showToast({ title: '操作失败，请稍后重试', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ submitting: false });
    }
  },
});
