const reductionEngine = require('../../utils/fullReductionEngine');

const DRAFT_KEY = 'full_reduction_calc_draft_v1';
const SNAPSHOT_KEY = 'full_reduction_calc_snapshot_v1';

const TEMPLATE_OPTIONS = [
  { key: 'tmall', label: '天猫模板' },
  { key: 'taobao', label: '淘宝模板' },
  { key: 'jd', label: '京东模板' },
  { key: 'douyin', label: '抖音模板' },
];

const COUPON_TYPE_OPTIONS = [
  { key: 'shop', label: '店铺券' },
  { key: 'category', label: '品类券' },
  { key: 'platform', label: '平台券' },
  { key: 'cross', label: '跨店满减' },
  { key: 'member', label: '会员折扣' },
  { key: 'redPacket', label: '红包' },
  { key: 'tradeIn', label: '以旧换新' },
  { key: 'national', label: '国补' },
];

function buildId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function toInputString(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function nowText() {
  const d = new Date();
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}`;
}

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function createGoodsItem(seed = {}) {
  return {
    id: seed.id || buildId('goods'),
    name: toInputString(seed.name, ''),
    shop: toInputString(seed.shop, ''),
    category: toInputString(seed.category, ''),
    price: toInputString(seed.price, ''),
    qty: toInputString(seed.qty, '1'),
    shipping: toInputString(seed.shipping, '0'),
    joinCross: seed.joinCross !== false,
    joinCategory: seed.joinCategory !== false,
    usePresale: !!seed.usePresale,
    deposit: toInputString(seed.deposit, '0'),
    inflateTo: toInputString(seed.inflateTo, '0'),
  };
}

function createCouponItem(seed = {}) {
  return {
    id: seed.id || buildId('coupon'),
    name: toInputString(seed.name, ''),
    type: seed.type || 'platform',
    enabled: seed.enabled !== false,
    threshold: toInputString(seed.threshold, '0'),
    discount: toInputString(seed.discount, '0'),
    everyFull: toInputString(seed.everyFull, '0'),
    everyMinus: toInputString(seed.everyMinus, '0'),
    rate: toInputString(seed.rate, '1'),
    shop: toInputString(seed.shop, ''),
    category: toInputString(seed.category, ''),
    mutexGroup: toInputString(seed.mutexGroup, ''),
    limit: toInputString(seed.limit, '0'),
  };
}

function getTemplateCouponSeeds(templateKey) {
  if (templateKey === 'jd') {
    return [
      { type: 'cross', name: '跨店每满300减50', everyFull: 300, everyMinus: 50, enabled: true },
      { type: 'platform', name: '平台券 满1000减80', threshold: 1000, discount: 80, enabled: true, mutexGroup: 'platform_a' },
      { type: 'shop', name: '店铺券 满200减20', threshold: 200, discount: 20, shop: '家电旗舰店', enabled: false },
      { type: 'member', name: 'PLUS 95折', rate: 0.95, enabled: false },
      { type: 'redPacket', name: '红包抵扣', discount: 20, enabled: false },
    ];
  }

  if (templateKey === 'douyin') {
    return [
      { type: 'platform', name: '平台券 满500减40', threshold: 500, discount: 40, enabled: true },
      { type: 'shop', name: '店铺券 满199减20', threshold: 199, discount: 20, shop: '抖音小店A', enabled: false },
      { type: 'member', name: '会员95折', rate: 0.95, enabled: false },
      { type: 'redPacket', name: '红包抵扣', discount: 15, enabled: false },
    ];
  }

  if (templateKey === 'taobao') {
    return [
      { type: 'cross', name: '跨店每满300减50', everyFull: 300, everyMinus: 50, enabled: true },
      { type: 'platform', name: '平台券 满800减60', threshold: 800, discount: 60, enabled: true },
      { type: 'shop', name: '店铺券 满200减20', threshold: 200, discount: 20, shop: '服饰旗舰店', enabled: false },
      { type: 'member', name: '会员97折', rate: 0.97, enabled: false },
      { type: 'redPacket', name: '红包抵扣', discount: 10, enabled: false },
    ];
  }

  return [
    { type: 'cross', name: '跨店每满300减50', everyFull: 300, everyMinus: 50, enabled: true },
    { type: 'platform', name: '平台券 满1200减100', threshold: 1200, discount: 100, enabled: true, mutexGroup: 'platform_main' },
    { type: 'category', name: '品类券 满1000减100(服饰)', threshold: 1000, discount: 100, category: '服饰', enabled: false, mutexGroup: 'category_a' },
    { type: 'shop', name: '店铺券 满200减20', threshold: 200, discount: 20, shop: '服饰旗舰店', enabled: false },
    { type: 'member', name: '88VIP 95折', rate: 0.95, enabled: false },
    { type: 'redPacket', name: '红包抵扣', discount: 20, enabled: false },
    { type: 'tradeIn', name: '以旧换新补贴', discount: 100, enabled: false },
    { type: 'national', name: '国补抵扣', discount: 100, enabled: false },
  ];
}

function createDefaultGoods() {
  return [
    createGoodsItem({
      name: '羽绒服',
      shop: '服饰旗舰店',
      category: '服饰',
      price: 599,
      qty: 1,
      shipping: 0,
      joinCross: true,
      joinCategory: true,
    }),
    createGoodsItem({
      name: '运动鞋',
      shop: '运动旗舰店',
      category: '服饰',
      price: 399,
      qty: 1,
      shipping: 0,
      joinCross: true,
      joinCategory: true,
    }),
  ];
}

function createTemplateCoupons(templateKey) {
  return getTemplateCouponSeeds(templateKey).map((item) => createCouponItem(item));
}

function toSafeArray(list, mapFn) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => mapFn(item));
}

Page({
  data: {
    templateOptions: TEMPLATE_OPTIONS,
    templateIndex: 0,
    couponTypeOptions: COUPON_TYPE_OPTIONS,
    goods: [],
    coupons: [],
    budget: '',
    result: null,
    logOpenMap: {},
    snapshotName: '',
    snapshots: [],
    selectedSnapshotIds: [],
    compareSummary: null,
    showReturnPopup: false,
    returnSchemeKey: '',
    returnSchemeName: '',
    returnRows: [],
    returnResult: null,
  },

  onLoad() {
    this.restoreFromStorage();
  },

  noop() {},

  markSnapshotsSelected(snapshots, ids) {
    const idSet = new Set(Array.isArray(ids) ? ids : []);
    return (snapshots || []).map((item) => Object.assign({}, item, {
      checked: idSet.has(item.id),
    }));
  },

  restoreFromStorage() {
    const draft = wx.getStorageSync(DRAFT_KEY) || {};
    const templateKey = draft.templateKey || TEMPLATE_OPTIONS[0].key;
    const templateIndex = Math.max(0, TEMPLATE_OPTIONS.findIndex((item) => item.key === templateKey));

    const goods = Array.isArray(draft.goods) && draft.goods.length
      ? toSafeArray(draft.goods, (item) => createGoodsItem(item))
      : createDefaultGoods();

    const coupons = Array.isArray(draft.coupons) && draft.coupons.length
      ? toSafeArray(draft.coupons, (item) => createCouponItem(item))
      : createTemplateCoupons(templateKey);

    const snapshots = this.normalizeSnapshots(wx.getStorageSync(SNAPSHOT_KEY));

    this.setData({
      templateIndex,
      goods,
      coupons,
      budget: toInputString(draft.budget, ''),
      snapshots: this.markSnapshotsSelected(snapshots, []),
      selectedSnapshotIds: [],
      compareSummary: null,
    });
  },

  normalizeSnapshots(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => ({
        id: item.id || buildId('snap'),
        name: item.name || '未命名方案',
        createdAt: item.createdAt || nowText(),
        goodsCount: Number(item.goodsCount || 0),
        couponCount: Number(item.couponCount || 0),
        bestSchemeName: item.bestSchemeName || '',
        bestFinalPayText: item.bestFinalPayText || '0.00',
        bestFinalPayCents: Number(item.bestFinalPayCents || 0),
        mergePayText: item.mergePayText || '0.00',
        splitPayText: item.splitPayText || '0.00',
        checked: false,
      }))
      .slice(0, 30);
  },

  persistDraft() {
    const template = this.data.templateOptions[this.data.templateIndex] || this.data.templateOptions[0];
    wx.setStorageSync(DRAFT_KEY, {
      templateKey: template.key,
      goods: this.data.goods,
      coupons: this.data.coupons,
      budget: this.data.budget,
    });
  },

  persistSnapshots(nextSnapshots) {
    wx.setStorageSync(SNAPSHOT_KEY, nextSnapshots);
  },

  findGoodsIndex(id) {
    return this.data.goods.findIndex((item) => item.id === id);
  },

  findCouponIndex(id) {
    return this.data.coupons.findIndex((item) => item.id === id);
  },

  getSchemeByKey(key) {
    const result = this.data.result;
    if (!result || !Array.isArray(result.schemes)) return null;
    return result.schemes.find((item) => item.key === key) || null;
  },

  onTemplateChange(e) {
    const nextIndex = Number(e.detail.value) || 0;
    const nextTemplate = this.data.templateOptions[nextIndex] || this.data.templateOptions[0];
    wx.showModal({
      title: '切换平台模板',
      content: '是否保留当前商品清单，仅替换优惠规则模板？',
      confirmText: '保留商品',
      cancelText: '重置全部',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            templateIndex: nextIndex,
            coupons: createTemplateCoupons(nextTemplate.key),
            result: null,
          }, () => this.persistDraft());
          return;
        }
        this.setData({
          templateIndex: nextIndex,
          goods: createDefaultGoods(),
          coupons: createTemplateCoupons(nextTemplate.key),
          result: null,
        }, () => this.persistDraft());
      },
    });
  },

  addGoods() {
    const goods = this.data.goods.concat(createGoodsItem());
    this.setData({ goods }, () => this.persistDraft());
  },

  removeGoods(e) {
    const id = e.currentTarget.dataset.id;
    const goods = this.data.goods.filter((item) => item.id !== id);
    this.setData({ goods }, () => this.persistDraft());
  },

  onGoodsInput(e) {
    const { id, field } = e.currentTarget.dataset;
    const index = this.findGoodsIndex(id);
    if (index < 0) return;
    this.setData({ [`goods[${index}].${field}`]: e.detail.value }, () => this.persistDraft());
  },

  onGoodsSwitch(e) {
    const { id, field } = e.currentTarget.dataset;
    const index = this.findGoodsIndex(id);
    if (index < 0) return;
    this.setData({ [`goods[${index}].${field}`]: !!e.detail.value }, () => this.persistDraft());
  },

  addCoupon() {
    const coupons = this.data.coupons.concat(createCouponItem({ type: 'platform', enabled: true }));
    this.setData({ coupons }, () => this.persistDraft());
  },

  removeCoupon(e) {
    const id = e.currentTarget.dataset.id;
    const coupons = this.data.coupons.filter((item) => item.id !== id);
    this.setData({ coupons }, () => this.persistDraft());
  },

  onCouponInput(e) {
    const { id, field } = e.currentTarget.dataset;
    const index = this.findCouponIndex(id);
    if (index < 0) return;
    this.setData({ [`coupons[${index}].${field}`]: e.detail.value }, () => this.persistDraft());
  },

  onCouponTypeTap(e) {
    const { id, type } = e.currentTarget.dataset;
    const index = this.findCouponIndex(id);
    if (index < 0 || !type) return;
    this.setData({
      [`coupons[${index}].type`]: type,
      [`coupons[${index}].threshold`]: '0',
      [`coupons[${index}].discount`]: '0',
      [`coupons[${index}].everyFull`]: '0',
      [`coupons[${index}].everyMinus`]: '0',
      [`coupons[${index}].rate`]: '1',
      [`coupons[${index}].shop`]: '',
      [`coupons[${index}].category`]: '',
      [`coupons[${index}].limit`]: '0',
    }, () => this.persistDraft());
  },

  onCouponEnabledChange(e) {
    const id = e.currentTarget.dataset.id;
    const index = this.findCouponIndex(id);
    if (index < 0) return;

    const checked = !!e.detail.value;
    const current = this.data.coupons[index];

    if (checked && current.mutexGroup) {
      const conflict = this.data.coupons.find((coupon) => (
        coupon.id !== current.id
        && coupon.enabled
        && coupon.mutexGroup
        && coupon.mutexGroup === current.mutexGroup
      ));
      if (conflict) {
        wx.showToast({ title: `与${conflict.name || '其他优惠'}互斥`, icon: 'none' });
        this.setData({ [`coupons[${index}].enabled`]: false }, () => this.persistDraft());
        return;
      }
    }

    this.setData({ [`coupons[${index}].enabled`]: checked }, () => this.persistDraft());
  },

  onBudgetInput(e) {
    this.setData({ budget: e.detail.value }, () => this.persistDraft());
  },

  calculate() {
    const result = reductionEngine.calculateAll(this.data.goods, this.data.coupons, {
      budget: this.data.budget,
    });

    if (!result.ok) {
      wx.showToast({ title: result.error || '计算失败', icon: 'none' });
      return;
    }

    this.setData({
      result,
      logOpenMap: { merge: false, split: false },
      showReturnPopup: false,
      returnSchemeKey: '',
      returnSchemeName: '',
      returnRows: [],
      returnResult: null,
    });

    if (Array.isArray(result.warnings) && result.warnings.length) {
      wx.showToast({ title: result.warnings[0], icon: 'none' });
    } else {
      wx.showToast({ title: '精算完成', icon: 'success' });
    }

    this.persistDraft();
  },

  toggleLogs(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const current = !!this.data.logOpenMap[key];
    this.setData({ [`logOpenMap.${key}`]: !current });
  },

  openReturnSimulation(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;

    const scheme = this.getSchemeByKey(key);
    if (!scheme || !Array.isArray(scheme.itemRows) || !scheme.itemRows.length) {
      wx.showToast({ title: '当前方案暂无可模拟商品', icon: 'none' });
      return;
    }

    const rows = scheme.itemRows.map((row) => {
      const qty = Math.max(1, Math.floor(safeNumber(row.qty, 1)));
      const unitFinalCents = Math.max(0, Math.round(safeNumber(row.finalPayCents, 0) / qty));
      const unitOriginalCents = Math.max(0, Math.round(safeNumber(row.originalPayCents, 0) / qty));
      return {
        id: row.id,
        name: row.name,
        qty,
        returnQty: 0,
        unitFinalCents,
        unitFinalText: reductionEngine.centsText(unitFinalCents),
        unitOriginalCents,
      };
    });

    this.setData({
      showReturnPopup: true,
      returnSchemeKey: key,
      returnSchemeName: scheme.name,
      returnRows: rows,
      returnResult: null,
    });
  },

  closeReturnSimulation() {
    this.setData({
      showReturnPopup: false,
      returnSchemeKey: '',
      returnSchemeName: '',
      returnRows: [],
      returnResult: null,
    });
  },

  adjustReturnQty(e) {
    const id = e.currentTarget.dataset.id;
    const delta = Number(e.currentTarget.dataset.delta || 0);
    const index = (this.data.returnRows || []).findIndex((item) => item.id === id);
    if (index < 0 || !delta) return;

    const row = this.data.returnRows[index];
    const nextQty = Math.max(0, Math.min(row.qty, row.returnQty + delta));

    this.setData({
      [`returnRows[${index}].returnQty`]: nextQty,
      returnResult: null,
    });
  },

  onReturnQtyInput(e) {
    const id = e.currentTarget.dataset.id;
    const index = (this.data.returnRows || []).findIndex((item) => item.id === id);
    if (index < 0) return;

    const row = this.data.returnRows[index];
    const raw = String(e.detail.value || '').replace(/[^\d]/g, '');
    const nextQty = Math.max(0, Math.min(row.qty, Number(raw || 0)));

    this.setData({
      [`returnRows[${index}].returnQty`]: nextQty,
      returnResult: null,
    });
  },

  calculateReturnSimulation() {
    const scheme = this.getSchemeByKey(this.data.returnSchemeKey);
    if (!scheme) {
      wx.showToast({ title: '方案信息已失效，请重新计算', icon: 'none' });
      return;
    }

    const rows = this.data.returnRows || [];
    const hasReturn = rows.some((item) => item.returnQty > 0);
    if (!hasReturn) {
      wx.showToast({ title: '请先选择要退货的商品数量', icon: 'none' });
      return;
    }

    const originalPayCents = Math.max(0, safeNumber(scheme.summary && scheme.summary.finalPayCents, 0));

    let refundCents = 0;
    let remainDirectBuyCents = 0;
    rows.forEach((row) => {
      const returnQty = Math.max(0, Math.min(row.qty, row.returnQty));
      const keepQty = Math.max(0, row.qty - returnQty);
      refundCents += row.unitFinalCents * returnQty;
      remainDirectBuyCents += row.unitOriginalCents * keepQty;
    });

    const remainCostCents = Math.max(0, originalPayCents - refundCents);
    const diffCents = remainCostCents - remainDirectBuyCents;
    const isWorth = diffCents <= 0;

    this.setData({
      returnResult: {
        originalPayText: reductionEngine.centsText(originalPayCents),
        refundText: reductionEngine.centsText(refundCents),
        remainCostText: reductionEngine.centsText(remainCostCents),
        directBuyText: reductionEngine.centsText(remainDirectBuyCents),
        diffText: reductionEngine.centsText(Math.abs(diffCents)),
        conclusion: isWorth ? '✅ 划算：退货后剩余成本不高于直接单独购买' : '⚠️ 不推荐：退货后反而更贵',
        isWorth,
      },
    });
  },

  onSnapshotNameInput(e) {
    this.setData({ snapshotName: e.detail.value });
  },

  saveSnapshot() {
    const result = this.data.result;
    if (!result || !result.ok || !Array.isArray(result.schemes)) {
      wx.showToast({ title: '请先完成精算', icon: 'none' });
      return;
    }

    const bestScheme = result.schemes.find((item) => item.recommended) || result.schemes[0];
    const mergeScheme = result.schemes.find((item) => item.key === 'merge');
    const splitScheme = result.schemes.find((item) => item.key === 'split');

    const snapshot = {
      id: buildId('snap'),
      name: (this.data.snapshotName || '').trim() || `方案快照 ${nowText()}`,
      createdAt: nowText(),
      goodsCount: this.data.goods.length,
      couponCount: this.data.coupons.length,
      bestSchemeName: bestScheme ? bestScheme.name : '-',
      bestFinalPayText: bestScheme ? bestScheme.summary.finalPayText : '0.00',
      bestFinalPayCents: bestScheme ? bestScheme.summary.finalPayCents : 0,
      mergePayText: mergeScheme ? mergeScheme.summary.finalPayText : '0.00',
      splitPayText: splitScheme ? splitScheme.summary.finalPayText : '0.00',
    };

    const snapshots = [snapshot].concat(this.data.snapshots || []).slice(0, 30);
    this.persistSnapshots(snapshots);

    this.setData({
      snapshots: this.markSnapshotsSelected(snapshots, this.data.selectedSnapshotIds || []),
      snapshotName: '',
    }, () => {
      this.refreshCompareSummary();
      wx.showToast({ title: '已保存方案', icon: 'success' });
    });
  },

  deleteSnapshot(e) {
    const id = e.currentTarget.dataset.id;
    const snapshots = (this.data.snapshots || []).filter((item) => item.id !== id);
    const selectedSnapshotIds = (this.data.selectedSnapshotIds || []).filter((item) => item !== id);
    this.persistSnapshots(snapshots);
    this.setData({
      snapshots: this.markSnapshotsSelected(snapshots, selectedSnapshotIds),
      selectedSnapshotIds,
    }, () => this.refreshCompareSummary());
  },

  onSnapshotSelectChange(e) {
    const ids = Array.isArray(e.detail.value) ? e.detail.value : [];
    this.setData({
      selectedSnapshotIds: ids,
      snapshots: this.markSnapshotsSelected(this.data.snapshots || [], ids),
    }, () => this.refreshCompareSummary());
  },

  refreshCompareSummary() {
    const ids = this.data.selectedSnapshotIds || [];
    if (ids.length < 2) {
      this.setData({ compareSummary: null });
      return;
    }

    const selected = (this.data.snapshots || []).filter((item) => ids.includes(item.id));
    if (selected.length < 2) {
      this.setData({ compareSummary: null });
      return;
    }

    const sorted = selected.slice().sort((a, b) => a.bestFinalPayCents - b.bestFinalPayCents);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    this.setData({
      compareSummary: {
        selectedCount: selected.length,
        bestName: best.name,
        bestPayText: best.bestFinalPayText,
        worstName: worst.name,
        worstPayText: worst.bestFinalPayText,
        diffText: reductionEngine.centsText(worst.bestFinalPayCents - best.bestFinalPayCents),
      },
    });
  },

  buildExportText() {
    const result = this.data.result;
    if (!result || !result.ok || !Array.isArray(result.schemes)) return '';

    const lines = [];
    lines.push('【满减计算器导出明细】');
    lines.push(`导出时间：${nowText()}`);
    lines.push(`商品数：${(this.data.goods || []).length}，优惠数：${(this.data.coupons || []).length}`);
    lines.push('');

    result.schemes.forEach((scheme) => {
      lines.push(`${scheme.name}${scheme.recommended ? '（推荐最优）' : ''}`);
      lines.push(`- 最终实付：¥${scheme.summary.finalPayText}`);
      lines.push(`- 商品基数：¥${scheme.summary.goodsBaseText}`);
      lines.push(`- 优惠总额：-¥${scheme.summary.discountTotalText}`);
      lines.push(`- 尾款：¥${scheme.summary.tailPayText}｜运费：¥${scheme.summary.shippingText}｜定金：¥${scheme.summary.depositText}`);
      lines.push(`- 优惠拆分：店铺券¥${scheme.summary.discountsText.shop} / 品类券¥${scheme.summary.discountsText.category} / 平台券¥${scheme.summary.discountsText.platform} / 跨店¥${scheme.summary.discountsText.cross} / 会员¥${scheme.summary.discountsText.member} / 红包¥${scheme.summary.discountsText.redPacket} / 换新¥${scheme.summary.discountsText.tradeIn} / 国补¥${scheme.summary.discountsText.national}`);
      lines.push('- 单品分摊：');
      (scheme.itemRows || []).forEach((row) => {
        lines.push(`  · ${row.name} ×${row.qty}：原价¥${row.originalPayText}，实付¥${row.finalPayText}，省¥${row.savedText}`);
      });
      lines.push('');
    });

    if (result.topUpSuggestion) {
      lines.push('【智能凑单建议】');
      lines.push(`- 当前参与满减金额：¥${result.topUpSuggestion.currentAmountText}`);
      lines.push(`- 距下一档差额：¥${result.topUpSuggestion.gapText}`);
      lines.push(`- 预计额外节省：¥${result.topUpSuggestion.saveText}`);
      lines.push(`- 建议：${result.topUpSuggestion.levelText}`);
      lines.push('');
    }

    return lines.join('\n');
  },

  exportResultText() {
    const text = this.buildExportText();
    if (!text) {
      wx.showToast({ title: '请先完成精算', icon: 'none' });
      return;
    }

    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '明细已复制', icon: 'success' }),
      fail: () => wx.showToast({ title: '复制失败，请重试', icon: 'none' }),
    });
  },
});
