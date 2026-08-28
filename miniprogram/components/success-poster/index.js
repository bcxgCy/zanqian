/**
 * 打卡成功弹窗组件
 * 功能：展示打卡成功信息、生成成就海报、引导分享
 */
const money = require('../../utils/money');

Component({
  properties: {
    show: { type: Boolean, value: false }, // 控制显示/隐藏
    plan: { type: Object, value: null }, // 当前计划数据
    savedAmount: { type: Number, value: 0 }, // 本次存入金额
    consecutiveDays: { type: Number, value: 0 }, // 连续打卡天数
  },

  data: {
    posterUrl: '', // 导出后的海报临时路径
    isDrawing: false, // 绘制中状态锁
    drawError: null, // 绘制错误信息
    _forceHide: false, // 强制隐藏（无动画）
    _hasDrawn: false, // 是否已完成过一次绘制（防止重复绘制）
  },

  observers: {
    'show, plan': function (show, plan) {
      // 关闭时重置绘制状态
      if (!show) {
        this.setData({ _hasDrawn: false });
        return;
      }
      // 只在首次显示或手动触发时绘制，避免 plan 属性变化导致重复绘制
      if (plan && !this.data._hasDrawn) {
        this.drawPoster();
      }
    },
  },

  lifetimes: {
    detached() {
      // 清理定时器
      if (this._drawTimer) {
        clearTimeout(this._drawTimer);
      }
    },
  },

  methods: {
    /**
     * 阻止事件冒泡（空方法）
     */
    preventTouchMove() {},

    /**
     * 点击遮罩层关闭
     */
    onMaskTap() {
      this.onClose();
    },

    /**
     * 关闭弹窗（无动画，立即隐藏）
     */
    onClose() {
      this.triggerEvent('close');
    },

    /**
     * 绘制海报 - 主入口
     */
    drawPoster() {
      if (this.data.isDrawing) return;

      // 如果已经绘制完成过，不再重复清空和重绘
      if (this.data._hasDrawn && this.data.posterUrl) {
        console.log('[success-poster] 海报已存在，跳过重复绘制');
        return;
      }

      this.setData({ isDrawing: true, posterUrl: '', drawError: null });

      // 延迟一帧确保 DOM 已渲染
      this._drawTimer = setTimeout(() => {
        this._initCanvasAndDraw();
      }, 100);
    },

    /**
     * 初始化 Canvas 并开始绘制
     */
    _initCanvasAndDraw() {
      console.log('[success-poster] 开始初始化 Canvas...');

      const query = this.createSelectorQuery();
      query
        .select('#posterCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          console.log('[success-poster] Canvas 查询结果:', res);

          if (!res || !res[0]) {
            console.error('[success-poster] Canvas 元素未找到');
            this.setData({ isDrawing: false, drawError: 'Canvas 初始化失败，请重试' });
            return;
          }

          if (!res[0].node) {
            console.error('[success-poster] Canvas node 不存在');
            this.setData({ isDrawing: false, drawError: 'Canvas 节点获取失败' });
            return;
          }

          const canvas = res[0].node;
          let ctx;

          try {
            ctx = canvas.getContext('2d');
          } catch (ctxErr) {
            console.error('[success-poster] 获取 Context 失败', ctxErr);
            this.setData({ isDrawing: false, drawError: '绘图上下文创建失败' });
            return;
          }

          const dpr = wx.getSystemInfoSync().pixelRatio;
          console.log('[success-poster] DPR:', dpr);

          // 设置高清画布尺寸（紧凑版）
          const width = 480; // 逻辑宽度（缩小）
          const height = 560; // 逻辑高度（大幅缩小）

          try {
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.scale(dpr, dpr);
          } catch (scaleErr) {
            console.error('[success-poster] 设置画布尺寸失败', scaleErr);
            this.setData({ isDrawing: false, drawError: '画布初始化失败' });
            return;
          }

          console.log('[success-poster] 画布准备完成，开始绘制...', {
            plan: this.data.plan?.name,
            savedAmount: this.data.savedAmount,
            consecutiveDays: this.data.consecutiveDays,
          });

          // 使用 async 绘制（确保在下一个微任务中执行）
          setTimeout(() => {
            this._doDraw(canvas, ctx, width, height);
          }, 50);
        });
    },

    /**
     * 执行实际绘制操作
     */
    _doDraw(canvas, ctx, width, height) {
      try {
        // 按顺序绘制各部分
        this._drawBackground(ctx, width, height);
        console.log('[success-poster] ✅ 背景绘制完成');

        this._drawHeader(ctx, width, this.data.plan);
        console.log('[success-poster] ✅ 头部绘制完成');

        this._drawProgressRing(ctx, width / 2, 220, 72, this.data.plan); // 缩小圆环
        console.log('[success-poster] ✅ 进度环绘制完成');

        this._drawStatsCards(ctx, width, 320, this.data.plan, this.data.consecutiveDays); // 上移卡片
        console.log('[success-poster] ✅ 数据卡片绘制完成');

        this._drawFooter(ctx, width, height, this.data.savedAmount);
        console.log('[success-poster] ✅ 底部绘制完成');

        // 异步导出为临时图片
        this._exportPoster(canvas, width, height);
      } catch (err) {
        console.error('[success-poster] 海报绘制过程出错', err);
        this.setData({ isDrawing: false, drawError: '海报绘制失败: ' + (err.message || '未知错误') });
      }
    },

    /**
     * 导出海报为图片
     */
    _exportPoster(canvas, width, height) {
      console.log('[success-poster] 开始导出图片...');

      wx.canvasToTempFilePath({
        canvas,
        width,
        height,
        destWidth: width * 3, // 3倍图保证清晰度
        destHeight: height * 3,
        fileType: 'png',
        quality: 1,
        success: (res) => {
          console.log('[success-poster] ✅ 图片导出成功', res.tempFilePath);
          this.setData({ posterUrl: res.tempFilePath, isDrawing: false, _hasDrawn: true });
        },
        fail: (err) => {
          console.error('[success-poster] ❌ 图片导出失败', err);
          this.setData({
            isDrawing: false,
            drawError: '图片导出失败: ' + (err.errMsg || '未知错误'),
          });
        },
      }, this); // 重要：传入组件实例
    },

    // ==================== 绘制方法 ====================

    /**
     * 绘制背景渐变
     */
    _drawBackground(ctx, w, h) {
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, '#165DFF');
      gradient.addColorStop(0.5, '#36BFFA');
      gradient.addColorStop(1, '#E8F7FF');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    },

    /**
     * 绘制头部信息（计划名+目标）- 紧凑版
     */
    _drawHeader(ctx, w, plan) {
      const name = plan.name || '我的存钱计划';
      const icon = plan.icon || '🎯';

      // 计划图标 + 名称
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`${icon} ${name}`, w / 2, 48);

      // 目标金额
      const target = money.toMoney(plan.targetAmount);
      ctx.font = '20px sans-serif';
      ctx.globalAlpha = 0.9;
      ctx.fillText(`目标 ¥${target}`, w / 2, 82);
      ctx.globalAlpha = 1;
    },

    /**
     * 绘制进度圆环
     */
    _drawProgressRing(ctx, cx, cy, radius, plan) {
      const inner = radius * 0.65;
      const progress = this._calcProgress(plan);
      const lineWidth = radius - inner;

      // 背景环
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, (radius + inner) / 2, 0, Math.PI * 2);
      ctx.stroke();

      // 进度环
      if (progress > 0) {
        ctx.strokeStyle = '#D4AF37'; // 金色强调
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy, (radius + inner) / 2, -Math.PI / 2, -Math.PI / 2 + (progress / 100) * Math.PI * 2);
        ctx.stroke();
      }

      // 中心文字 - 百分比（紧凑版）
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(progress)}%`, cx, cy - 6);

      // 中心文字 - 标签
      ctx.font = '16px sans-serif';
      ctx.globalAlpha = 0.9;
      ctx.fillText('已完成', cx, cy + 24);
      ctx.globalAlpha = 1;
    },

    /**
     * 统计数据卡片（已存入 + 连续天数）- 紧凑版
     */
    _drawStatsCards(ctx, w, y, plan, consecutiveDays) {
      const cardW = 200; // 缩小宽度
      const cardH = 88; // 缩小高度
      const gap = 20; // 缩小间距
      const startX = (w - cardW * 2 - gap) / 2;

      // 计算已存入金额
      let savedTotal = 0;
      if (plan.periods) {
        savedTotal = plan.periods.reduce((sum, p) => sum + (p.savedAmount || 0), 0);
      }
      savedTotal = money.toMoney(savedTotal);

      // 已存入卡片
      this._drawCard(ctx, startX, y, cardW, cardH, '已存入', `¥${savedTotal}`, '#00B42A');

      // 连续天数卡片
      this._drawCard(ctx, startX + cardW + gap, y, cardW, cardH, '连续打卡', `${consecutiveDays} 天`, '#D4AF37');
    },

    /**
     * 绘制单个数据卡片 - 紧凑版
     */
    _drawCard(ctx, x, y, w, h, label, value, color) {
      // 卡片背景（半透明白）
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      this._roundRect(ctx, x, y, w, h, 12); // 缩小圆角
      ctx.fill();

      // 标签
      ctx.fillStyle = '#86909C';
      ctx.font = '18px sans-serif'; // 缩小字体
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, x + w / 2, y + 20);

      // 数值
      ctx.fillStyle = color;
      ctx.font = 'bold 26px sans-serif'; // 缩小字体
      ctx.textBaseline = 'bottom';
      ctx.fillText(value, x + w / 2, y + h - 16);
    },

    /**
     * 绘制底部本次打卡信息 - 紧凑版
     */
    _drawFooter(ctx, w, h, amount) {
      // 底部白色区域（缩小高度）
      ctx.fillStyle = '#FFFFFF';
      this._roundRect(ctx, 0, h - 120, w, 120, 20); // 缩小圆角和高度
      ctx.fill();

      // 分割线
      ctx.strokeStyle = '#E5E6EB';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(16, h - 120);
      ctx.lineTo(w - 16, h - 120);
      ctx.stroke();

      // 本次存入金额（缩小字体）
      const displayAmount = money.toMoney(amount);
      ctx.fillStyle = '#165DFF';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`本次存入 ¥${displayAmount}`, w / 2, h - 88);

      // 日期 + 提示（合并为一行）
      ctx.fillStyle = '#86909C';
      ctx.font = '17px sans-serif';
      const today = new Date();
      const dateStr = `${today.getMonth() + 1}月${today.getDate()}日 · 坚持就是胜利 💪`;
      ctx.fillText(dateStr, w / 2, h - 50);

      ctx.globalAlpha = 1;
    },

    // ==================== 工具方法 ====================

    /**
     * 绘制圆角矩形路径
     */
    _roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    },

    /**
     * 计算计划完成进度百分比
     */
    _calcProgress(plan) {
      if (!plan || !plan.targetAmount) return 0;

      let savedTotal = 0;
      if (plan.periods) {
        savedTotal = plan.periods.reduce((sum, p) => sum + (p.savedAmount || 0), 0);
      }

      const target = money.toMoney(plan.targetAmount);
      if (target <= 0) return 0;

      const progress = (savedTotal / target) * 100;
      return Math.min(Math.max(progress, 0), 100); // 限制在 0-100 范围内
    },

    // ==================== 用户交互 ====================

    /**
     * 保存图片到相册 - 增强版错误处理
     */
    // async saveToAlbum() {
    //   // 检查海报是否已生成
    //   if (!this.data.posterUrl) {
    //     // 如果正在绘制中
    //     if (this.data.isDrawing) {
    //       wx.showToast({ title: '海报生成中，请稍候...', icon: 'none' });
    //       return;
    //     }

    //     // 如果绘制失败了
    //     if (this.data.drawError) {
    //       wx.showModal({
    //         title: '无法保存',
    //         content: this.data.drawError + '\n\n是否重新生成海报？',
    //         confirmText: '重新生成',
    //         success: (res) => {
    //           if (res.confirm) {
    //             this.drawPoster();
    //           }
    //         },
    //       });
    //       return;
    //     }

    //     // 其他情况：海报 URL 为空
    //     console.warn('[saveToAlbum] posterUrl 为空', {
    //       posterUrl: this.data.posterUrl,
    //       isDrawing: this.data.isDrawing,
    //       drawError: this.data.drawError,
    //     });

    //     // 尝试重新生成
    //     wx.showModal({
    //       title: '海报未就绪',
    //       content: '海报图片未准备好，是否重新生成？',
    //       confirmText: '重新生成',
    //       success: (res) => {
    //         if (res.confirm) {
    //           this.drawPoster();
    //         }
    //       },
    //     });
    //     return;
    //   }

    //   console.log('[saveToAlbum] 开始保存图片...', this.data.posterUrl);

    //   wx.showLoading({ title: '保存中...' });

    //   try {
    //     const saveResult = await wx.saveImageToPhotosAlbum({
    //       filePath: this.data.posterUrl,
    //     });

    //     console.log('[saveToAlbum] 保存成功', saveResult);

    //     wx.hideLoading();
    //     wx.showToast({ title: '已保存到相册', icon: 'success' });

    //     // 震动反馈（可选）
    //     wx.vibrateShort({ type: 'light' }).catch(() => {});
    //   } catch (err) {
    //     wx.hideLoading();
    //     console.error('[saveToAlbum] 保存失败详情:', err);

    //     // 错误码处理
    //     const errMsg = err.errMsg || '';

    //     // 隐私协议未声明（常见于开发阶段）
    //     if (errMsg.includes('api scope is not declared') || errMsg.includes('privacy')) {
    //       wx.showModal({
    //         title: '需要配置隐私权限',
    //         content: '保存图片功能需要在小程序后台配置"写入相册"隐私权限。\n\n请联系开发者更新隐私协议配置，或使用"分享给好友"功能代替。',
    //         confirmText: '我知道了',
    //         showCancel: false,
    //       });
    //       return;
    //     }

    //     // 权限被拒绝
    //     if (errMsg.includes('auth deny') || errMsg.includes('authorize')) {
    //       wx.showModal({
    //         title: '需要相册权限',
    //         content: '保存图片需要访问您的相册，请在设置中开启权限后重试。',
    //         confirmText: '去设置',
    //         cancelText: '取消',
    //         success: (res) => {
    //           if (res.confirm) {
    //             wx.openSetting();
    //           }
    //         },
    //       });
    //       return;
    //     }

    //     // 文件不存在或无效
    //     if (errMsg.includes('file not exist') || errMsg.includes('invalid file')) {
    //       wx.showModal({
    //         title: '图片文件异常',
    //         content: '海报文件可能已过期，是否重新生成？',
    //         confirmText: '重新生成',
    //         success: (res) => {
    //           if (res.confirm) {
    //             this.setData({ posterUrl: '', drawError: null });
    //             this.drawPoster();
    //           }
    //         },
    //       });
    //       return;
    //     }

    //     // 其他未知错误
    //     wx.showToast({
    //       title: errMsg.includes('saveImageToPhotosAlbum') ? '保存失败' : (errMsg || '保存失败'),
    //       icon: 'none',
    //       duration: 2000,
    //     });
    //   }
    // },
  },
});
