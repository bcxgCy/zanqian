const money = require('../../utils/money');

Component({
  properties: {
    show: { type: Boolean, value: false },
    period: { type: Object, value: null },
    readonly: { type: Boolean, value: false },
  },
  data: {
    amount: '',
    date: '',
    note: '',
  },
  observers: {
    period(p) {
      if (p) {
        const amount = p.completed && p.savedAmount !== undefined ? p.savedAmount : p.expectedAmount;
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
      this.setData({ [field]: e.detail.value });
    },
    onDateChange(e) {
      if (this.properties.readonly) return;
      this.setData({ date: e.detail.value });
    },
    onConfirm() {
      if (this.properties.readonly) return;
      const amount = money.toMoney(this.data.amount);
      if (!money.isPositive(amount)) {
        wx.showToast({ title: '请输入有效金额', icon: 'none' });
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
