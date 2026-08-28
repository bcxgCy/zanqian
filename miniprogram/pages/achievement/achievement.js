/**
 * 打卡成就展示页
 *
 * 好友点击海报分享卡片后进入的页面
 * 展示打卡成就数据，引导好友参与攒钱计划
 */
const dateUtil = require('../../utils/date');
const money = require('../../utils/money');

Page({
  data: {
    loaded: false,

    // 成就数据（从 URL 参数获取）
    nickname: '', // 昵称（脱敏）
    planIcon: '',
    planName: '',
    targetAmount: 0,
    savedAmount: 0,
    savedAmountThisTime: 0,
    progress: 0,
    consecutiveDays: 0,
    checkinDate: '',

    // 交互状态
    liked: false,
    likeCount: 0,

    // 动态文案（计算属性）
    _milestoneText: '',
    _encourageText: '',
  },

  onLoad(options) {
    console.log('[achievement] 页面参数', options);

    // 从 URL 参数解析数据
    const data = {
      nickname: decodeURIComponent(options.nickname || '存钱达人'),
      planIcon: decodeURIComponent(options.planIcon || '🎯'),
      planName: decodeURIComponent(options.planName || '我的存钱计划'),
      targetAmount: money.toMoney(options.targetAmount || 0),
      savedAmount: money.toMoney(options.savedAmount || 0),
      savedAmountThisTime: money.toMoney(options.savedAmountThisTime || 0),
      progress: Math.min(Math.max(Number(options.progress || 0), 0), 100),
      consecutiveDays: Number(options.consecutiveDays || 0),
      checkinDate: options.checkinDate || dateUtil.today(),
      likeCount: Math.floor(Math.random() * 50) + 10, // 模拟点赞数
    };

    // 计算动态文案
    data._milestoneText = this._getMilestoneText(data.consecutiveDays);
    data._encourageText = this._getEncourageText(data.consecutiveDays);

    this.setData({ ...data, loaded: true });
  },

  /**
   * 获取里程碑文案
   */
  _getMilestoneText(days) {
    if (days >= 100) return '💎 百日达人！坚持就是胜利';
    if (days >= 30) return '🏆 坚持一个月，习惯已养成';
    if (days >= 21) return '✨ 21天养成一个习惯';
    if (days >= 14) return '🔥 两周不间断，太棒了';
    if (days >= 7) return '⭐ 连续一周，继续保持';
    if (days >= 3) return '👍 良好的开始，加油';
    if (days >= 1) return '🌱 迈出第一步，未来可期';
    return '🎯 开始攒钱之旅';
  },

  /**
   * 获取鼓励文案
   */
  _getEncourageText(days) {
    const texts = [
      '每一分坚持，都是对未来更好的自己 💪',
      '积少成多，你也可以做到 ✨',
      '加入我们，一起养成理财好习惯 🌟',
      '今天最好的开始时间就是现在 🚀',
    ];

    // 根据天数选择不同文案
    if (days >= 30) {
      return `TA 已坚持 ${days} 天！你准备好开始自己的攒钱计划了吗？`;
    }

    return texts[Math.floor(Math.random() * texts.length)];
  },

  /**
   * 点击「我也要参与」按钮
   */
  onJoinTap() {
    // 引导用户到首页或新建计划页
    wx.showModal({
      title: '🚀 开启你的攒钱计划',
      content: '立即创建属于你的存钱计划，和好友一起坚持！',
      confirmText: '去创建',
      cancelText: '先逛逛',
      success: (res) => {
        if (res.confirm) {
          // 跳转到新建计划页
          wx.navigateTo({
            url: '/pages/plan-add/plan-add',
          });
        } else {
          // 跳转到首页
          wx.switchTab({
            url: '/pages/index/index',
          });
        }
      },
    });
  },

  /**
   * 点击「为TA点赞」按钮
   */
  onLikeTap() {
    if (this.data.liked) {
      // 已点赞，取消
      this.setData({
        liked: false,
        likeCount: this.data.likeCount - 1,
      });
      wx.showToast({ title: '已取消点赞', icon: 'none' });
      return;
    }

    // 点赞
    this.setData({
      liked: true,
      likeCount: this.data.likeCount + 1,
    });

    // 点赞动效反馈
    wx.vibrateShort({ type: 'light' });
    wx.showToast({ title: '❤️ 为TA加油', icon: 'none' });
  },

  /**
   * 分享给更多好友
   */
  onShareAppMessage() {
    const { planName, consecutiveDays } = this.data;

    return {
      title: `🎉 我的朋友「${planName}」已连续坚持 ${consecutiveDays} 天`,
      path: `/pages/index/index`, // 分享首页，引导下载使用
      imageUrl: '',
    };
  },
});
