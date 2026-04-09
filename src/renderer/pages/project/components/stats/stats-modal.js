import { injectCss } from '../../../../shared/helpers.js';

export class StatsModal {
  constructor({ projectId }) {
    this._projectId = projectId;
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  mount() {
    injectCss('pages/project/components/stats/stats-modal.css');
  }

  // ----------------------------------------------------------------
  // Show modal
  // ----------------------------------------------------------------
  async show() {
    document.querySelector('.stats-overlay')?.remove();

    const [stories, features, statuses] = await Promise.all([
      window.db.userStories.list({ project_id: this._projectId }),
      window.db.features.list(this._projectId),
      window.db.status.list(),
    ]);

    const totalStories  = stories.length;
    const totalFeatures = features.length;

    const overlay = document.createElement('div');
    overlay.className = 'stats-overlay';
    overlay.innerHTML = `
      <div class="stats-modal">
        <div class="stats-modal__header">
          <span class="stats-modal__title">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="8" width="3" height="7" rx="1" stroke="currentColor" stroke-width="1.3"/>
              <rect x="6" y="4" width="3" height="11" rx="1" stroke="currentColor" stroke-width="1.3"/>
              <rect x="11" y="1" width="3" height="14" rx="1" stroke="currentColor" stroke-width="1.3"/>
            </svg>
            Statistics
          </span>
          <button class="stats-modal__close" id="btnStatsClose">&times;</button>
        </div>
        <div class="stats-modal__body">
          <div class="stats-section">
            <div class="stats-section__header">
              <span class="stats-section__label">User Stories</span>
              <span class="stats-section__count">${totalStories}</span>
            </div>
            ${totalStories === 0
              ? `<div class="stats-empty">No user stories yet.</div>`
              : `<canvas id="statsChartStories" class="stats-chart"></canvas>`
            }
          </div>
          <div class="stats-section">
            <div class="stats-section__header">
              <span class="stats-section__label">Features</span>
              <span class="stats-section__count">${totalFeatures}</span>
            </div>
            ${totalFeatures === 0
              ? `<div class="stats-empty">No features yet.</div>`
              : `<canvas id="statsChartFeatures" class="stats-chart"></canvas>`
            }
          </div>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#btnStatsClose').addEventListener('click', () => overlay.remove());

    if (totalStories  > 0) this._drawChart('statsChartStories',  stories,  statuses);
    if (totalFeatures > 0) this._drawChart('statsChartFeatures', features, statuses);
  }

  // ----------------------------------------------------------------
  // Canvas bar chart
  // ----------------------------------------------------------------
  _drawChart(canvasId, items, statuses) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const counts = {};
    for (const s of items) {
      const label = s.status_name || 'No Status';
      counts[label] = (counts[label] || 0) + 1;
    }

    const ordered = [];
    for (const st of statuses) {
      if (counts[st.name] !== undefined) ordered.push({ label: st.name, count: counts[st.name] });
    }
    if (counts['No Status']) ordered.push({ label: 'No Status', count: counts['No Status'] });
    if (ordered.length === 0) return;

    const DPR = window.devicePixelRatio || 1;
    const W   = canvas.offsetWidth  || 480;
    const H   = canvas.offsetHeight || 220;
    canvas.width  = W * DPR;
    canvas.height = H * DPR;
    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);

    const PAD    = { top: 24, right: 16, bottom: 48, left: 40 };
    const cw     = W - PAD.left - PAD.right;
    const ch     = H - PAD.top  - PAD.bottom;
    const n      = ordered.length;
    const maxY   = Math.max(...ordered.map(p => p.count), 1);
    const slot   = cw / n;
    const BAR_W  = Math.max(8, Math.min(48, slot * 0.55));
    const yOf    = (v) => PAD.top + ch - (v / maxY) * ch;
    const barX   = (i) => PAD.left + slot * i + (slot - BAR_W) / 2;

    const yTicks = Math.min(maxY, 4);
    for (let t = 0; t <= yTicks; t++) {
      const v = Math.round((maxY / yTicks) * t);
      const y = yOf(v);
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cw, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 0.5; ctx.stroke();
      ctx.fillStyle   = 'rgba(255,255,255,0.35)';
      ctx.font        = '10px system-ui,sans-serif';
      ctx.textAlign   = 'right';
      ctx.fillText(v, PAD.left - 6, y + 3);
    }

    for (let i = 0; i < n; i++) {
      const { label, count } = ordered[i];
      const x    = barX(i);
      const barH = (count / maxY) * ch;
      const y    = PAD.top + ch - barH;
      const cx   = x + BAR_W / 2;

      const r = Math.min(4, BAR_W / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + BAR_W - r, y);
      ctx.quadraticCurveTo(x + BAR_W, y, x + BAR_W, y + r);
      ctx.lineTo(x + BAR_W, y + barH);
      ctx.lineTo(x,         y + barH);
      ctx.lineTo(x,         y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      grad.addColorStop(0, '#f97316');
      grad.addColorStop(1, 'rgba(249,115,22,0.3)');
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.fillStyle = '#f97316';
      ctx.font      = 'bold 11px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(count, cx, y - 6);

      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font      = '10px system-ui,sans-serif';
      const words = label.split(' ');
      let line1 = '', line2 = '';
      for (const w of words) {
        if ((line1 + ' ' + w).trim().length <= 10) line1 = (line1 + ' ' + w).trim();
        else line2 = (line2 + ' ' + w).trim();
      }
      ctx.fillText(line1, cx, H - PAD.bottom + 14);
      if (line2) ctx.fillText(line2, cx, H - PAD.bottom + 25);
    }
  }
}
