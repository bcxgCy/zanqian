const quizUtil = require('../../utils/savingPersonaQuiz');
const cloudSync = require('../../utils/cloudSync');
const QUIZ_DONE_KEY = 'saving_quiz_done_v1';

Page({
  data: {
    stage: 'intro', // intro | answering | result
    questions: quizUtil.QUESTIONS,
    questionIndex: 0,
    answers: [],
    progressPercent: 0,
    currentQuestion: null,
    result: null,
    popupImage: quizUtil.QUIZ_POPUP_IMAGE,
    selectedOption: '',
    answeringLocked: false,
  },

  onUnload() {
    clearTimeout(this.nextQuestionTimer);
  },

  onLoad() {
    this.syncCurrentQuestion();
    this.loadLastResult();
  },

  startQuiz() {
    this.setData({
      stage: 'answering',
      questionIndex: 0,
      answers: [],
      progressPercent: 0,
      result: null,
      selectedOption: '',
      answeringLocked: false,
    }, () => this.syncCurrentQuestion());
  },

  syncCurrentQuestion() {
    const { questions, questionIndex } = this.data;
    const currentQuestion = questions[questionIndex] || null;
    const progressPercent = questions.length
      ? Math.round((questionIndex / questions.length) * 100)
      : 0;
    this.setData({ currentQuestion, progressPercent });
  },

  chooseOption(e) {
    const answer = e.currentTarget.dataset.option;
    const { questionIndex, questions, answers, answeringLocked } = this.data;
    if (answeringLocked) return;
    if (!answer || !questions[questionIndex]) return;

    const nextAnswers = answers.slice();
    nextAnswers[questionIndex] = answer;
    this.setData({
      selectedOption: answer,
      answeringLocked: true,
      answers: nextAnswers,
    });

    clearTimeout(this.nextQuestionTimer);
    this.nextQuestionTimer = setTimeout(() => {
      const nextIndex = questionIndex + 1;
      if (nextIndex >= questions.length) {
        const result = quizUtil.evaluateQuiz(nextAnswers);
        wx.setStorageSync(QUIZ_DONE_KEY, 1);
        this.saveResultToCloud(result);
        this.setData({
          stage: 'result',
          answers: nextAnswers,
          progressPercent: 100,
          result,
          selectedOption: '',
          answeringLocked: false,
        });
        return;
      }

      this.setData({
        questionIndex: nextIndex,
        selectedOption: '',
        answeringLocked: false,
      }, () => this.syncCurrentQuestion());
    }, 500);
  },

  loadLastResult() {
    cloudSync.getQuizResult()
      .then((res) => {
        const lastResult = res && res.quizResult;
        if (!lastResult || !lastResult.persona || !lastResult.recommendations) return;
        this.setData({
          stage: 'result',
          result: lastResult,
          progressPercent: 100,
        });
      })
      .catch((err) => {
        console.warn('获取上次测试结果失败', err);
      });
  },

  saveResultToCloud(result) {
    if (!result) return;
    cloudSync.saveQuizResult(result)
      .catch((err) => {
        console.warn('保存测试结果失败', err);
      });
  },

  restartQuiz() {
    this.startQuiz();
  },

  openRecommendedPlan(e) {
    const index = Number(e.currentTarget.dataset.index || 0);
    const result = this.data.result;
    const rec = result && result.recommendations ? result.recommendations[index] : null;
    if (!rec) return;

    const template = quizUtil.buildPlanAddTemplate(rec);
    const templateKey = quizUtil.cachePlanTemplate(wx, template);
    const path = quizUtil.buildPlanAddPath(templateKey);
    wx.navigateTo({ url: path });
  },

  backHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  onShareAppMessage() {
    const result = this.data.result;
    const title = result && result.persona
      ? `测出我是${result.persona.tag}，你也来试试？`
      : '测测你是什么存钱选手✨';

    return {
      title,
      path: '/pages/saving-quiz/saving-quiz',
      imageUrl: quizUtil.QUIZ_SHARE_IMAGE,
    };
  },

  onShareTimeline() {
    const result = this.data.result;
    const title = result && result.persona
      ? `${result.persona.tag}｜测测你的存钱人格`
      : '测测你是什么存钱选手✨';

    return {
      title,
      query: '',
      imageUrl: quizUtil.QUIZ_SHARE_IMAGE,
    };
  },
});
