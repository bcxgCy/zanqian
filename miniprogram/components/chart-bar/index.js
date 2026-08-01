Component({
  properties: {
    data: { type: Array, value: [] },
    color: { type: String, value: '#7ECDA3' },
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
        .select('#barCanvas')
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
          const barW = Math.min(24, chartW / data.length - 4);
          const gap = (chartW - barW * data.length) / (data.length + 1);
          ctx.fillStyle = '#A8BDB2';
          ctx.font = '10px sans-serif';
          ctx.fillText('¥' + maxVal, 2, padding.top + 8);
          data.forEach((item, i) => {
            const h = (item.value / maxVal) * chartH;
            const x = padding.left + gap + i * (barW + gap);
            const y = padding.top + chartH - h;
            ctx.fillStyle = this.properties.color;
            ctx.fillRect(x, y, barW, h);
            if (data.length <= 10) {
              ctx.fillStyle = '#A8BDB2';
              ctx.fillText(item.label, x, height - 8);
            }
          });
        });
    },
  },
});
