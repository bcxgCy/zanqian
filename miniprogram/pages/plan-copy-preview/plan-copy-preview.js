/**
 * 复制计划预览页
 * 展示分享的计划模板，用户可选择直接复制或修改后使用
 */

const shareUtil = require('../../utils/share');
const storage = require('../../utils/storage');

Page({
  data: {
    loaded: false,
    expired: false,
    snapshotId: '',
    snapshot: null,
  },

  onLoad(options) {
    console.log('【plan-copy-preview】onLoad options:', options);

    // 尝试多种方式获取快照ID
    let snapshotId = options.snapshotId;

    // 方式1：直接参数
    if (!snapshotId) {
      snapshotId = options.id;
    }

    // 方式2：场景值（扫码进入）
    if (!snapshotId) {
      const scene = options.scene;
      if (scene && typeof scene === 'string' && scene.startsWith('snap_')) {
        snapshotId = scene;
      }
    }

    // 方式3：query 参数
    if (!snapshotId) {
      const q = options.q;
      if (q && typeof q === 'string' && q.startsWith('snap_')) {
        snapshotId = q;
      }
    }

    if (snapshotId) {
      this.snapshotId = snapshotId;
      this.loadSnapshot(snapshotId);
    } else {
      console.warn('【plan-copy-preview】未找到快照ID', options);
      this.setData({ loaded: true, expired: true });
    }
  },

  /**
   * 加载快照数据
   */
  async loadSnapshot(snapshotId) {
    wx.showLoading({ title: '加载中...' });

    try {
      const result = await shareUtil.fetchSnapshotFromCloud(snapshotId);

      wx.hideLoading();

      if (!result.success) {
        // 快照不存在或已过期
        this.setData({
          loaded: true,
          expired: true,
          snapshotId: snapshotId,
        });

        if (result.expired) {
          console.log('快照已过期', snapshotId);
        } else {
          console.error('获取快照失败', result.error);
        }

        return;
      }

      // 检查快照是否有效
      if (!shareUtil.isSnapshotValid(result.snapshot)) {
        this.setData({
          loaded: true,
          expired: true,
          snapshotId: snapshotId,
        });
        return;
      }

      // 补充显示用的类型名称
      const planUtil = require('../../utils/plan');
      let planTypeName = '自定义方案';
      try {
        if (result.snapshot.presetId) {
          const preset = planUtil.getPreset(result.snapshot.presetId);
          planTypeName = preset ? preset.name : '自定义方案';
        } else if (result.snapshot.planType === 'custom_fixed') {
          const freqMap = { day: '每天', week: '每周', month: '每月' };
          const freq = result.snapshot.customConfig?.frequency || 'day';
          const amount = result.snapshot.customConfig?.amountPerPeriod || 0;
          planTypeName = `自定义 · ${freqMap[freq]} ¥${amount}`;
        } else if (result.snapshot.planType === 'custom_deadline') {
          planTypeName = '自定义 · 按结束时间';
        }
      } catch (e) {
        // 使用默认值
      }

      this.setData({
        loaded: true,
        expired: false,
        snapshotId: snapshotId,
        snapshot: Object.assign({}, result.snapshot, { planTypeName }),
      });
    } catch (err) {
      wx.hideLoading();
      console.error('加载快照异常', err);
      this.setData({ loaded: true, expired: true });
    }
  },

  /**
   * 直接使用 - 一键复制创建
   */
  async onCopyDirectly() {
    const { snapshot } = this.data;

    wx.showLoading({ title: '正在创建...' });

    try {
      const result = await shareUtil.copyPlanDirectly(snapshot);

      wx.hideLoading();

      if (!result.success) {
        wx.showToast({
          title: result.error || '创建失败',
          icon: 'none',
        });
        return;
      }

      // 记录复制成功事件（统计埋点）
      try {
        await shareUtil.recordCopySuccess(this.snapshotId, false);
      } catch (e) {
        // 统计失败不影响主流程
        console.warn('记录复制统计失败', e);
      }

      wx.showModal({
        title: '✅ 复制成功！',
        content: '已为你创建全新攒钱计划，初始金额为 0，进度 0%。',
        confirmText: '查看计划',
        cancelText: '返回首页',
        success: (res) => {
          if (res.confirm && result.plan) {
            // 跳转到详情页
            const planId = result.plan.id || result.plan._id;
            if (planId) {
              wx.redirectTo({
                url: `/pages/plan-detail/plan-detail?id=${planId}`,
              });
            } else {
              wx.switchTab({ url: '/pages/index/index' });
            }
          } else {
            wx.navigateBack();
          }
        },
      });
    } catch (err) {
      wx.hideLoading();
      console.error('复制计划失败', err);
      wx.showToast({ title: '创建失败', icon: 'none' });
    }
  },

  /**
   * 修改后再用 - 跳转新建页面并回填配置
   */
  onCopyAndModify() {
    const { snapshot } = this.data;

    if (!snapshot) {
      wx.showToast({ title: '模板数据异常', icon: 'none' });
      return;
    }

    // 将快照配置缓存到本地，供新建页面读取
    const cacheKey = 'copy_template_' + Date.now();
    try {
      wx.setStorageSync(cacheKey, snapshot);

      // 跳转到新建页面，携带缓存键
      wx.navigateTo({
        url: `/pages/plan-add/plan-add?templateKey=${cacheKey}`,
      });
    } catch (err) {
      console.error('缓存模板失败', err);
      wx.showToast({ title: '准备失败', icon: 'none' });
    }
  },

  /**
   * 创建我的存钱计划（快照失效时的兜底）
   */
  goCreatePlan() {
    wx.navigateTo({
      url: '/pages/plan-add/plan-add',
    });
  },
});
