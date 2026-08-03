Component({
  properties: {
    data: { type: Array, value: [] },
    total: { type: Number, value: 0 },
    height: { type: Number, value: 220 },
  },
  observers: {
    'data, total'() {
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
      const query = this.createSelectorQuery();
      query
        .select('#ringCanvas')
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
          const cx = width / 2;
          const cy = height / 2;
          const radius = Math.min(width, height) / 2 - 20;
          const inner = radius * 0.62;
          const colors = ['#9ADFD6', '#FFD4E8', '#C8E8FA', '#B8EDE7', '#F0FAF8', '#D4F0EC'];
          const total = data.reduce((s, d) => s + d.value, 0) || 1;
          let start = -Math.PI / 2;
          if (!data.length) {
            ctx.strokeStyle = '#EDF3F2';
            ctx.lineWidth = radius - inner;
            ctx.beginPath();
            ctx.arc(cx, cy, (radius + inner) / 2, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            data.forEach((item, i) => {
              const angle = (item.value / total) * Math.PI * 2;
              ctx.strokeStyle = item.color || colors[i % colors.length];
              ctx.lineWidth = radius - inner;
              ctx.beginPath();
              ctx.arc(cx, cy, (radius + inner) / 2, start, start + angle);
              ctx.stroke();
              start += angle;
            });
          }
          ctx.fillStyle = '#3D4A49';
          ctx.font = 'bold 16px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('¥' + this.properties.total, cx, cy + 6);
        });
    },
  },
});
