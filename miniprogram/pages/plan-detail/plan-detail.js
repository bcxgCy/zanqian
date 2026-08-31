const dateUtil = require('../../utils/date');
const planUtil = require('../../utils/plan');
const storage = require('../../utils/storage');
const money = require('../../utils/money');
const subscribe = require('../../utils/subscribe');
const shareUtil = require('../../utils/share');

const MYSTERY_REVEAL_PRESET_ID = '100day';
const REVEAL_SLOT_BASE_ROUNDS = 5;
const REVEAL_SLOT_DURATION_BASE = 920;
const REVEAL_SLOT_DURATION_STEP = 180;
const REVEAL_START_DELAY = 30;
const REVEAL_FINISH_BUFFER = 120;

Page({
  data: {
    plan: null,
    summary: {},
    planTypeName: '',
    persistDays: 0,
    today: '',
    showSheet: false,
    sheetReadonly: false,
    selectedPeriod: null,
    canPause: false,
    // 订阅消息按钮状态
    subscribeBtnStatus: 'active', // active | disabled | cooldown
    subscribeBtnText: '开启打卡消息提醒',
    // 🆕 打卡成功弹窗状态
    showSuccessModal: false,
    successSavedAmount: 0,
    successConsecutiveDays: 0,
    // 100天挑战：金额揭晓弹窗状态
    showRevealModal: false,
    revealAmountDisplay: 0,
    revealRolling: false,
    revealDigitSlots: [],
  },

  onLoad(options) {
    this.planId = options.id;
    this.autoCheckin = options.checkin === '1';
    this.autoPeriodIndex = Number(options.periodIndex || 0);
    this.revealStartTimer = null;
    this.revealFinishTimer = null;
    this.pendingRevealDeposit = null;
  },

  onShow() {
    this.loadPlan();
  },

  onHide() {
    this.clearRevealAnimationTimers();
    this.pendingRevealDeposit = null;
    if (this.data.showRevealModal) {
      this.setData({ showRevealModal: false, revealRolling: false, revealAmountDisplay: 0, revealDigitSlots: [] });
    }
  },

  onUnload() {
    this.clearRevealAnimationTimers();
    this.pendingRevealDeposit = null;
  },

  loadPlan(showLoading = true) {
    if (showLoading) wx.showLoading({ title: '加载中' });
    return storage.getPlan(this.planId)
      .then((plan) => {
        if (!plan) {
          wx.showToast({ title: '计划不存在', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 800);
          return;
        }
        const today = dateUtil.today();
        const summary = planUtil.getPlanSummary(plan);
        const persistDays = dateUtil.diffDays(plan.startDate, today) + 1;
        const viewPlan = Object.assign({}, plan, {
          periods: (plan.periods || []).map((period) => this.formatPeriod(period, today, plan)),
        });

        this.setData({
          plan: viewPlan,
          summary,
          planTypeName: planUtil.getPlanTypeName(plan),
          persistDays,
          today,
          canPause: !plan.paused && !plan.completed && summary.progress < 100,
        }, () => {
          // 更新订阅按钮状态
          this.updateSubscribeButtonStatus();
          // 首页快捷打卡参数只消费一次；只读计划不会自动弹出打卡面板。
          if (!this.autoCheckin) return;
          this.autoCheckin = false;
          if (!this.isPlanReadonly()) this.openCheckinSheet();
        });
      })
      .catch((err) => {
        wx.showToast({ title: '计划加载失败', icon: 'none' });
        console.warn('计划加载失败', err);
      })
      .finally(() => {
        if (showLoading) wx.hideLoading();
      });
  },

  isMysteryPreset(plan) {
    return planUtil.isMysteryPreset(plan);
  },

  formatPeriod(period, today, plan) {
    // 期数状态只影响展示和交互提示，真实完成状态仍以 completed 为准。
    const isToday = period.date === today;
    const isOverdue = !period.completed && period.date < today;
    const isEarly = !period.completed && period.date > today;
    const hideExpectedAmount = this.isMysteryPreset(plan) && !period.completed;
    const dateClass = period.completed ? 'is-completed' : isToday ? 'is-today' : isOverdue ? 'is-overdue' : 'is-early';
    const dateStatus = period.completed
      ? '已打卡'
      : isToday
        ? '待打卡'
        : isOverdue
          ? '已过期'
          : '未到时间';
    const displayAmount = hideExpectedAmount ? '' : (period.completed ? period.savedAmount : period.expectedAmount);
    return Object.assign({}, period, {
      isToday,
      isOverdue,
      isEarly,
      hideExpectedAmount,
      dateClass,
      dateStatus,
      displayAmount,
    });
  },

  openDeposit(e) {
    const index = Number(e.currentTarget.dataset.index);
    const period = this.data.plan.periods.find((p) => p.index === index);
    this.handlePeriodTap(period);
  },

  handlePeriodTap(period) {
    if (!period) return;
    // 暂停/完成计划进入只读模式，历史和未来期数都不能编辑。
    if (this.isPlanReadonly()) {
      this.showDepositSheet(period, true);
      return;
    }

    const isToday = period.date === this.data.today;

    if (period.completed) {
      this.showDepositSheet(period, !isToday);
      return;
    }

    if (isToday) {
      this.showDepositSheet(period, false);
      return;
    }

    const isOverdue = period.date < this.data.today;
    wx.showModal({
      title: isOverdue ? '确认补打卡' : '确认提前打卡',
      content: isOverdue ? '该计划日期已过期，是否继续补打卡？' : '该计划还没到时间，是否继续提前打卡？',
      confirmText: isOverdue ? '补打卡' : '提前打卡',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.showDepositSheet(period, false);
        }
      },
    });
  },

  showDepositSheet(period, readonly) {
    this.setData({ showSheet: true, sheetReadonly: !!readonly, selectedPeriod: period });
  },

  openCheckinSheet() {
    if (this.isPlanReadonly()) return;
    const periods = this.data.plan.periods || [];
    const period =
      periods.find((p) => p.index === this.autoPeriodIndex) ||
      periods.find((p) => !p.completed) ||
      periods[0];
    if (!period) return;
    this.handlePeriodTap(period);
  },

  closeSheet() {
    this.closeRevealModal();
    this.setData({ showSheet: false, sheetReadonly: false, selectedPeriod: null });
  },

  shouldRevealMysteryAmount() {
    const { plan, selectedPeriod } = this.data;
    return !!(
      plan &&
      plan.planType === 'preset' &&
      plan.presetId === MYSTERY_REVEAL_PRESET_ID &&
      selectedPeriod &&
      !selectedPeriod.completed
    );
  },

  openRevealModal(savedAmount, note) {
    const finalAmount = money.toMoney(savedAmount);
    this.pendingRevealDeposit = { savedAmount: finalAmount, note: note || '' };
    this.setData({
      showRevealModal: true,
      revealAmountDisplay: 0,
      revealRolling: true,
    }, () => {
      this.startRevealAmountAnimation(finalAmount);
    });
  },

  closeRevealModal() {
    this.clearRevealAnimationTimers();
    this.pendingRevealDeposit = null;
    if (!this.data.showRevealModal && !this.data.revealRolling && !(this.data.revealDigitSlots || []).length) {
      return;
    }
    this.setData({
      showRevealModal: false,
      revealRolling: false,
      revealAmountDisplay: 0,
      revealDigitSlots: [],
    });
  },

  clearRevealAnimationTimers() {
    if (this.revealStartTimer) {
      clearTimeout(this.revealStartTimer);
      this.revealStartTimer = null;
    }
    if (this.revealFinishTimer) {
      clearTimeout(this.revealFinishTimer);
      this.revealFinishTimer = null;
    }
  },

  buildRevealDigitSlots(amount) {
    const text = String(money.toMoney(amount));
    let digitOrder = 0;
    return text.split('').map((char, charIndex) => {
      if (!/[0-9]/.test(char)) {
        return {
          key: `symbol-${charIndex}`,
          type: 'symbol',
          char,
        };
      }

      const rounds = REVEAL_SLOT_BASE_ROUNDS + digitOrder;
      const sequence = [];
      for (let round = 0; round <= rounds; round++) {
        for (let digit = 0; digit <= 9; digit++) {
          sequence.push(String(digit));
        }
      }

      const finalDigit = Number(char);
      const duration = REVEAL_SLOT_DURATION_BASE + digitOrder * REVEAL_SLOT_DURATION_STEP;
      digitOrder += 1;

      return {
        key: `digit-${charIndex}`,
        type: 'digit',
        sequence,
        stopIndex: rounds * 10 + finalDigit,
        offsetPercent: 0,
        transition: 'none',
        duration,
      };
    });
  },

  startRevealAmountAnimation(finalAmount) {
    if (!this.data.showRevealModal) return;
    this.clearRevealAnimationTimers();

    const normalizedAmount = money.toMoney(finalAmount);
    const slots = this.buildRevealDigitSlots(normalizedAmount);
    this.setData({
      revealAmountDisplay: normalizedAmount,
      revealDigitSlots: slots,
      revealRolling: true,
    }, () => {
      this.revealStartTimer = setTimeout(() => {
        if (!this.data.showRevealModal) return;

        let maxDuration = 0;
        const animatedSlots = slots.map((slot) => {
          if (slot.type !== 'digit') return slot;

          const totalCount = (slot.sequence || []).length || 1;
          const offsetPercent = (slot.stopIndex / totalCount) * 100;
          maxDuration = Math.max(maxDuration, slot.duration || 0);

          return Object.assign({}, slot, {
            offsetPercent,
            transition: `transform ${slot.duration}ms cubic-bezier(0.1, 0.9, 0.18, 1)`,
          });
        });

        this.setData({ revealDigitSlots: animatedSlots });

        this.revealFinishTimer = setTimeout(() => {
          if (!this.data.showRevealModal) return;
          this.setData({ revealRolling: false });
        }, maxDuration + REVEAL_FINISH_BUFFER);
      }, REVEAL_START_DELAY);
    });
  },

  onRevealConfirm() {
    if (!this.pendingRevealDeposit) {
      this.closeRevealModal();
      return;
    }
    const pending = Object.assign({}, this.pendingRevealDeposit);
    this.closeRevealModal();
    this.commitDeposit(pending.savedAmount, pending.note);
  },

  onRevealCancel() {
    this.closeRevealModal();
  },

  commitDeposit(savedAmount, note) {
    if (this.shouldConfirmCompletion(savedAmount)) {
      wx.showModal({
        title: '确认完成计划',
        content: '本次存入后该计划将达成目标，确认将计划标记为完成吗？完成后只能查看，不能继续打卡。',
        confirmText: '确认完成',
        cancelText: '再想想',
        success: (res) => {
          if (res.confirm) this.saveDeposit(savedAmount, note, true);
        },
      });
      return;
    }

    // 🆕 在 TAP 同步调用栈中检查并触发订阅授权
    this.trySubscribeBeforeSave();
    this.saveDeposit(savedAmount, note, false);
  },

  onDepositConfirm(e) {
    // 防止进入只读前已打开的弹层在状态变化后仍提交打卡。
    if (this.isPlanReadonly()) {
      wx.showToast({ title: this.data.plan.completed ? '计划已完成' : '计划已暂停', icon: 'none' });
      this.closeSheet();
      return;
    }
    const { savedAmount, note } = e.detail;
    if (this.shouldRevealMysteryAmount()) {
      this.openRevealModal(savedAmount, note);
      return;
    }
    this.commitDeposit(savedAmount, note);
  },

  /**
   * 在保存前尝试触发订阅授权（必须在 TAP 同步调用栈中）
   * 与保存请求并行，互不影响
   */
  trySubscribeBeforeSave() {
    const btnStatus = subscribe.getButtonStatus(this.planId);

    // 只有状态为 active 时才弹窗（无有效额度且不在冷却期）
    if (btnStatus.status !== 'active') return;

    // 直接在 TAP 同步调用栈中发起订阅请求
    subscribe.triggerManual(this.planId);
  },

  saveDeposit(savedAmount, note, completePlan) {
    wx.showLoading({ title: '保存中' });
    storage.updatePeriod(this.planId, this.data.selectedPeriod.index, {
      savedAmount,
      date: this.data.selectedPeriod.date,
      note,
      completePlan,
    }).then(() => {
      this.closeSheet();
      return this.loadPlan(false);
    }).then(() => {
      // 🆕 替换原有 toast，改为显示带分享引导的成功弹窗
      if (completePlan) {
        // 计划完成：仍使用 toast（或后续可扩展为完成庆典弹窗）
        wx.showToast({ title: '计划已完成', icon: 'success' });
      } else {
        // 普通存入：显示打卡成功弹窗（含海报和分享引导）
        // 用 try-catch 包裹，避免影响主流程（存入已成功）
        try {
          this.showSuccessPoster(savedAmount);
        } catch (posterErr) {
          console.error('[success-poster] 弹窗显示失败，回退到 toast', posterErr);
          wx.showToast({ title: '存入成功', icon: 'success' });
        }
      }
      // 订阅授权已在 onDepositConfirm 的 TAP 同步调用栈中触发，不再在此处异步调用
    }).catch((err) => {
      wx.showToast({ title: '存入失败', icon: 'none' });
      console.warn('存入失败', err);
    }).finally(() => {
      wx.hideLoading();
    });
  },

  isPlanReadonly() {
    const plan = this.data.plan;
    return !!(plan && (plan.paused || plan.completed || this.data.summary.progress >= 100));
  },

  shouldConfirmCompletion(savedAmount) {
    const plan = this.data.plan;
    const selectedPeriod = this.data.selectedPeriod;
    if (!plan || !selectedPeriod || plan.completed || selectedPeriod.completed) return false;

    const savedTotal = money.sum(plan.periods || [], (period) =>
      period.index === selectedPeriod.index ? savedAmount : period.savedAmount || 0
    );
    return money.gte(savedTotal, plan.targetAmount);
  },

  deletePlan() {
    wx.showModal({
      title: '确认删除',
      content: '删除后数据不可恢复',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中' });
          storage.deletePlan(this.planId).then(() => {
            // 清除该心愿的所有订阅记录（本地 + 云端）
            subscribe.clearAllRecords(this.planId);
            wx.navigateBack();
          }).catch((err) => {
            wx.showToast({ title: '删除失败', icon: 'none' });
            console.warn('删除失败', err);
          }).finally(() => {
            wx.hideLoading();
          });
        }
      },
    });
  },

  pausePlan() {
    // 暂停不改日期和金额，只改变计划状态，方便之后重启重新排期。
    wx.showModal({
      title: '暂停计划',
      content: '暂停后该计划会排到首页底部，期间只能查看，不能打卡。确认暂停吗？',
      confirmText: '暂停',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '暂停中' });
        storage.pausePlan(this.planId)
          .then(() => this.loadPlan(false))
          .then(() => {
            wx.showToast({ title: '已暂停', icon: 'success' });
          })
          .catch((err) => {
            wx.showToast({ title: '暂停失败', icon: 'none' });
            console.warn('暂停计划失败', err);
          })
          .finally(() => {
            wx.hideLoading();
          });
      },
    });
  },

  restartPlan() {
    // 重启会把未完成期数从今天开始重排，已完成流水保持不变。
    wx.showModal({
      title: '重启计划',
      content: '重启后会从今天开始重新安排未完成期数的预计完成时间。确认重启吗？',
      confirmText: '重启',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '重启中' });
        storage.restartPlan(this.planId)
          .then(() => this.loadPlan(false))
          .then(() => {
            wx.showToast({ title: '已重启', icon: 'success' });
          })
          .catch((err) => {
            wx.showToast({ title: '重启失败', icon: 'none' });
            console.warn('重启计划失败', err);
          })
          .finally(() => {
            wx.hideLoading();
          });
      },
    });
  },

  /**
   * 更新订阅按钮状态
   * 根据文档规范的三种状态更新按钮文案和可点击状态
   */
  updateSubscribeButtonStatus() {
    const btnStatus = subscribe.getButtonStatus(this.planId);
    this.setData({
      subscribeBtnStatus: btnStatus.status,
      subscribeBtnText: btnStatus.text,
    });
  },

  /**
   * 手动点击订阅按钮
   * 场景三：用户主动点击开启提醒
   */
  onSubscribeTap() {
    const btnStatus = subscribe.getButtonStatus(this.planId);
    if (btnStatus.status === 'cooldown') {
      wx.showToast({
        title: `暂时无法开启，${btnStatus.remainingDays}天后重试`,
        icon: 'none',
      });
      return;
    }
    if (btnStatus.status === 'disabled') {
      wx.showToast({
        title: '打卡提醒已生效',
        icon: 'none',
      });
      return;
    }

    // 直接触发订阅授权（同步调用，在 TAP 手势的调用栈中）
    const requested = subscribe.triggerManual(this.planId);
    if (requested) {
      // 已发起请求，等用户操作后更新状态
      // 注意：不能在这里立即更新，需要等用户在弹窗中操作后
      // 可以通过延迟或让用户手动刷新来更新
      setTimeout(() => {
        this.updateSubscribeButtonStatus();
      }, 1000);
    }
  },

  /**
   * 点击【📤 分享此计划】按钮
   *
   * 流程：
   * 1. 显示弹窗 + 开始加载状态
   * 2. 调用云函数创建快照
   * 3. 成功后显示"发送给微信好友"按钮（真正的 open-type="share" 按钮）
   * 4. 用户点击该按钮 → 触发 onShareAppMessage → 返回模板分享路径
   */
  async onSharePlanTap() {
    const { plan } = this.data;
    if (!plan) {
      wx.showToast({ title: '计划数据异常', icon: 'none' });
      return;
    }

    // 显示弹窗，进入加载状态
    this.setData({
      showShareModal: true,
      sharePreparing: true,
      shareSnapshotId: null,
      shareError: null,
    });

    try {
      // 创建快照（只保存配置模板，不含个人数据）
      const result = await shareUtil.triggerSharePlan(plan, 'card');

      if (result.success) {
        // ✅ 快照创建成功，显示分享按钮
        console.log('【share】快照创建成功', result.snapshotId);

        this.setData({
          sharePreparing: false,
          shareSnapshotId: result.snapshotId,
          _pendingSnapshotId: result.snapshotId, // 缓存供 onShareAppMessage 使用
        });
      } else {
        // ❌ 创建失败
        this.setData({
          sharePreparing: false,
          shareError: result.error || '创建失败',
        });
      }
    } catch (err) {
      console.error('【share】创建快照失败', err);
      this.setData({
        sharePreparing: false,
        shareError: err.message || '网络错误，请重试',
      });
    }
  },

  /**
   * 关闭分享弹窗
   */
  closeShareModal() {
    this.setData({ showShareModal: false });
  },

  /**
   * 阻止事件冒泡（空函数）
   */
  preventTouchMove() {
    // 空函数，用于阻止触摸事件冒泡
  },

  /**
   * 分享给朋友（生命周期函数）
   *
   * 微信在用户点击 open-type="share" 按钮时自动调用
   * 支持三种场景：
   * 1. 模板分享（分享此计划弹窗内的按钮）
   * 2. 打卡成功海报分享（成功弹窗内的按钮）🆕
   * 3. 默认详情页分享（右上角菜单触发）
   */
  onShareAppMessage(res) {
    const { plan, summary } = this.data;
    if (!plan) return {};

    const from = res.from;
    const target = res.target;
    const isTemplateButton = target?.dataset?.shareType === 'template';

    // 场景1：模板分享（分享此计划弹窗内）
    if (from === 'button' && isTemplateButton && this.data._pendingSnapshotId) {
      console.log('【share】✅ 真正的模板分享', this.data._pendingSnapshotId);

      return {
        title: `🎯 ${plan.name} - 目标 ¥${plan.targetAmount}`,
        path: `/pages/plan-copy-preview/plan-copy-preview?snapshotId=${this.data._pendingSnapshotId}`,
        imageUrl: '',
      };
    }

    // 🆕 场景2：打卡成功海报分享（成功弹窗内触发）
    if (from === 'button' && this.data.showSuccessModal) {
      // 获取海报组件生成的图片 URL
      const posterUrl = this.selectComponent('#successPoster')?.data?.posterUrl || '';

      // 构建成就页参数（URL 编码）
      const achievementParams = [
        `nickname=${encodeURIComponent('存钱达人')}`,
        `planIcon=${encodeURIComponent(plan.icon || '🎯')}`,
        `planName=${encodeURIComponent(plan.name)}`,
        `targetAmount=${plan.targetAmount}`,
        `savedAmount=${summary.savedAmount || 0}`,
        `savedAmountThisTime=${this.data.successSavedAmount}`,
        `progress=${summary.progress || 0}`,
        `consecutiveDays=${this.data.successConsecutiveDays}`,
        `checkinDate=${dateUtil.today()}`,
      ].join('&');

      console.log('【share】🎉 打卡成功海报分享', {
        consecutiveDays: this.data.successConsecutiveDays,
        hasPoster: !!posterUrl,
        targetPage: '/pages/achievement/achievement',
      });

      return {
        title: `🎉 我今日打卡成功！「${plan.name}」坚持 ${this.data.successConsecutiveDays} 天`,
        path: `/pages/achievement/achievement?${achievementParams}`, // 🆕 跳转到成就展示页
        imageUrl: posterUrl, // 使用生成的海报作为封面图
      };
    }

    // 场景3：默认 - 个人详情页（右上角菜单触发时使用）
    const progress = summary.progress || 0;
    const savedAmount = summary.savedAmount || 0;

    return {
      title: `【${plan.name}】已存入 ¥${savedAmount}，完成 ${progress}%`,
      path: `/pages/plan-detail/plan-detail?id=${this.planId}`,
      imageUrl: '',
    };
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    const { plan, summary } = this.data;
    if (!plan) return {};

    return {
      title: `我正在坚持存钱：${plan.name}，已完成 ${summary.progress || 0}%`,
      query: `id=${this.planId}`,
      imageUrl: '',
    };
  },

  // ==================== 🆕 打卡成功弹窗相关方法 ====================

  /**
   * 显示打卡成功弹窗（含海报和分享引导）
   * @param {number} savedAmount 本次存入金额
   */
  showSuccessPoster(savedAmount) {
    let consecutiveDays = 0;

    // 安全获取连续打卡天数（容错处理）
    try {
      const statsUtil = require('../../utils/stats');
      if (statsUtil && typeof statsUtil.getConsecutiveDays === 'function') {
        consecutiveDays = statsUtil.getConsecutiveDays(this.data.plan);
      } else {
        console.warn('[success-poster] getConsecutiveDays 方法不存在');
      }
    } catch (err) {
      console.error('[success-poster] 计算连续天数失败', err);
      // 使用默认值 0
    }

    console.log('[success-poster] 显示成功弹窗', {
      savedAmount,
      consecutiveDays,
      planName: this.data.plan?.name || '未知',
    });

    this.setData({
      showSuccessModal: true,
      successSavedAmount: savedAmount,
      successConsecutiveDays: consecutiveDays,
    });
  },

  /**
   * 关闭打卡成功弹窗
   */
  closeSuccessPoster() {
    this.setData({ showSuccessModal: false });
  },
});
