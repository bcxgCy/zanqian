function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeText(value, fallback = '') {
  return String(value || fallback).trim();
}

function toCents(value) {
  return Math.round(safeNumber(value, 0) * 100);
}

function fromCents(cents) {
  return safeNumber(cents, 0) / 100;
}

function centsText(cents) {
  return fromCents(cents).toFixed(2);
}

function buildId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function allocateByWeights(totalCents, weightItems) {
  const total = Math.max(0, Math.floor(safeNumber(totalCents, 0)));
  const normalized = (weightItems || [])
    .map((item) => ({
      id: item.id,
      weight: Math.max(0, Math.floor(safeNumber(item.weight, 0))),
    }))
    .filter((item) => item.weight > 0);

  const weightSum = normalized.reduce((sum, item) => sum + item.weight, 0);
  if (!total || !weightSum || !normalized.length) {
    return {
      appliedCents: 0,
      allocations: [],
    };
  }

  const base = [];
  let used = 0;

  normalized.forEach((item) => {
    const raw = (total * item.weight) / weightSum;
    const cents = Math.floor(raw);
    base.push({
      id: item.id,
      cents,
      fraction: raw - cents,
    });
    used += cents;
  });

  let left = total - used;
  base.sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; i < base.length && left > 0; i += 1) {
    base[i].cents += 1;
    left -= 1;
  }

  const allocations = base
    .filter((item) => item.cents > 0)
    .map((item) => ({ id: item.id, cents: item.cents }));

  const appliedCents = allocations.reduce((sum, item) => sum + item.cents, 0);

  return {
    appliedCents,
    allocations,
  };
}

function normalizeGoods(goods) {
  return (Array.isArray(goods) ? goods : [])
    .map((item) => {
      const id = item.id || buildId('goods');
      const name = normalizeText(item.name, '未命名商品');
      const shop = normalizeText(item.shop, '默认店铺');
      const category = normalizeText(item.category, '默认品类');
      const qty = Math.max(1, Math.floor(safeNumber(item.qty, 1)));
      const priceCents = Math.max(0, toCents(item.price));
      const shippingCents = Math.max(0, toCents(item.shipping));
      const usePresale = !!item.usePresale;
      const depositCents = usePresale ? Math.max(0, toCents(item.deposit)) * qty : 0;
      const inflateCents = usePresale ? Math.max(0, toCents(item.inflateTo)) * qty : 0;
      const baseCents = priceCents * qty;
      const tailBaseCents = Math.max(0, baseCents - inflateCents);

      return {
        id,
        name,
        shop,
        category,
        qty,
        priceCents,
        shippingCents,
        baseCents,
        usePresale,
        depositCents,
        inflateCents,
        tailBaseCents,
        joinCross: item.joinCross !== false,
        joinCategory: item.joinCategory !== false,
      };
    })
    .filter((item) => item.baseCents > 0 && item.qty > 0);
}

function normalizeCoupons(coupons) {
  return (Array.isArray(coupons) ? coupons : []).map((item) => ({
    id: item.id || buildId('coupon'),
    name: normalizeText(item.name, '未命名优惠'),
    type: normalizeText(item.type, 'platform'),
    enabled: item.enabled !== false,
    thresholdCents: Math.max(0, toCents(item.threshold)),
    discountCents: Math.max(0, toCents(item.discount)),
    everyFullCents: Math.max(0, toCents(item.everyFull)),
    everyMinusCents: Math.max(0, toCents(item.everyMinus)),
    rate: Math.max(0, Math.min(1, safeNumber(item.rate, 1))),
    shop: normalizeText(item.shop),
    category: normalizeText(item.category),
    mutexGroup: normalizeText(item.mutexGroup),
    limitCents: Math.max(0, toCents(item.limit)),
  }));
}

function resolveMutexCoupons(coupons) {
  const warnings = [];
  const enabledByGroup = {};
  const list = coupons.map((coupon) => {
    if (!coupon.enabled || !coupon.mutexGroup) {
      return coupon;
    }
    const existing = enabledByGroup[coupon.mutexGroup];
    if (existing) {
      warnings.push(`优惠「${coupon.name}」与「${existing.name}」互斥，已自动忽略后者`);
      return Object.assign({}, coupon, { enabled: false });
    }
    enabledByGroup[coupon.mutexGroup] = coupon;
    return coupon;
  });

  return { coupons: list, warnings };
}

function pickBestCoupon(coupons, benefitGetter) {
  let best = null;
  let bestBenefit = 0;

  (coupons || []).forEach((coupon) => {
    const benefit = Math.max(0, Math.floor(safeNumber(benefitGetter(coupon), 0)));
    if (benefit > bestBenefit) {
      bestBenefit = benefit;
      best = coupon;
    }
  });

  return {
    coupon: best,
    benefitCents: bestBenefit,
  };
}

function sumBy(list, getter) {
  return (list || []).reduce((sum, item) => sum + safeNumber(getter(item), 0), 0);
}

function applyDiscountToLineMap(lineMap, lineIds, discountCents) {
  const ids = Array.isArray(lineIds) ? lineIds : [];
  const weightItems = ids
    .map((id) => ({ id, weight: Math.max(0, Math.floor(safeNumber(lineMap[id], 0))) }))
    .filter((item) => item.weight > 0);

  const available = weightItems.reduce((sum, item) => sum + item.weight, 0);
  const target = Math.max(0, Math.min(Math.floor(safeNumber(discountCents, 0)), available));
  if (!target || !available) {
    return 0;
  }

  const allocation = allocateByWeights(target, weightItems);
  allocation.allocations.forEach((item) => {
    const current = Math.max(0, Math.floor(safeNumber(lineMap[item.id], 0)));
    lineMap[item.id] = Math.max(0, current - item.cents);
  });

  return allocation.appliedCents;
}

function createOrderState(orderId, orderName, lines) {
  const itemTailMap = {};
  (lines || []).forEach((line) => {
    itemTailMap[line.id] = line.tailBaseCents;
  });

  return {
    id: orderId,
    name: orderName,
    lines: lines || [],
    itemTailMap,
    tailCents: sumBy(lines, (line) => line.tailBaseCents),
    logs: [],
    discounts: {
      shop: 0,
      category: 0,
      platform: 0,
      cross: 0,
      member: 0,
      redPacket: 0,
      tradeIn: 0,
      national: 0,
    },
    crossContext: null,
  };
}

function selectCouponByType(coupons, type) {
  return (coupons || []).filter((coupon) => coupon.enabled && coupon.type === type);
}

function applyOrderCoupon(order, coupon, benefitCents, lineFilter, typeKey, schemeLogs) {
  if (!coupon || !benefitCents) {
    return 0;
  }
  const lineIds = order.lines.filter(lineFilter).map((line) => line.id);
  const appliedCents = applyDiscountToLineMap(order.itemTailMap, lineIds, benefitCents);
  if (!appliedCents) {
    return 0;
  }
  order.tailCents = Math.max(0, order.tailCents - appliedCents);
  order.discounts[typeKey] = (order.discounts[typeKey] || 0) + appliedCents;
  const log = `【${order.name}】${coupon.name} 生效，减 ¥${centsText(appliedCents)}，当前尾款 ¥${centsText(order.tailCents)}`;
  order.logs.push(log);
  schemeLogs.push(log);
  return appliedCents;
}

function applyShopCoupons(order, coupons, usedCouponIds, schemeLogs) {
  const shops = Array.from(new Set(order.lines.map((line) => line.shop)));

  shops.forEach((shop) => {
    const candidates = coupons.filter((coupon) => {
      if (usedCouponIds.has(coupon.id)) return false;
      if (coupon.shop && coupon.shop !== shop) return false;
      return true;
    });

    const best = pickBestCoupon(candidates, (coupon) => {
      const eligible = sumBy(order.lines, (line) => {
        if (line.shop !== shop) return 0;
        return order.itemTailMap[line.id] || 0;
      });
      if (eligible < coupon.thresholdCents) return 0;
      return Math.min(coupon.discountCents, eligible);
    });

    if (!best.coupon || !best.benefitCents) return;

    const applied = applyOrderCoupon(
      order,
      best.coupon,
      best.benefitCents,
      (line) => line.shop === shop,
      'shop',
      schemeLogs
    );

    if (applied > 0) {
      usedCouponIds.add(best.coupon.id);
    }
  });
}

function applySingleBestCoupon(order, coupons, usedCouponIds, typeKey, schemeLogs, benefitFn, lineFilter) {
  const candidates = coupons.filter((coupon) => !usedCouponIds.has(coupon.id));
  const best = pickBestCoupon(candidates, benefitFn);
  if (!best.coupon || !best.benefitCents) {
    return 0;
  }

  const applied = applyOrderCoupon(order, best.coupon, best.benefitCents, lineFilter(best.coupon), typeKey, schemeLogs);
  if (applied > 0) {
    usedCouponIds.add(best.coupon.id);
  }
  return applied;
}

function applyMemberDiscount(order, coupon, schemeLogs) {
  if (!coupon) return 0;
  if (coupon.thresholdCents > 0 && order.tailCents < coupon.thresholdCents) {
    return 0;
  }

  const rate = Math.max(0, Math.min(1, safeNumber(coupon.rate, 1)));
  const discountCents = Math.floor(order.tailCents * (1 - rate));
  if (!discountCents) return 0;

  return applyOrderCoupon(
    order,
    coupon,
    discountCents,
    () => true,
    'member',
    schemeLogs
  );
}

function applySchemeDiscount(orders, coupon, benefitCents, typeKey, schemeLogs) {
  if (!coupon || !benefitCents) return 0;

  const weights = orders
    .map((order) => ({ id: order.id, weight: order.tailCents }))
    .filter((item) => item.weight > 0);

  const available = weights.reduce((sum, item) => sum + item.weight, 0);
  if (!available) return 0;

  const target = Math.max(0, Math.min(benefitCents, available));
  if (!target) return 0;

  const allocation = allocateByWeights(target, weights);
  let appliedTotal = 0;

  allocation.allocations.forEach((alloc) => {
    const order = orders.find((item) => item.id === alloc.id);
    if (!order || alloc.cents <= 0) return;

    const lineIds = order.lines.map((line) => line.id);
    const applied = applyDiscountToLineMap(order.itemTailMap, lineIds, alloc.cents);
    if (!applied) return;

    order.tailCents = Math.max(0, order.tailCents - applied);
    order.discounts[typeKey] = (order.discounts[typeKey] || 0) + applied;
    appliedTotal += applied;
  });

  if (appliedTotal > 0) {
    schemeLogs.push(`【全局】${coupon.name} 生效，减 ¥${centsText(appliedTotal)}，当前尾款 ¥${centsText(sumBy(orders, (order) => order.tailCents))}`);
  }

  return appliedTotal;
}

function buildOrders(mode, lines) {
  if (mode === 'split') {
    const grouped = {};
    (lines || []).forEach((line) => {
      const key = line.shop || '默认店铺';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(line);
    });

    return Object.keys(grouped).map((shopName, idx) => createOrderState(`split_${idx + 1}`, `${shopName}订单`, grouped[shopName]));
  }

  return [createOrderState('merge_1', '合并订单', lines || [])];
}

function calcCrossBenefit(order, coupon) {
  const everyFull = coupon.everyFullCents;
  const everyMinus = coupon.everyMinusCents;
  if (everyFull <= 0 || everyMinus <= 0) return { benefitCents: 0, eligibleCents: 0 };

  const eligibleCents = sumBy(order.lines, (line) => {
    if (!line.joinCross) return 0;
    return order.itemTailMap[line.id] || 0;
  });

  if (eligibleCents < everyFull) {
    return { benefitCents: 0, eligibleCents };
  }

  const tier = Math.floor(eligibleCents / everyFull);
  const benefitCents = Math.min(eligibleCents, tier * everyMinus);
  return {
    benefitCents,
    eligibleCents,
  };
}

function getBestMemberCoupon(memberCoupons) {
  if (!memberCoupons.length) return null;
  return memberCoupons.reduce((best, coupon) => {
    if (!best) return coupon;
    if (coupon.rate < best.rate) return coupon;
    return best;
  }, null);
}

function getBestGlobalFixedCoupon(coupons, totalTailCents) {
  return pickBestCoupon(coupons, (coupon) => {
    if (coupon.thresholdCents > 0 && totalTailCents < coupon.thresholdCents) {
      return 0;
    }
    let benefit = coupon.discountCents;
    if (coupon.limitCents > 0) {
      benefit = Math.min(benefit, coupon.limitCents);
    }
    return Math.min(benefit, totalTailCents);
  });
}

function calculateScheme(mode, lines, coupons) {
  const schemeLogs = [];
  const orders = buildOrders(mode, lines);
  const usedCouponIds = new Set();

  const shopCoupons = selectCouponByType(coupons, 'shop');
  const categoryCoupons = selectCouponByType(coupons, 'category');
  const platformCoupons = selectCouponByType(coupons, 'platform');
  const crossCoupons = selectCouponByType(coupons, 'cross');
  const memberCoupons = selectCouponByType(coupons, 'member');

  const redPacketCoupons = selectCouponByType(coupons, 'redPacket');
  const tradeInCoupons = selectCouponByType(coupons, 'tradeIn');
  const nationalCoupons = selectCouponByType(coupons, 'national');

  const memberCoupon = getBestMemberCoupon(memberCoupons);

  orders.forEach((order) => {
    if (shopCoupons.length) {
      applyShopCoupons(order, shopCoupons, usedCouponIds, schemeLogs);
    }

    if (categoryCoupons.length) {
      applySingleBestCoupon(
        order,
        categoryCoupons,
        usedCouponIds,
        'category',
        schemeLogs,
        (coupon) => {
          const eligible = sumBy(order.lines, (line) => {
            if (!line.joinCategory) return 0;
            if (coupon.category && coupon.category !== line.category) return 0;
            return order.itemTailMap[line.id] || 0;
          });
          if (eligible < coupon.thresholdCents) return 0;
          return Math.min(coupon.discountCents, eligible);
        },
        (coupon) => (line) => {
          if (!line.joinCategory) return false;
          if (coupon.category && coupon.category !== line.category) return false;
          return true;
        }
      );
    }

    if (platformCoupons.length) {
      applySingleBestCoupon(
        order,
        platformCoupons,
        usedCouponIds,
        'platform',
        schemeLogs,
        (coupon) => {
          if (order.tailCents < coupon.thresholdCents) return 0;
          return Math.min(coupon.discountCents, order.tailCents);
        },
        () => () => true
      );
    }

    if (mode === 'merge' && crossCoupons.length) {
      const crossBest = pickBestCoupon(crossCoupons, (coupon) => calcCrossBenefit(order, coupon).benefitCents);
      if (crossBest.coupon && crossBest.benefitCents > 0) {
        const crossInfo = calcCrossBenefit(order, crossBest.coupon);
        const applied = applyOrderCoupon(
          order,
          crossBest.coupon,
          crossBest.benefitCents,
          (line) => !!line.joinCross,
          'cross',
          schemeLogs
        );
        if (applied > 0) {
          order.crossContext = {
            couponName: crossBest.coupon.name,
            eligibleBeforeCents: crossInfo.eligibleCents,
            everyFullCents: crossBest.coupon.everyFullCents,
            everyMinusCents: crossBest.coupon.everyMinusCents,
            appliedCents: applied,
          };
        }
      }
    }

    if (memberCoupon) {
      applyMemberDiscount(order, memberCoupon, schemeLogs);
    }
  });

  if (mode === 'split' && crossCoupons.length) {
    schemeLogs.push('【拆单策略】按店铺拆单后，跨店满减不生效。');
  }

  const applyGlobalCouponType = (couponList, typeKey) => {
    if (!couponList.length) return;
    const currentTail = sumBy(orders, (order) => order.tailCents);
    const best = getBestGlobalFixedCoupon(couponList, currentTail);
    if (!best.coupon || !best.benefitCents) return;
    applySchemeDiscount(orders, best.coupon, best.benefitCents, typeKey, schemeLogs);
  };

  applyGlobalCouponType(redPacketCoupons, 'redPacket');
  applyGlobalCouponType(tradeInCoupons, 'tradeIn');
  applyGlobalCouponType(nationalCoupons, 'national');

  const orderRows = orders.map((order) => ({
    id: order.id,
    name: order.name,
    tailPayCents: order.tailCents,
    tailPayText: centsText(order.tailCents),
  }));

  const lineOrderMap = {};
  orders.forEach((order) => {
    order.lines.forEach((line) => {
      lineOrderMap[line.id] = order;
    });
  });

  const itemRows = lines.map((line) => {
    const order = lineOrderMap[line.id];
    const tailPayCents = order ? Math.max(0, Math.floor(safeNumber(order.itemTailMap[line.id], 0))) : line.tailBaseCents;
    const finalPayCents = tailPayCents + line.depositCents + line.shippingCents;
    const originalPayCents = line.baseCents + line.shippingCents;

    return {
      id: line.id,
      name: line.name,
      shop: line.shop,
      category: line.category,
      qty: line.qty,
      originalPayText: centsText(originalPayCents),
      finalPayText: centsText(finalPayCents),
      finalPayCents,
      savedCents: originalPayCents - finalPayCents,
      savedText: centsText(originalPayCents - finalPayCents),
    };
  });

  const summaryDiscounts = {
    shop: sumBy(orders, (order) => order.discounts.shop),
    category: sumBy(orders, (order) => order.discounts.category),
    platform: sumBy(orders, (order) => order.discounts.platform),
    cross: sumBy(orders, (order) => order.discounts.cross),
    member: sumBy(orders, (order) => order.discounts.member),
    redPacket: sumBy(orders, (order) => order.discounts.redPacket),
    tradeIn: sumBy(orders, (order) => order.discounts.tradeIn),
    national: sumBy(orders, (order) => order.discounts.national),
  };

  const goodsBaseCents = sumBy(lines, (line) => line.baseCents);
  const tailBaseCents = sumBy(lines, (line) => line.tailBaseCents);
  const tailPayCents = sumBy(orders, (order) => order.tailCents);
  const shippingCents = sumBy(lines, (line) => line.shippingCents);
  const depositCents = sumBy(lines, (line) => line.depositCents);

  const finalPayCents = tailPayCents + shippingCents + depositCents;
  const discountTotalCents = Math.max(0, tailBaseCents - tailPayCents);

  const crossContext = mode === 'merge'
    ? (orders[0] && orders[0].crossContext ? orders[0].crossContext : null)
    : null;

  return {
    key: mode,
    name: mode === 'merge' ? '方案1：全部合并一单' : '方案2：按店铺拆单',
    logs: schemeLogs,
    orderRows,
    itemRows,
    crossContext,
    summary: {
      goodsBaseCents,
      goodsBaseText: centsText(goodsBaseCents),
      discountTotalCents,
      discountTotalText: centsText(discountTotalCents),
      tailPayCents,
      tailPayText: centsText(tailPayCents),
      shippingCents,
      shippingText: centsText(shippingCents),
      depositCents,
      depositText: centsText(depositCents),
      finalPayCents,
      finalPayText: centsText(finalPayCents),
      discounts: summaryDiscounts,
      discountsText: {
        shop: centsText(summaryDiscounts.shop),
        category: centsText(summaryDiscounts.category),
        platform: centsText(summaryDiscounts.platform),
        cross: centsText(summaryDiscounts.cross),
        member: centsText(summaryDiscounts.member),
        redPacket: centsText(summaryDiscounts.redPacket),
        tradeIn: centsText(summaryDiscounts.tradeIn),
        national: centsText(summaryDiscounts.national),
      },
    },
  };
}

function buildTopUpSuggestion(crossContext) {
  if (!crossContext) return null;
  const everyFull = safeNumber(crossContext.everyFullCents, 0);
  const everyMinus = safeNumber(crossContext.everyMinusCents, 0);
  const current = safeNumber(crossContext.eligibleBeforeCents, 0);
  if (everyFull <= 0 || everyMinus <= 0) return null;

  const nextThreshold = (Math.floor(current / everyFull) + 1) * everyFull;
  const gap = Math.max(0, nextThreshold - current);
  const extraSave = everyMinus;

  let level = 'green';
  let levelText = '推荐凑单';
  if (gap > everyMinus * 1.5 && gap <= everyMinus * 3) {
    level = 'yellow';
    levelText = '谨慎凑单';
  } else if (gap > everyMinus * 3) {
    level = 'red';
    levelText = '不建议凑单';
  }

  return {
    currentAmountText: centsText(current),
    gapText: centsText(gap),
    saveText: centsText(extraSave),
    level,
    levelText,
    couponName: crossContext.couponName,
  };
}

function calculateAll(rawGoods, rawCoupons, options = {}) {
  const goods = normalizeGoods(rawGoods);
  const couponsRaw = normalizeCoupons(rawCoupons);
  const mutexResolved = resolveMutexCoupons(couponsRaw);
  const coupons = mutexResolved.coupons;

  if (!goods.length) {
    return {
      ok: false,
      error: '请至少添加1个有效商品（金额需大于0）',
      warnings: mutexResolved.warnings,
    };
  }

  const mergeScheme = calculateScheme('merge', goods, coupons);
  const splitScheme = calculateScheme('split', goods, coupons);

  const schemes = [mergeScheme, splitScheme];
  schemes.sort((a, b) => a.summary.finalPayCents - b.summary.finalPayCents);
  const bestKey = schemes[0] ? schemes[0].key : 'merge';

  const budgetCents = Math.max(0, toCents(options.budget));
  const decoratedSchemes = [mergeScheme, splitScheme].map((scheme) => {
    const overBudgetCents = budgetCents > 0 ? Math.max(0, scheme.summary.finalPayCents - budgetCents) : 0;
    return Object.assign({}, scheme, {
      recommended: scheme.key === bestKey,
      budget: {
        enabled: budgetCents > 0,
        budgetText: centsText(budgetCents),
        overBudget: overBudgetCents > 0,
        overBudgetText: centsText(overBudgetCents),
      },
    });
  });

  return {
    ok: true,
    warnings: mutexResolved.warnings,
    schemes: decoratedSchemes,
    bestKey,
    bestFinalPayText: centsText((decoratedSchemes.find((item) => item.key === bestKey) || decoratedSchemes[0]).summary.finalPayCents),
    topUpSuggestion: buildTopUpSuggestion(mergeScheme.crossContext),
  };
}

module.exports = {
  calculateAll,
  toCents,
  fromCents,
  centsText,
};
