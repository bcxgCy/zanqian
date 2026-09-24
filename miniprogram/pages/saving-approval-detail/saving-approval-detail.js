const mockMap = {
  a1: {
    id: 'a1',
    name: '无线耳机',
    price: 599,
    status: '投票中',
    reason: '通勤听歌，想提升体验',
    alternative: '先继续用现有耳机，等双11再看',
    passVotes: 2,
    rejectVotes: 3,
    replies: [
      { id: 'r1', side: '通过', user: '小明', content: '通勤时间长，耳机是高频使用，值得买。' },
      { id: 'r2', side: '驳回', user: '小王', content: '已有可用耳机，提升有限，建议先不买。' },
      { id: 'r3', side: '驳回', user: '小李', content: '预算紧张，先满足更刚需的支出。' },
      { id: 'r4', side: '通过', user: '小陈', content: '如果能提升效率和体验，可以考虑。' },
      { id: 'r5', side: '驳回', user: '小赵', content: '建议先等促销，当前价格偏高。' },
    ],
  },
  a2: {
    id: 'a2',
    name: '咖啡机',
    price: 899,
    status: '冷静中',
    reason: '希望在家自制咖啡',
    alternative: '先手冲+滤杯过渡',
    passVotes: 1,
    rejectVotes: 1,
    replies: [
      { id: 'r21', side: '通过', user: '同事A', content: '如果长期喝咖啡，可能比外面买更省。' },
      { id: 'r22', side: '驳回', user: '同事B', content: '先确定自己能坚持再买机器。' },
    ],
  },
  a3: {
    id: 'a3',
    name: '球鞋',
    price: 699,
    status: '已放弃',
    reason: '款式好看但非刚需',
    alternative: '继续穿现有鞋款',
    passVotes: 0,
    rejectVotes: 3,
    replies: [
      { id: 'r31', side: '驳回', user: '朋友A', content: '功能性差异不大，没必要冲动消费。' },
      { id: 'r32', side: '驳回', user: '朋友B', content: '已有同类型鞋，先省下这笔钱。' },
      { id: 'r33', side: '驳回', user: '朋友C', content: '可等折扣或生日再考虑。' },
    ],
  },
};

Page({
  data: {
    detail: null,
  },

  onLoad(options) {
    const id = options.id;
    const detail = mockMap[id] || mockMap.a1;
    this.setData({ detail });
  },
});
