/**
 * SafeDrop 5-Step Onboarding Walkthrough
 * Shown on first load. Animated visuals per step.
 */

const WALK_STEPS = [
  {
    icon: '🪂',
    title: 'What is a Token Airdrop?',
    body: 'A token airdrop is when a project distributes free tokens to a list of wallet addresses. Think of it like a bulk email with money — but on a blockchain.',
    visual: 'airdrop',
  },
  {
    icon: '🌲',
    title: 'How Does a Merkle Tree Work?',
    body: 'Instead of storing every recipient on-chain (expensive!), we build a Merkle tree. Each leaf holds one recipient\'s data. Parents are hashes of their children. The single root hash represents everyone.',
    visual: 'tree',
  },
  {
    icon: '🔑',
    title: 'What is a Merkle Proof?',
    body: 'To claim tokens, you provide a "proof" — the sibling hashes needed to recompute the root from your leaf. If the computed root matches the stored root, you\'re legitimate.',
    visual: 'proof',
  },
  {
    icon: '⚠️',
    title: 'The Vulnerability: Secondary Preimage Attack',
    body: 'In a "naive" Merkle tree, internal node hashes and leaf hashes use the same function. An attacker can pretend an internal node is a leaf — and forge a claim using its children as data!',
    visual: 'attack',
  },
  {
    icon: '🛡️',
    title: 'How SafeDrop Fixes It',
    body: 'Two mitigations: (1) Domain tags — hash leaves with "LEAF:" prefix and nodes with "NODE:" prefix, making collisions impossible. (2) Proof length check — reject proofs shorter than the tree depth.',
    visual: 'fix',
  },
];

const WalkthroughController = {
  currentStep: 0,
  overlay: null,

  init() {
    const overlay = document.getElementById('walkthrough-overlay');
    if (!overlay) return;
    this.overlay = overlay;

    // Check if seen before
    if (localStorage.getItem('safedrop-walkthrough-seen')) {
      overlay.classList.add('hidden');
      return;
    }

    this.renderStep(0);
    overlay.classList.remove('hidden');
  },

  renderStep(idx) {
    this.currentStep = idx;
    const step = WALK_STEPS[idx];

    // Dots
    const dots = document.querySelectorAll('.walk-dot');
    dots.forEach((d, i) => {
      d.classList.toggle('active', i === idx);
      d.classList.toggle('done', i < idx);
    });

    // Visual
    const visual = document.getElementById('walk-visual');
    if (visual) {
      visual.innerHTML = '';
      visual.appendChild(this._buildVisual(step.visual, step.icon));
      visual.style.animation = 'none';
      requestAnimationFrame(() => {
        visual.style.animation = '';
        visual.style.animation = 'walkVisualIn 0.4s cubic-bezier(0.34,1.56,0.64,1)';
      });
    }

    // Title & body
    const title = document.getElementById('walk-title');
    const body  = document.getElementById('walk-body');
    if (title) title.textContent = step.title;
    if (body)  body.textContent  = step.body;

    // Buttons
    const prevBtn = document.getElementById('walk-prev');
    const nextBtn = document.getElementById('walk-next');
    const skipBtn = document.getElementById('walk-skip');

    if (prevBtn) prevBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
    if (nextBtn) {
      if (idx === WALK_STEPS.length - 1) {
        nextBtn.textContent = 'Get Started';
        nextBtn.style.background = 'var(--success)';
      } else {
        nextBtn.textContent = 'Next →';
        nextBtn.style.background = '';
      }
    }
  },

  _buildVisual(type, icon) {
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;gap:0.5rem;';

    if (type === 'airdrop') {
      // Animated tokens raining
      container.innerHTML = `
        <div style="position:relative;width:100%;height:100%;overflow:hidden;">
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:3rem;">🪂</div>
          ${Array.from({length: 8}, (_, i) => `
            <div style="position:absolute;top:${-10 + Math.random()*60}%;left:${8 + i*12}%;
              font-size:1rem;animation:tokenFall ${1.5 + Math.random()}s ease-in ${Math.random()*0.8}s infinite;opacity:0;">
              💎
            </div>
          `).join('')}
        </div>
        <style>
          @keyframes tokenFall {
            0%   { top:-10%; opacity:0; }
            15%  { opacity:1; }
            85%  { opacity:1; }
            100% { top:110%; opacity:0; }
          }
        </style>
      `;
    } else if (type === 'tree') {
      // Mini SVG tree
      container.innerHTML = `
        <svg viewBox="0 0 220 120" width="220" height="120">
          <line x1="110" y1="20" x2="65" y2="60"  stroke="#4f46e5" stroke-width="1.5" stroke-dasharray="4,3"/>
          <line x1="110" y1="20" x2="155" y2="60" stroke="#4f46e5" stroke-width="1.5" stroke-dasharray="4,3"/>
          <line x1="65"  y1="60" x2="38" y2="98"  stroke="#0d9488" stroke-width="1.5" stroke-dasharray="4,3"/>
          <line x1="65"  y1="60" x2="90" y2="98"  stroke="#0d9488" stroke-width="1.5" stroke-dasharray="4,3"/>
          <line x1="155" y1="60" x2="130" y2="98" stroke="#0d9488" stroke-width="1.5" stroke-dasharray="4,3"/>
          <line x1="155" y1="60" x2="180" y2="98" stroke="#0d9488" stroke-width="1.5" stroke-dasharray="4,3"/>
          <circle cx="110" cy="20" r="14" fill="#fffbeb" stroke="#d97706" stroke-width="2"/>
          <text x="110" y="24" text-anchor="middle" font-size="9" font-family="JetBrains Mono" fill="#92400e">ROOT</text>
          <circle cx="65"  cy="60" r="12" fill="#eef2ff" stroke="#4f46e5" stroke-width="1.5"/>
          <circle cx="155" cy="60" r="12" fill="#eef2ff" stroke="#4f46e5" stroke-width="1.5"/>
          <circle cx="38"  cy="98" r="10" fill="#f0fdfa" stroke="#0d9488" stroke-width="1.5"/>
          <circle cx="90"  cy="98" r="10" fill="#f0fdfa" stroke="#0d9488" stroke-width="1.5"/>
          <circle cx="130" cy="98" r="10" fill="#f0fdfa" stroke="#0d9488" stroke-width="1.5"/>
          <circle cx="180" cy="98" r="10" fill="#f0fdfa" stroke="#0d9488" stroke-width="1.5"/>
        </svg>
      `;
    } else if (type === 'proof') {
      container.innerHTML = `
        <svg viewBox="0 0 200 120" width="200" height="120">
          <circle cx="100" cy="100" r="10" fill="#eef2ff" stroke="#4f46e5" stroke-width="2"/>
          <circle cx="60"  cy="65"  r="12" fill="#fff1f2" stroke="#e11d48" stroke-width="2" opacity="0.6"/>
          <circle cx="100" cy="65"  r="12" fill="#eef2ff" stroke="#4f46e5" stroke-width="2"/>
          <circle cx="100" cy="30"  r="12" fill="#eef2ff" stroke="#4f46e5" stroke-width="2.5" style="filter:url(#glow-indigo)"/>
          <circle cx="140" cy="30"  r="12" fill="#fff1f2" stroke="#e11d48" stroke-width="2" opacity="0.6"/>
          <circle cx="120" cy="10"  r="12" fill="#fffbeb" stroke="#d97706" stroke-width="2"/>
          <!-- highlight path -->
          <line x1="100" y1="90"  x2="100" y2="77" stroke="#4f46e5" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="100" y1="53"  x2="100" y2="42" stroke="#4f46e5" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="100" y1="18"  x2="110" y2="12" stroke="#d97706" stroke-width="2.5" stroke-linecap="round"/>
          <text x="100" y="103" text-anchor="middle" font-size="8" font-family="JetBrains Mono" fill="#3730a3">You</text>
        </svg>
      `;
    } else if (type === 'attack') {
      container.innerHTML = `
        <div style="position:relative;display:flex;align-items:center;gap:1.5rem;">
          <div style="text-align:center;">
            <div style="width:52px;height:52px;border-radius:8px;background:#fff1f2;border:2px solid #e11d48;display:flex;align-items:center;justify-content:center;font-size:1.4rem;animation:attackWiggle 0.5s ease-in-out infinite alternate;">⚠️</div>
            <div style="font-size:0.65rem;font-family:'JetBrains Mono',mono;color:#be123c;margin-top:4px;">Internal Node</div>
          </div>
          <div style="font-size:1.5rem;color:#e11d48;">→</div>
          <div style="text-align:center;">
            <div style="width:52px;height:52px;border-radius:8px;background:#fff1f2;border:2px dashed #e11d48;display:flex;align-items:center;justify-content:center;font-size:1.4rem;">💸</div>
            <div style="font-size:0.65rem;font-family:'JetBrains Mono',mono;color:#be123c;margin-top:4px;">Forged Claim</div>
          </div>
        </div>
        <style>
          @keyframes attackWiggle {
            from { transform: rotate(-4deg); }
            to   { transform: rotate(4deg); }
          }
        </style>
      `;
    } else if (type === 'fix') {
      container.innerHTML = `
        <div style="display:flex;gap:1rem;">
          <div style="text-align:center;">
            <div style="background:#ecfdf5;border:2px solid #a7f3d0;border-radius:8px;padding:0.5rem 0.75rem;font-family:'JetBrains Mono',mono;font-size:0.65rem;color:#047857;font-weight:600;">LEAF:addr+amt</div>
            <div style="font-size:0.65rem;color:#059669;margin-top:4px;font-weight:600;">✓ Domain tag</div>
          </div>
          <div style="text-align:center;">
            <div style="background:#ecfdf5;border:2px solid #a7f3d0;border-radius:8px;padding:0.5rem 0.75rem;font-family:'JetBrains Mono',mono;font-size:0.65rem;color:#047857;font-weight:600;">len == depth</div>
            <div style="font-size:0.65rem;color:#059669;margin-top:4px;font-weight:600;">✓ Length check</div>
          </div>
        </div>
      `;
    }

    return container;
  },

  next() {
    if (this.currentStep < WALK_STEPS.length - 1) {
      this.renderStep(this.currentStep + 1);
    } else {
      this.close();
    }
  },

  prev() {
    if (this.currentStep > 0) this.renderStep(this.currentStep - 1);
  },

  close() {
    localStorage.setItem('safedrop-walkthrough-seen', '1');
    if (this.overlay) this.overlay.classList.add('hidden');
  },
};

// Expose globally
window.WalkthroughController = WalkthroughController;
window.walkNext = () => WalkthroughController.next();
window.walkPrev = () => WalkthroughController.prev();
window.walkSkip = () => WalkthroughController.close();
window.openWalkthrough = () => {
  localStorage.removeItem('safedrop-walkthrough-seen');
  WalkthroughController.currentStep = 0;
  const overlay = document.getElementById('walkthrough-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    WalkthroughController.overlay = overlay;
    WalkthroughController.renderStep(0);
  }
};
