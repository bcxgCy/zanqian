const money = require('../../utils/money');

Component({
  properties: {
    show: { type: Boolean, value: false },
    period: { type: Object, value: null },
    readonly: { type: Boolean, value: false },
    secretAmount: { type: Boolean, value: false },
    amountLocked: { type: Boolean, value: false },
  },
  data: {
    amount: '',
    date: '',
    note: '',
  },
  observers: {
    'period, secretAmount, amountLocked': function (p, secretAmount, _amountLocked) {
      if (p) {
        const amount = p.completed && p.savedAmount !== undefined
          ? p.savedAmount
          : secretAmount
            ? ''
            : p.expectedAmount;
        this.setData({
          amount: String(amount),
          date: p.date || '',
          note: p.note || '',
        });
      }
    },
  },
  methods: {
    onClose() {
      this.triggerEvent('close');
    },
    onInput(e) {
      if (this.properties.readonly) return;
      const field = e.currentTarget.dataset.field;
      if (field === 'amount' && this.properties.amountLocked) return;
      this.setData({ [field]: e.detail.value });
    },
    onDateChange(e) {
      if (this.properties.readonly) return;
      this.setData({ date: e.detail.value });
    },
    onAmountLockedTap() {
      if (!this.properties.amountLocked) return;
      wx.showToast({
        title: '100天挑战金额按规则随机且不重复，无法修改',
        icon: 'none',
      });
    },
    onConfirm() {
      if (this.properties.readonly) return;
      const period = this.properties.period || {};
      const useSecretPresetAmount = !!(this.properties.secretAmount && !period.completed);
      const useLockedAmount = !!this.properties.amountLocked;
      const lockedAmount = period.completed && period.savedAmount !== undefined
        ? period.savedAmount
        : period.expectedAmount;
      const amount = (useSecretPresetAmount || useLockedAmount)
        ? money.toMoney(lockedAmount)
        : money.toMoney(this.data.amount);
      if (!money.isPositive(amount)) {
        wx.showToast({ title: useSecretPresetAmount ? '本期金额异常' : '请输入有效金额', icon: 'none' });
        return;
      }
      this.triggerEvent('confirm', {
        savedAmount: amount,
        date: this.data.date,
        note: this.data.note,
      });
    },
    noop() {},
  },
});
