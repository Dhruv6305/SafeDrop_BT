/**
 * SafeDrop Timeline Strip
 * A horizontal pill-based step ribbon that slides up from the bottom
 * of the Attack Lab canvas, replacing the old two-column text step lists.
 */

const Timeline = {
  container: null,
  pillsEl: null,
  _visible: false,

  init() {
    this.container = document.getElementById('timeline-strip');
    this.pillsEl   = document.getElementById('timeline-pills');
  },

  show() {
    if (!this.container) return;
    this._visible = true;
    this.container.classList.remove('hidden');
    requestAnimationFrame(() => this.container.classList.add('visible'));
  },

  hide() {
    if (!this.container) return;
    this._visible = false;
    this.container.classList.remove('visible');
    setTimeout(() => this.container.classList.add('hidden'), 400);
  },

  clear() {
    if (this.pillsEl) this.pillsEl.innerHTML = '';
  },

  /**
   * Add a step pill to the timeline.
   * @param {object} step - { step, label, status, detail? }
   * @param {number} delay - ms before appearing
   */
  addPill(step, delay = 0) {
    if (!this.pillsEl) return;

    const icon = {
      danger:  '⚠',
      success: '✓',
      warning: '→',
      info:    '◎',
    }[step.status] || '·';

    const color = {
      danger:  'var(--danger)',
      success: 'var(--success)',
      warning: 'var(--warning)',
      info:    'var(--primary)',
    }[step.status] || 'var(--text-muted)';

    const bg = {
      danger:  'var(--danger-bg)',
      success: 'var(--success-bg)',
      warning: 'var(--warning-bg)',
      info:    'var(--primary-bg)',
    }[step.status] || 'var(--bg-subtle)';

    const border = {
      danger:  'var(--danger-border)',
      success: 'var(--success-border)',
      warning: 'var(--warning-border)',
      info:    'var(--primary-border)',
    }[step.status] || 'var(--border)';

    const pill = document.createElement('div');
    pill.className = 'tl-pill';
    pill.style.setProperty('--pill-color',  color);
    pill.style.setProperty('--pill-bg',     bg);
    pill.style.setProperty('--pill-border', border);

    // Shorten label to ≤ 5 words
    const words = (step.label || '').split(' ').slice(0, 6).join(' ');

    pill.innerHTML = `
      <div class="tl-num">${step.step}</div>
      <span class="tl-icon">${icon}</span>
      <span class="tl-label">${words}</span>
    `;

    // Tooltip with full detail
    if (step.detail || step.hash) {
      pill.title = (step.detail || '') + (step.hash ? `\n${step.hash.slice(0,32)}...` : '');
    }

    pill.style.opacity = '0';
    pill.style.transform = 'translateY(12px)';
    this.pillsEl.appendChild(pill);

    setTimeout(() => {
      pill.style.transition = 'all 0.35s cubic-bezier(0.34,1.56,0.64,1)';
      pill.style.opacity = '1';
      pill.style.transform = 'translateY(0)';

      // Pulse on danger pills
      if (step.status === 'danger') {
        setTimeout(() => pill.classList.add('tl-pulse'), 200);
      }
    }, delay);
  },

  /**
   * Feed an entire steps array with stagger.
   * @param {array} steps
   * @param {number} baseDelay - delay per step in ms
   */
  async feedSteps(steps, baseDelay = 650) {
    this.show();
    for (let i = 0; i < steps.length; i++) {
      this.addPill(steps[i], i * baseDelay);
    }
    return new Promise(r => setTimeout(r, steps.length * baseDelay + 400));
  },

  /**
   * Separate naive and hardened visually using a divider pill.
   */
  addDivider(label = '') {
    if (!this.pillsEl) return;
    const div = document.createElement('div');
    div.className = 'tl-divider';
    div.textContent = label;
    this.pillsEl.appendChild(div);
  },
};

window.Timeline = Timeline;
