const quizUtil = require('../../utils/double11Quiz');
const cloudSync = require('../../utils/cloudSync');

const QUESTIONS_PER_PAGE = 4;
const VIEW_RESULT_AD_UNIT_ID = 'adunit-e64610028f477074';
const QUIZ_RESULT_AD_PASS_TOKEN_KEY = 'double11_quiz_result_ad_pass_token_v1';
const QUIZ_TYPE = 'double11';
const ANALYTICS_PREFIX = '';

Page({
  data: {
    stage: 'intro', // intro | answering | result
    questions: quizUtil.QUESTIONS,
    pageIndex: 0,
    questionsPerPage: QUESTIONS_PER_PAGE,
    answersMap: {},
    currentQuestions: [],
    answeredCount: 0,
    progressPercent: 0,
    totalPages: Math.ceil(quizUtil.QUESTIONS.length / QUESTIONS_PER_PAGE),
    isLastPage: false,
    hasDraft: false,
    result: null,
    dimensionScoreList: [],
    radarCanvasSize: 280,
    reportSaved: false,
    loadingResult: false,
    hasSavedResult: false,
    pendingSavedResult: null,
    isSharedView: false,
    sharedOwnerName: '',
    sharedResultId: '',
  },

  onLoad(options = {}) {
    this._resultLoadSeq = 0;
    this.setupCanvasSize();
    const sharedResultId = String(options.resultId || '').trim();
    this.trackEvent('page_view', {
      source: sharedResultId ? 'shared' : 'direct',
    });
    if (sharedResultId) {
      this.loadSharedResult(sharedResultId);
      return;
    }
    this.loadResultOrDraft();
  },

  onUnload() {
    this.persistDraft();
  },

  onHide() {
    this.persistDraft();
  },

  setupCanvasSize() {
    const systemInfo = wx.getSystemInfoSync();
    const width = Math.max(240, Math.min(360, Math.floor((systemInfo.windowWidth || 375) - 48)));
    this.setData({ radarCanvasSize: width });
  },

  nextLoadSeq() {
    this._resultLoadSeq = Number(this._resultLoadSeq || 0) + 1;
    return this._resultLoadSeq;
  },

  isSeqActive(seq) {
    return Number(seq) === Number(this._resultLoadSeq || 0);
  },

  cancelPendingLoad() {
    this.nextLoadSeq();
  },

  trackEvent(name, params = {}) {
    try {
      if (typeof wx.reportAnalytics === 'function') {
        wx.reportAnalytics(ANALYTICS_PREFIX + name, params || {});
      }
    } catch (err) {
      console.warn('双十一测评埋点上报失败', name, err);
    }
  },

  async loadResultOrDraft() {
    const seq = this.nextLoadSeq();
    this.setData({
      isSharedView: false,
      sharedOwnerName: '',
      sharedResultId: '',
    });
    this.setData({ loadingResult: true });
    try {
      const res = await cloudSync.getQuizResult(QUIZ_TYPE);
      if (!this.isSeqActive(seq) || this.data.stage !== 'intro') return;
      const cloudResult = res && res.quizResult;
      if (cloudResult && cloudResult.version === quizUtil.QUIZ_VERSION) {
        this.setData({ hasSavedResult: true, pendingSavedResult: cloudResult });
        if (this.hasAdPassForResult(cloudResult)) {
          this.showResult(cloudResult, true);
        } else {
          this.restoreDraft();
        }
        return;
      }
    } catch (err) {
      console.warn('获取双十一测评结果失败', err);
    } finally {
      if (this.isSeqActive(seq)) {
        this.setData({ loadingResult: false });
      }
    }

    if (!this.isSeqActive(seq) || this.data.stage !== 'intro') return;
    this.restoreDraft();
  },

  async loadSharedResult(resultId) {
    const seq = this.nextLoadSeq();
    this.setData({
      loadingResult: true,
      isSharedView: true,
      sharedResultId: resultId,
      hasDraft: false,
      pendingSavedResult: null,
      hasSavedResult: false,
      reportSaved: false,
    });

    try {
      const res = await cloudSync.getQuizResultById(QUIZ_TYPE, resultId);
      if (!this.isSeqActive(seq)) return;
      if (!res || !res.success || !res.quizResult) {
        this.trackEvent('share_open_fail', {
          reason: 'not_found',
        });
        wx.showToast({ title: (res && res.error) || '结果已失效', icon: 'none' });
        this.loadResultOrDraft();
        return;
      }

      const ownerName = (res.owner && res.owner.nickName) || '好友';
      this.showResult(res.quizResult, false, {
        isSharedView: true,
        sharedOwnerName: ownerName,
        sharedResultId: resultId,
      });
      this.trackEvent('share_open_success', {
        owner_name_len: ownerName.length,
      });
    } catch (err) {
      console.warn('获取分享测评结果失败', err);
      if (!this.isSeqActive(seq)) return;
      this.trackEvent('share_open_fail', { reason: 'network' });
      wx.showToast({ title: '分享内容加载失败', icon: 'none' });
      this.loadResultOrDraft();
    } finally {
      if (this.isSeqActive(seq)) {
        this.setData({ loadingResult: false });
      }
    }
  },

  restoreDraft() {
    const draft = wx.getStorageSync(quizUtil.QUIZ_DRAFT_KEY);
    if (!draft || draft.version !== quizUtil.QUIZ_VERSION) {
      this.setData({ stage: 'intro', hasDraft: false });
      return;
    }

    const answersMap = draft.answersMap || {};
    const pageIndex = Math.max(0, Math.min(Number(draft.pageIndex || 0), this.data.totalPages - 1));

    this.setData({
      stage: 'intro',
      hasDraft: Object.keys(answersMap).length > 0,
      answersMap,
      pageIndex,
    });
  },

  persistDraft() {
    if (this.data.stage !== 'answering') return;
    const draft = {
      version: quizUtil.QUIZ_VERSION,
      answersMap: this.data.answersMap || {},
      pageIndex: this.data.pageIndex || 0,
      updatedAt: Date.now(),
    };
    wx.setStorageSync(quizUtil.QUIZ_DRAFT_KEY, draft);
  },

  clearDraft() {
    try {
      wx.removeStorageSync(quizUtil.QUIZ_DRAFT_KEY);
    } catch (err) {
      console.warn('清理测评草稿失败', err);
    }
  },

  startQuiz() {
    this.cancelPendingLoad();
    this.trackEvent('start', {
      from_shared: this.data.isSharedView ? 1 : 0,
    });
    this.setData({
      stage: 'answering',
      pageIndex: 0,
      answersMap: {},
      result: null,
      dimensionScoreList: [],
      hasDraft: false,
      reportSaved: false,
      pendingSavedResult: null,
      hasSavedResult: false,
      isSharedView: false,
      sharedOwnerName: '',
      sharedResultId: '',
    }, () => this.syncPageState());
  },

  continueDraft() {
    this.cancelPendingLoad();
    const draft = wx.getStorageSync(quizUtil.QUIZ_DRAFT_KEY);
    if (!draft || draft.version !== quizUtil.QUIZ_VERSION) {
      this.startQuiz();
      return;
    }

    const answersMap = draft.answersMap || {};
    const pageIndex = Math.max(0, Math.min(Number(draft.pageIndex || 0), this.data.totalPages - 1));

    this.setData({
      stage: 'answering',
      pageIndex,
      answersMap,
      result: null,
      dimensionScoreList: [],
      hasDraft: false,
      reportSaved: false,
      isSharedView: false,
      sharedOwnerName: '',
      sharedResultId: '',
    }, () => this.syncPageState());

    this.trackEvent('continue_draft', {
      answered_count: Object.keys(answersMap).length,
    });
  },

  syncPageState() {
    const { questions, pageIndex, questionsPerPage, answersMap, totalPages } = this.data;
    const start = pageIndex * questionsPerPage;
    const end = start + questionsPerPage;
    const currentQuestions = questions.slice(start, end);

    const answeredCount = questions.reduce((count, q) => (answersMap[q.id] ? count + 1 : count), 0);
    const progressPercent = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;

    this.setData({
      currentQuestions,
      answeredCount,
      progressPercent,
      isLastPage: pageIndex >= totalPages - 1,
    });

    this.persistDraft();
  },

  chooseOption(e) {
    const questionId = Number(e.currentTarget.dataset.id || 0);
    const optionKey = e.currentTarget.dataset.option;
    if (!questionId || !optionKey) return;

    const answersMap = Object.assign({}, this.data.answersMap, {
      [questionId]: optionKey,
    });

    this.setData({ answersMap }, () => this.syncPageState());
  },

  goPrevPage() {
    if (this.data.pageIndex <= 0) return;
    this.setData({ pageIndex: this.data.pageIndex - 1 }, () => this.syncPageState());
  },

  goNextPage() {
    if (this.data.pageIndex >= this.data.totalPages - 1) return;
    const nextPage = this.data.pageIndex + 1;
    this.setData({ pageIndex: nextPage }, () => this.syncPageState());
    this.trackEvent('page_next', { page_index: nextPage + 1 });
  },

  async submitQuiz() {
    const total = this.data.questions.length;
    const answeredCount = this.data.answeredCount;
    if (answeredCount < total) {
      const unanswered = this.data.questions.find((q) => !this.data.answersMap[q.id]);
      const unansweredIndex = unanswered
        ? this.data.questions.findIndex((q) => q && q.id === unanswered.id)
        : -1;
      const targetPage = unansweredIndex >= 0
        ? Math.floor(unansweredIndex / QUESTIONS_PER_PAGE)
        : this.data.pageIndex;
      this.setData({ pageIndex: targetPage }, () => this.syncPageState());
      wx.showToast({ title: `还有${total - answeredCount}题未完成`, icon: 'none' });
      this.trackEvent('submit_incomplete', {
        missing_count: total - answeredCount,
      });
      return;
    }

    this.trackEvent('submit', { total_questions: total });

    const result = quizUtil.evaluateQuiz(this.data.answersMap);
    const displayed = await this.gateAndShowResult(result, false, {
      confirmBeforeAd: true,
      source: 'submit',
    });
    if (!displayed) return;

    this.trackEvent('complete', {
      total_score: Number(result.totalScore || 0),
      role_key: String(result.role && result.role.key || ''),
    });

    this.clearDraft();

    try {
      const saveRes = await cloudSync.saveQuizResult(result, QUIZ_TYPE);
      const savedResult = (saveRes && saveRes.quizResult) || result;
      this.showResult(savedResult, true);
      this.trackEvent('save_success');
    } catch (err) {
      console.warn('保存双十一测评报告失败', err);
      wx.showToast({ title: '报告已生成，云端保存失败', icon: 'none' });
      this.trackEvent('save_fail');
    }
  },

  buildResultToken(result) {
    if (!result) return '';
    const dims = ['A', 'B', 'C', 'D', 'E']
      .map((key) => Number(result.dimensionScores && result.dimensionScores[key] && result.dimensionScores[key].score || 0).toFixed(1))
      .join('-');
    return [
      result.version || quizUtil.QUIZ_VERSION,
      String(result.role && result.role.key || ''),
      Number(result.totalScore || 0),
      dims,
    ].join('_');
  },

  hasAdPassForResult(result) {
    const token = this.buildResultToken(result);
    if (!token) return false;
    const stored = String(wx.getStorageSync(QUIZ_RESULT_AD_PASS_TOKEN_KEY) || '');
    return stored === token;
  },

  markAdPassForResult(result) {
    const token = this.buildResultToken(result);
    if (!token) return;
    wx.setStorageSync(QUIZ_RESULT_AD_PASS_TOKEN_KEY, token);
  },

  watchResultAd() {
    this.trackEvent('ad_start');
    return new Promise((resolve, reject) => {
      if (typeof wx.createRewardedVideoAd !== 'function') {
        reject(new Error('UNSUPPORTED_REWARDED_AD'));
        return;
      }

      const rewardedVideoAd = wx.createRewardedVideoAd({ adUnitId: VIEW_RESULT_AD_UNIT_ID });

      const onClose = (res) => {
        rewardedVideoAd.offClose(onClose);
        rewardedVideoAd.offError(onError);
        this.trackEvent('ad_close', { completed: res && res.isEnded ? 1 : 0 });
        resolve(!!(res && res.isEnded));
      };

      const onError = () => {
        rewardedVideoAd.offClose(onClose);
        rewardedVideoAd.offError(onError);
        this.trackEvent('ad_fail');
        reject(new Error('AD_LOAD_FAIL'));
      };

      rewardedVideoAd.onClose(onClose);
      rewardedVideoAd.onError(onError);

      rewardedVideoAd.show()
        .catch(() => rewardedVideoAd.load().then(() => rewardedVideoAd.show()))
        .catch(() => {
          rewardedVideoAd.offClose(onClose);
          rewardedVideoAd.offError(onError);
          this.trackEvent('ad_fail');
          reject(new Error('AD_LOAD_FAIL'));
        });
    });
  },

  confirmAdBeforeWatch(source = '') {
    return new Promise((resolve) => {
      wx.showModal({
        title: '查看测评结果',
        content: '查看结果前需要先观看一次激励广告，是否继续？',
        confirmText: '继续查看',
        cancelText: '取消',
        success: (res) => {
          const confirmed = !!(res && res.confirm);
          this.trackEvent(confirmed ? 'ad_prompt_confirm' : 'ad_prompt_cancel', {
            source,
          });
          resolve(confirmed);
        },
        fail: () => {
          this.trackEvent('ad_prompt_fail', { source });
          resolve(false);
        },
      });
    });
  },

  async gateAndShowResult(result, savedFromCloud, options = {}) {
    if (!result) return false;

    if (!this.hasAdPassForResult(result)) {
      if (options.confirmBeforeAd) {
        const confirmed = await this.confirmAdBeforeWatch(options.source || '');
        if (!confirmed) {
          wx.showToast({ title: '已取消查看结果', icon: 'none' });
          return false;
        }
      }

      try {
        const watched = await this.watchResultAd();
        if (!watched) {
          wx.showToast({ title: '需完整观看广告后查看结果', icon: 'none' });
          this.trackEvent('ad_incomplete');
          return false;
        }
        this.markAdPassForResult(result);
        this.trackEvent('ad_pass');
      } catch (err) {
        if (err && err.message === 'UNSUPPORTED_REWARDED_AD') {
          wx.showToast({ title: '当前版本不支持激励广告', icon: 'none' });
          this.trackEvent('ad_unsupported');
          return false;
        }
        wx.showToast({ title: '广告资源加载失败，请稍后重试', icon: 'none' });
        this.trackEvent('ad_fail');
        return false;
      }
    }

    wx.setStorageSync(quizUtil.QUIZ_DONE_KEY, 1);
    this.showResult(result, savedFromCloud);
    return true;
  },

  async viewSavedResultWithAd() {
    const result = this.data.pendingSavedResult;
    if (!result) {
      wx.showToast({ title: '暂无可查看的报告', icon: 'none' });
      return;
    }
    this.trackEvent('view_saved_result');
    await this.gateAndShowResult(result, true);
  },

  getShareResultId() {
    if (this.data.isSharedView) {
      return String(this.data.sharedResultId || '');
    }
    const result = this.data.result || {};
    return String(result.resultId || '');
  },

  hintShareUnavailable() {
    wx.showToast({ title: '当前结果不可分享', icon: 'none' });
  },

  showResult(result, savedFromCloud, extra = {}) {
    if (!result) return;
    const isSharedView = !!extra.isSharedView;
    const dimensionScores = result.dimensionScores || {};
    const dimensionScoreList = ['A', 'B', 'C', 'D', 'E']
      .map((key) => dimensionScores[key])
      .filter(Boolean);

    this.setData({
      stage: 'result',
      result,
      dimensionScoreList,
      progressPercent: 100,
      reportSaved: isSharedView ? false : !!savedFromCloud,
      hasSavedResult: isSharedView ? false : !!savedFromCloud,
      pendingSavedResult: isSharedView ? null : (savedFromCloud ? result : null),
      isSharedView,
      sharedOwnerName: extra.sharedOwnerName || '',
      sharedResultId: extra.sharedResultId || result.resultId || '',
    }, () => {
      wx.nextTick(() => this.drawRadar());
    });
  },

  drawRadar() {
    const result = this.data.result;
    if (!result || !Array.isArray(result.radar) || !result.radar.length) return;

    const size = this.data.radarCanvasSize;
    const center = size / 2;
    const radius = size * 0.3;
    const levels = 5;
    const maxValue = 25;
    const labels = result.indicators || quizUtil.RADAR_INDICATORS;

    const ctx = wx.createCanvasContext('radarCanvas', this);

    ctx.setFillStyle('#FFFFFF');
    ctx.fillRect(0, 0, size, size);

    for (let level = 1; level <= levels; level += 1) {
      const r = (radius * level) / levels;
      ctx.beginPath();
      for (let i = 0; i < 5; i += 1) {
        const angle = -Math.PI / 2 + (Math.PI * 2 * i) / 5;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.setStrokeStyle(level === levels ? '#D9C6A3' : '#EFE5D3');
      ctx.setLineWidth(1);
      ctx.stroke();
    }

    for (let i = 0; i < 5; i += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * i) / 5;
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(x, y);
      ctx.setStrokeStyle('#E6D8BD');
      ctx.setLineWidth(1);
      ctx.stroke();

      const labelRadius = radius + 28;
      const lx = center + labelRadius * Math.cos(angle);
      const ly = center + labelRadius * Math.sin(angle);
      ctx.setFillStyle('#7D684A');
      ctx.setFontSize(11);
      ctx.setTextAlign('center');
      ctx.fillText(labels[i], lx, ly);
    }

    const points = result.radar.map((value, i) => {
      const rate = Math.max(0, Math.min(1, Number(value || 0) / maxValue));
      const angle = -Math.PI / 2 + (Math.PI * 2 * i) / 5;
      return {
        x: center + radius * rate * Math.cos(angle),
        y: center + radius * rate * Math.sin(angle),
      };
    });

    ctx.beginPath();
    points.forEach((point, idx) => {
      if (idx === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.setFillStyle('rgba(230, 179, 78, 0.25)');
    ctx.fill();
    ctx.setStrokeStyle('#E6B34E');
    ctx.setLineWidth(2);
    ctx.stroke();

    points.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
      ctx.setFillStyle('#D68E1B');
      ctx.fill();
    });

    ctx.draw();
  },

  async saveReportToCloud() {
    if (this.data.isSharedView) return;
    if (!this.data.result) return;
    try {
      const saveRes = await cloudSync.saveQuizResult(this.data.result, QUIZ_TYPE);
      const savedResult = (saveRes && saveRes.quizResult) || this.data.result;
      this.showResult(savedResult, true);
      wx.showToast({ title: '报告已保存', icon: 'success' });
      this.trackEvent('save_success');
    } catch (err) {
      console.warn('保存双十一测评报告失败', err);
      wx.showToast({ title: '保存失败，请稍后重试', icon: 'none' });
      this.trackEvent('save_fail');
    }
  },

  async clearSavedReport() {
    if (this.data.isSharedView) return;
    wx.showModal({
      title: '删除测评记录',
      content: '删除后将清空云端保存的测评报告，是否继续？',
      confirmText: '删除',
      confirmColor: '#d54343',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await cloudSync.saveQuizResult(null, QUIZ_TYPE);
          wx.removeStorageSync(quizUtil.QUIZ_DONE_KEY);
          wx.removeStorageSync(QUIZ_RESULT_AD_PASS_TOKEN_KEY);
          this.setData({
            reportSaved: false,
            hasSavedResult: false,
            pendingSavedResult: null,
            sharedResultId: '',
          });
          wx.showToast({ title: '已删除', icon: 'success' });
          this.trackEvent('clear_success');
        } catch (err) {
          console.warn('删除测评报告失败', err);
          wx.showToast({ title: '删除失败，请稍后重试', icon: 'none' });
          this.trackEvent('clear_fail');
        }
      },
    });
  },

  restartQuiz() {
    this.startQuiz();
  },

  openEntry(e) {
    const label = String(e.currentTarget.dataset.label || '');
    if (!label) return;

    if (label.includes('存钱计划') || label.includes('存钱目标')) {
      wx.navigateTo({ url: '/pages/plan-add/plan-add' });
      return;
    }

    if (label.includes('省钱挑战') || label.includes('挑战')) {
      wx.navigateTo({ url: '/pages/saving-challenge-create/saving-challenge-create' });
      return;
    }

    if (label.includes('记账')) {
      wx.switchTab({ url: '/pages/light-ledger/index' });
      return;
    }

    if (label.includes('消费评估') || label.includes('冷静')) {
      wx.navigateTo({ url: '/pages/consumption-cooling/index' });
      return;
    }

    wx.showToast({ title: '入口即将上线', icon: 'none' });
  },

  backHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  onShareAppMessage() {
    const result = this.data.result;
    const title = result
      ? `${result.role.name}｜${result.slogan}`
      : '双十一消费角色自测，测测你的消费五维雷达图';

    const resultId = this.getShareResultId();
    if (!resultId && result) {
      this.trackEvent('share_trigger_fail', { reason: 'no_result_id' });
    } else {
      this.trackEvent('share_trigger', { channel: 'app_message' });
    }
    const path = resultId
      ? `/pages/double11-quiz/double11-quiz?resultId=${resultId}`
      : '/pages/double11-quiz/double11-quiz';

    return {
      title,
      path,
    };
  },

  onShareTimeline() {
    const result = this.data.result;
    const resultId = this.getShareResultId();
    if (!resultId && result) {
      this.trackEvent('share_trigger_fail', { reason: 'no_result_id_timeline' });
    } else {
      this.trackEvent('share_trigger', { channel: 'timeline' });
    }
    return {
      title: result ? `${result.role.name}｜双十一消费角色报告` : '双十一消费角色自测',
      query: resultId ? `resultId=${resultId}` : '',
    };
  },
});
