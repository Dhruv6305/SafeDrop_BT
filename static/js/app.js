/**
 * SafeDrop SPA v2 — App Router + Global State
 * Light theme · Speed controls · Presets · Walkthrough
 */

const App = {
  currentTab: 'home',
  campaigns: [],
  speedMultiplier: 1,   // used by tree.js _delay()

  init() {
    this._setupTabs();
    this._spawnHashParticles();
    this._setupSpeedControls();
    this.loadCampaigns();

    // Init walkthrough AFTER a short delay (let DOM settle)
    setTimeout(() => WalkthroughController.init(), 600);
  },

  // ── Tab Management ───────────────────────────────────────────────

  _setupTabs() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });
    document.querySelector('.navbar-brand')?.addEventListener('click', () => this.switchTab('home'));
  },

  switchTab(tabId) {
    this.currentTab = tabId;
    document.querySelectorAll('.nav-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === tabId)
    );
    document.querySelectorAll('.page-section').forEach(s =>
      s.classList.toggle('active', s.id === `section-${tabId}`)
    );
    if (tabId === 'home')   HomeSection.onEnter();
    if (tabId === 'admin')  AdminSection.onEnter();
    if (tabId === 'claim')  ClaimSection.onEnter();
    if (tabId === 'attack') AttackSection.onEnter();
  },

  // ── Speed Controls ───────────────────────────────────────────────

  _setupSpeedControls() {
    document.querySelectorAll('.speed-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const mult = parseFloat(pill.dataset.speed);
        this.speedMultiplier = mult;
        document.querySelectorAll('.speed-pill').forEach(p =>
          p.classList.toggle('active', p === pill)
        );
      });
    });
  },

  // ── Global Data ──────────────────────────────────────────────────

  async loadCampaigns() {
    try {
      this.campaigns = await API.getCampaigns();
      HomeSection.renderCampaigns(this.campaigns);
      AdminSection.renderCampaignList(this.campaigns);
      ClaimSection.populateCampaignDropdown(this.campaigns);
      AttackSection.populateCampaignDropdown(this.campaigns);
    } catch (e) {
      console.error('Failed to load campaigns:', e);
    }
  },

  // ── Toast ────────────────────────────────────────────────────────

  showToast(msg, type = 'info', duration = 3500) {
    const toast = document.createElement('div');
    const icons = { success: '✓', danger: '✕', info: 'ℹ', warning: '⚠' };
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
    const c = document.getElementById('toast-container');
    if (!c) return;
    c.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 400);
    }, duration);
  },

  // ── Formatters ───────────────────────────────────────────────────

  formatHash(hash, len = 10) {
    if (!hash) return '—';
    return hash.slice(0, len) + '...' + hash.slice(-4);
  },

  formatTime(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString();
  },

  modeBadge(mode) {
    return mode === 'naive'
      ? `<span class="badge badge-naive"><span class="badge-dot" style="background:var(--danger)"></span>Naive</span>`
      : `<span class="badge badge-hardened"><span class="badge-dot" style="background:var(--success)"></span>Hardened</span>`;
  },

  // ── Hero Hash Particles ──────────────────────────────────────────

  _spawnHashParticles() {
    const container = document.getElementById('hash-particles');
    if (!container) return;
    const samples = [
      'LEAF:', 'NODE:', 'SHA-256', '0x4a2b', 'merkle', 'proof',
      'root', '3f8c...', 'depth=3', 'keccak', 'verify', '0x1a3f',
    ];
    for (let i = 0; i < 14; i++) {
      const p = document.createElement('div');
      p.className = 'hash-particle';
      p.textContent = samples[i % samples.length];
      p.style.left = (4 + Math.random() * 92) + '%';
      p.style.animationDuration  = (14 + Math.random() * 14) + 's';
      p.style.animationDelay     = (Math.random() * 10) + 's';
      p.style.fontSize            = (0.58 + Math.random() * 0.22) + 'rem';
      p.style.opacity             = (0.08 + Math.random() * 0.12).toString();
      container.appendChild(p);
    }
  },
};

// ── Home Section ─────────────────────────────────────────────────

const HomeSection = {
  onEnter() { HomeSection.renderCampaigns(App.campaigns); },

  renderCampaigns(campaigns) {
    const grid = document.getElementById('home-campaigns');
    if (!grid) return;

    if (!campaigns || campaigns.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--text-muted);">
          <div style="font-size:2rem;margin-bottom:0.5rem;">🌿</div>
          <div>No campaigns — create one in Admin</div>
        </div>`;
      return;
    }

    grid.innerHTML = campaigns.map(c => `
      <div class="home-campaign-card ${c.mode}"
           onclick="App.switchTab('attack'); setTimeout(() => AttackSection.loadCampaign(${c.id}), 200);">
        <div class="home-campaign-header">
          <div>
            <div class="home-campaign-name">${c.name}</div>
            <div style="font-size:0.6rem;color:var(--text-muted);margin-top:2px;">#${c.id}</div>
          </div>
          ${App.modeBadge(c.mode)}
        </div>
        <div style="margin-bottom:0.5rem;" id="hc-fp-${c.id}"></div>
        <div class="home-campaign-stats">
          <div class="home-stat">
            <div class="home-stat-val" style="color:var(--primary)">${c.depth}</div>
            <div class="home-stat-lbl">Depth</div>
          </div>
          <div class="home-stat">
            <div class="home-stat-val">${c.total_recipients}</div>
            <div class="home-stat-lbl">Recip</div>
          </div>
          <div class="home-stat">
            <div class="home-stat-val" style="color:var(--success)">${c.total_claims}</div>
            <div class="home-stat-lbl">Claims</div>
          </div>
          <div class="home-stat">
            <div class="home-stat-val" style="color:var(--danger)">${c.total_attacks}</div>
            <div class="home-stat-lbl">Attacks</div>
          </div>
        </div>
      </div>
    `).join('');

    // Inject identicons for root hashes
    campaigns.forEach(c => {
      const el = document.getElementById(`hc-fp-${c.id}`);
      if (el && c.root) {
        const fp = hashFingerprint(c.root, 22, 12);
        el.appendChild(fp);
      }
    });

    // Also update admin list
    AdminSection.renderCampaignList(campaigns);
  },
};


// Expose globals
window.App = App;
window.HomeSection = HomeSection;

document.addEventListener('DOMContentLoaded', () => App.init());
