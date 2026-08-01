Component({
  properties: {
    data: { type: Array, value: [] },
    color: { type: String, value: '#8ECAE6' },
    height: { type: Number, value: 200 },
  },
  observers: {
    data() {
      this.draw();
    },
  },
  lifetimes: {
    ready() {
      this.draw();
    },
  },
  methods: {
    draw() {
      const data = this.properties.data || [];
      if (!data.length) return;
      const query = this.createSelectorQuery();
      query
        .select('#lineCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) return;
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr = wx.getSystemInfoSync().pixelRatio;
          const width = res[0].width;
          const height = res[0].height;
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.scale(dpr, dpr);
          ctx.clearRect(0, 0, width, height);
          const maxVal = Math.max(...data.map((d) => d.value), 1);
          const padding = { left: 36, right: 12, top: 12, bottom: 28 };
          const chartW = width - padding.left - padding.right;
          const chartH = height - padding.top - padding.bottom;
          const points = data.map((item, i) => ({
            x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
            y: padding.top + chartH - (item.value / maxVal) * chartH,
          }));
          ctx.strokeStyle = '#E5F0EA';
          ctx.beginPath();
          ctx.moveTo(padding.left, padding.top + chartH);
          ctx.lineTo(padding.left + chartW, padding.top + chartH);
          ctx.stroke();
          ctx.strokeStyle = this.properties.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.stroke();
          ctx.fillStyle = this.properties.color;
          points.forEach((p) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fill();
          });
        });
    },
  },
});
