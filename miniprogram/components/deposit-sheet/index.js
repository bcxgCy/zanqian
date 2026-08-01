const money = require('../../utils/money');

Component({
  properties: {
    show: { type: Boolean, value: false },
    period: { type: Object, value: null },
  },
  data: {
    amount: '',
    date: '',
    note: '',
  },
  observers: {
    period(p) {
      if (p) {
        this.setData({
          amount: p.savedAmount ? String(p.savedAmount) : String(p.expectedAmount),
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
      const field = e.currentTarget.dataset.field;
      this.setData({ [field]: e.detail.value });
    },
    onDateChange(e) {
      this.setData({ date: e.detail.value });
    },
    onConfirm() {
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
