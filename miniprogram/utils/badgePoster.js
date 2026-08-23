function drawBadgeSharePoster(page, options) {
  const opts = Object.assign({
    canvasId: 'badgePosterCanvas',
    width: 750,
    height: 1200,
    nickName: '存钱达人',
    badge: null,
  }, options || {});

  if (!opts.badge || !opts.badge.image) {
    return Promise.reject(new Error('badge image missing'));
  }

  return new Promise((resolve, reject) => {
    const ctx = wx.createCanvasContext(opts.canvasId, page);
    const width = opts.width;
    const height = opts.height;
    const centerX = width / 2;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#F6FAFF');
    gradient.addColorStop(1, '#FFFFFF');
    ctx.setFillStyle(gradient);
    ctx.fillRect(0, 0, width, height);

    ctx.setFillStyle('#165DFF');
    ctx.setFontSize(38);
    ctx.setTextAlign('center');
    ctx.fillText('我解锁了新徽章', centerX, 120);

    ctx.setFillStyle('#1D2129');
    ctx.setFontSize(52);
    ctx.fillText('「' + opts.badge.name + '」', centerX, 200);

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, 470, 168, 0, 2 * Math.PI);
    ctx.clip();
    ctx.drawImage(opts.badge.image, centerX - 168, 302, 336, 336);
    ctx.restore();

    ctx.setStrokeStyle('rgba(212,175,55,0.5)');
    ctx.setLineWidth(12);
    ctx.beginPath();
    ctx.arc(centerX, 470, 176, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.setFillStyle('#4E5969');
    ctx.setFontSize(30);
    ctx.fillText(opts.badge.slogan || '坚持存钱，慢慢变富', centerX, 690);

    ctx.setFillStyle('#86909C');
    ctx.setFontSize(24);
    ctx.fillText('来自 ' + (opts.nickName || '存钱达人') + ' 的成就分享', centerX, 760);
    ctx.fillText('坚持存钱，慢慢变富，一起来打卡攒钱吧～', centerX, 810);

    ctx.setFillStyle('#165DFF');
    ctx.setFontSize(26);
    ctx.fillText('心愿存钱小程序', centerX, 1020);

    ctx.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId: opts.canvasId,
        width,
        height,
        destWidth: width,
        destHeight: height,
        success: (res) => resolve(res.tempFilePath),
        fail: (err) => reject(err),
      }, page);
    });
  });
}

module.exports = {
  drawBadgeSharePoster,
};
