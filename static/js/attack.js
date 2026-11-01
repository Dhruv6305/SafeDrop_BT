/**
 * SafeDrop Attack Lab v3 — Visual-First Edition
 * Status flash · Timeline strip · Slim dock · Preset scenarios
 */

const AttackSection = {
  currentCampaignId: null,
  treeData: null,
  selectedNode: null,
  treeViz: null,
  isAnimating: false,
  isPaused: false,
  _pauseResolvers: [],

  onEnter() {
    AttackSection.populateCampaignDropdown(App.campaigns);
    if (!AttackSection.treeViz) AttackSection._initTree();
    Timeline.init();
  },

  _initTree() {
    const svg = document.getElementById('attack-tree-svg');
    if (!svg) return;
    AttackSection.treeViz = new MerkleTreeVisualizer('attack-tree-svg', {
      onNodeClick: (node, pos) => AttackSection.onNodeSelected(node, pos),
    });
    AttackSection.treeViz.mount(svg);
  },

  populateCampaignDropdown(campaigns) {
    const sel = document.getElementById('attack-campaign-select');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">Campaign…</option>';
    (campaigns || []).forEach(c => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = `#${c.id} ${c.name} [${c.mode.toUpperCase()}]`;
      sel.appendChild(o);
    });
    if (prev) sel.value = prev;
  },

  async loadCampaign(id) {
    const sel = document.getElementById('attack-campaign-select');
    if (sel) sel.value = id;
    await attackLoadTree();
  },

  togglePause() {
    this.isPaused = !this.isPaused;
    const btn = document.getElementById('play-pause-btn');
    if (btn) btn.textContent = this.isPaused ? '▶' : '⏸';
    if (!this.isPaused) {
      this._pauseResolvers.forEach(r => r());
      this._pauseResolvers = [];
    }
  },

  _delay(ms) {
    const mult = window.App?.speedMultiplier || 1;
    const actual = ms / mult;
    return new Promise(resolve => {
      if (!this.isPaused) setTimeout(resolve, actual);
      else this._pauseResolvers.push(() => setTimeout(resolve, actual));
    });
  },
};

// ── Tree Loading ──────────────────────────────────────────────────

async function attackLoadTree() {
  const campaignId = document.getElementById('attack-campaign-select').value;
  if (!campaignId) { App.showToast('Select a campaign first', 'danger'); return; }

  const btn = document.getElementById('load-tree-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  _resetAttackUI();
  Timeline.hide();

  try {
    const data = await API.getTree(campaignId);
    AttackSection.currentCampaignId = campaignId;
    AttackSection.treeData = data;

    if (!AttackSection.treeViz) AttackSection._initTree();
    AttackSection.treeViz.render(data.naive.levels, data.naive.depth, data.naive.root);

    _updateDockInfo(data);
    _setCaption('Click an <b>indigo</b> internal node to target it');

    document.getElementById('dock-controls').classList.remove('hidden');
    document.getElementById('launch-btn').disabled = true;

    await _loadAttackHistory(campaignId);
  } catch (e) {
    App.showToast('Failed to load: ' + e.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Load';
  }
}

function _updateDockInfo(data) {
  const el = document.getElementById('dock-tree-info');
  if (!el) return;
  const naive = data.naive, hard = data.hardened;
  el.innerHTML = `
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
      <span class="badge badge-primary" style="font-size:0.6rem;">Depth ${naive.depth}</span>
      <span class="badge" style="background:var(--teal-bg);color:var(--teal-text);font-size:0.6rem;">${data.total_recipients} Recipients</span>
    </div>
    <div style="margin-bottom:6px;">
      <div style="font-size:0.6rem;font-weight:700;color:var(--danger-text);margin-bottom:2px;">NAIVE ROOT</div>
      <div style="display:flex;gap:5px;align-items:center;" id="naive-root-fp"></div>
    </div>
    <div>
      <div style="font-size:0.6rem;font-weight:700;color:var(--success-text);margin-bottom:2px;">HARDENED ROOT</div>
      <div style="display:flex;gap:5px;align-items:center;" id="hard-root-fp"></div>
    </div>
  `;
  el.classList.remove('hidden');

  setTimeout(() => {
    const nfp = document.getElementById('naive-root-fp');
    const hfp = document.getElementById('hard-root-fp');
    if (nfp) { const fp = hashFingerprint(naive.root, 20, 10); nfp.appendChild(fp); }
    if (hfp) { const fp = hashFingerprint(hard.root, 20, 10); hfp.appendChild(fp); }
  }, 100);
}

function _setCaption(html) {
  const el = document.getElementById('canvas-caption');
  if (el) { el.innerHTML = html; el.style.opacity = '1'; }
}

// ── Node Selection ────────────────────────────────────────────────

AttackSection.onNodeSelected = function(node, pos) {
  if (AttackSection.isAnimating) return;
  AttackSection.selectedNode = node;

  const naive = AttackSection.treeData?.naive;
  if (!naive) return;
  const naiveNode = naive.levels[node.level]?.[node.index];
  if (!naiveNode) return;

  const forgedAmount = (parseInt(naiveNode.right_child_hash?.slice(0,8) || 'ff', 16) % 10000) + 1;
  const genuineLen   = naive.depth;
  const forgedLen    = genuineLen - node.level;

  // Update forge panel in dock
  const fp = document.getElementById('forge-panel');
  if (fp) {
    fp.innerHTML = `
      <div class="forge-header">
        <span>Forged Entry</span>
        <div style="display:flex;gap:4px;">
          <span class="badge" style="background:var(--danger-bg);color:var(--danger-text);font-size:0.58rem;">L${node.level}</span>
          <span class="badge" style="background:var(--primary-bg);color:var(--primary-text);font-size:0.58rem;">i${node.index}</span>
        </div>
      </div>
      <div class="forge-identicon-row" id="forge-ico-row"></div>
      <div class="forge-amount" id="forge-amount">${forgedAmount.toLocaleString()}</div>
      <div style="font-size:0.6rem;color:var(--text-muted);text-align:center;margin-bottom:8px;">tokens to steal</div>
      <div class="proof-bars">
        <div style="font-size:0.62rem;color:var(--text-muted);margin-bottom:4px;display:flex;justify-content:space-between;">
          <span>Genuine</span><strong style="color:var(--success-text)">${genuineLen}</strong>
        </div>
        <div class="proof-bar-track">
          <div class="proof-bar-fill success" style="width:${(genuineLen / genuineLen) * 100}%"></div>
        </div>
        <div style="font-size:0.62rem;color:var(--text-muted);margin:4px 0;display:flex;justify-content:space-between;">
          <span>Forged</span><strong style="color:var(--danger-text)">${forgedLen}</strong>
        </div>
        <div class="proof-bar-track">
          <div class="proof-bar-fill danger" style="width:${(forgedLen / genuineLen) * 100}%"></div>
        </div>
      </div>
    `;
    fp.classList.remove('hidden');

    // Identicon for this node's hash
    setTimeout(() => {
      const row = document.getElementById('forge-ico-row');
      if (row && naiveNode.hash) {
        const fp2 = hashFingerprint(naiveNode.hash, 32, 12);
        row.appendChild(fp2);
      }
    }, 50);

    // Spring entrance
    fp.style.opacity = '0';
    fp.style.transform = 'translateY(6px)';
    requestAnimationFrame(() => {
      fp.style.transition = 'all 0.35s cubic-bezier(0.34,1.56,0.64,1)';
      fp.style.opacity = '1';
      fp.style.transform = 'translateY(0)';
    });
  }

  document.getElementById('launch-btn').disabled = false;
  _setCaption(`<b>L${node.level}:${node.index}</b> selected — ${forgedAmount.toLocaleString()} tokens at stake`);
};

// ── Launch Attack ─────────────────────────────────────────────────

async function launchAttack() {
  if (!AttackSection.selectedNode || !AttackSection.currentCampaignId) return;
  if (AttackSection.isAnimating) return;

  const node = AttackSection.selectedNode;
  const launchBtn = document.getElementById('launch-btn');
  launchBtn.disabled = true;
  launchBtn.innerHTML = '<span class="spinner"></span>';
  AttackSection.isAnimating = true;

  Timeline.clear();
  Timeline.show();
  _setCaption('Simulating attack…');

  // Hide old result flash
  _hideFlash();

  try {
    const result = await API.launchAttack(AttackSection.currentCampaignId, {
      node_level: node.level, node_index: node.index,
    });

    // PHASE 1: Tree animation
    await AttackSection.treeViz.animateAttackPath(node.level, node.index, result.naive.forged_proof);

    // PHASE 2: Timeline — naive steps
    Timeline.addDivider('⚠ Naive Verification');
    await _feedTimeline(result.naive.steps, 600);

    // PHASE 3: Timeline — hardened steps
    Timeline.addDivider('🛡 Hardened Verification');
    await _feedTimeline(result.hardened.steps, 600);

    // PHASE 4: Execute on-chain smart contract transactions
    if (window.Web3Client) {
      try {
        const onchainResult = await window.Web3Client.sendOnChainAttack(
          node.level,
          node.index,
          result.forged_address,
          result.forged_amount,
          result.naive.forged_proof
        );
        result.onchain = onchainResult;
      } catch (err) {
        console.warn('On-chain attack sync error:', err);
      }
    }

    await AttackSection._delay(300);
    const naiveExploited = result.naive.result === 'success';
    _showStatusFlash(naiveExploited ? 'exploited' : 'blocked');

    await AttackSection._delay(1400);

    _renderDockResult(result);
    _setCaption(naiveExploited ? '💥 Naive EXPLOITED — Hardened BLOCKED 🛡' : '🛡 Attack blocked on both modes');

    await _loadAttackHistory(AttackSection.currentCampaignId);
    await App.loadCampaigns();

    // Auto-scroll the dock to bring the result and new log into view smoothly
    setTimeout(() => {
      const resEl = document.getElementById('dock-result');
      if (resEl) resEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 150);

  } catch (e) {
    App.showToast('Attack error: ' + e.message, 'danger');
  } finally {
    launchBtn.disabled = false;
    launchBtn.innerHTML = '⚔ Launch';
    AttackSection.isAnimating = false;
  }
}

async function _feedTimeline(steps, baseDelay) {
  for (let i = 0; i < steps.length; i++) {
    await AttackSection._delay(baseDelay);
    Timeline.addPill(steps[i], 0);
  }
}

// ── Status Flash ──────────────────────────────────────────────────

function _showStatusFlash(type) {
  let flash = document.getElementById('status-flash');
  if (!flash) {
    flash = document.createElement('div');
    flash.id = 'status-flash';
    document.body.appendChild(flash);
  }
  const isExploited = type === 'exploited';
  flash.className = `status-flash ${isExploited ? 'flash-exploit' : 'flash-block'}`;
  flash.innerHTML = `
    <div class="flash-icon">${isExploited ? '💥' : '🛡️'}</div>
    <div class="flash-label">${isExploited ? 'EXPLOITED' : 'BLOCKED'}</div>
  `;
  flash.style.display = 'flex';
  requestAnimationFrame(() => flash.classList.add('visible'));
  setTimeout(() => {
    flash.classList.remove('visible');
    setTimeout(() => { flash.style.display = 'none'; }, 500);
  }, 1100);
}

function _hideFlash() {
  const flash = document.getElementById('status-flash');
  if (flash) { flash.classList.remove('visible'); flash.style.display = 'none'; }
}

// ── Dock Result Panel ─────────────────────────────────────────────

function _renderDockResult(result) {
  const panel = document.getElementById('dock-result');
  if (!panel) return;

  const naiveExploited = result.naive.result === 'success';
  const onchain = result.onchain;

  const onchainHtml = onchain ? `
    <div style="margin-top:8px;padding:6px 8px;background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.6rem;">
      <div style="font-weight:700;color:var(--text-secondary);margin-bottom:3px;">ON-CHAIN SMART CONTRACT RESULTS:</div>
      <div style="color:var(--danger-text);">
        Naive Contract: Status 1 (SUCCESS) · Tx: ${onchain.naive_tx?.tx_hash?.slice(0, 14)}...
      </div>
      <div style="color:var(--success-text);margin-top:2px;">
        Hardened Contract: Status 0 (REVERTED) · Gas: ${onchain.hardened_tx?.gas_used}
      </div>
    </div>
  ` : '';

  panel.innerHTML = `
    <div class="result-split-row">
      <div class="result-mini ${naiveExploited ? 'result-mini-bad' : 'result-mini-ok'}">
        <div class="result-mini-icon">${naiveExploited ? '💥' : '✓'}</div>
        <div class="result-mini-label">Naive</div>
        <div class="result-mini-status">${naiveExploited ? 'Exploited' : 'Blocked'}</div>
      </div>
      <div class="result-mini result-mini-ok">
        <div class="result-mini-icon">🛡</div>
        <div class="result-mini-label">Hardened</div>
        <div class="result-mini-status">Blocked</div>
      </div>
    </div>
    ${onchainHtml}
    <div style="font-size:0.62rem;color:var(--text-muted);margin-top:8px;line-height:1.5;">
      ${naiveExploited
        ? `Forged proof (len <strong style="color:var(--danger-text)">${result.forged_proof_length}</strong>) accepted — no length check.`
        : `Both modes rejected. Proof verified correctly.`}
    </div>
    ${naiveExploited ? `
    <div style="margin-top:8px;">
      <div style="font-size:0.62rem;color:var(--text-muted);margin-bottom:4px;">Why Hardened Blocked It:</div>
      <div style="font-size:0.62rem;background:var(--success-bg);border-left:2px solid var(--success);padding:4px 8px;border-radius:0 4px 4px 0;color:var(--success-text);">
        ✓ LEAF: domain tag<br>✓ Proof length == depth
      </div>
    </div>` : ''}
  `;
  panel.classList.remove('hidden');
  panel.style.opacity = '0';
  panel.style.transform = 'translateY(6px)';
  requestAnimationFrame(() => {
    panel.style.transition = 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)';
    panel.style.opacity = '1';
    panel.style.transform = 'translateY(0)';
  });
}

// ── Presets ───────────────────────────────────────────────────────

async function runPreset(type) {
  if (AttackSection.isAnimating) { App.showToast('Wait for current run to finish', 'warning'); return; }
  App.switchTab('attack');
  await new Promise(r => setTimeout(r, 200));

  if (type === 'naive-attack') {
    const c = App.campaigns.find(c => c.mode === 'naive');
    if (!c) { App.showToast('No naive campaign — create one in Admin', 'danger'); return; }
    await AttackSection.loadCampaign(c.id);
    await new Promise(r => setTimeout(r, 1600));
    const node = { level: 1, index: 0 };
    AttackSection.onNodeSelected(node, {});
    if (AttackSection.treeViz) AttackSection.treeViz._select(1, 0, AttackSection.treeViz.C.selected);
    App.showToast('Preset loaded — click ⚔ Launch to simulate', 'info');

  } else if (type === 'hardened') {
    const c = App.campaigns.find(c => c.mode === 'hardened');
    if (!c) { App.showToast('No hardened campaign — create one in Admin', 'danger'); return; }
    await AttackSection.loadCampaign(c.id);
    await new Promise(r => setTimeout(r, 1600));
    const node = { level: 1, index: 0 };
    AttackSection.onNodeSelected(node, {});
    if (AttackSection.treeViz) AttackSection.treeViz._select(1, 0, AttackSection.treeViz.C.selected);
    App.showToast('Hardened preset — watch mitigations block the attack', 'success');

  } else if (type === 'normal-claim') {
    App.switchTab('claim');

  } else if (type === 'double-spend') {
    App.switchTab('claim');
    App.showToast('Try claiming the same address twice to see double-spend protection', 'info', 4000);
  }
}

// ── Playback ──────────────────────────────────────────────────────

function togglePlayPause() { AttackSection.togglePause(); }

function resetAttack() {
  if (AttackSection.treeViz) AttackSection.treeViz.clearSelection();
  AttackSection.isAnimating = false;
  AttackSection.isPaused = false;
  AttackSection._pauseResolvers.forEach(r => r());
  AttackSection._pauseResolvers = [];
  Timeline.hide();
  _hideFlash();
  _resetAttackUI();
  if (AttackSection.currentCampaignId) attackLoadTree();
}

function _resetAttackUI() {
  AttackSection.selectedNode = null;
  AttackSection.isPaused = false;

  const ids = ['forge-panel', 'dock-result', 'dock-tree-info', 'dock-controls'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  const btn = document.getElementById('launch-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '⚔ Launch'; }
  const pb = document.getElementById('play-pause-btn');
  if (pb) pb.textContent = '⏸';
  _setCaption('Select a campaign and click <b>Load</b>');
}

// ── Attack History ────────────────────────────────────────────────

async function _loadAttackHistory(campaignId) {
  const tbody = document.getElementById('attack-history-tbody');
  if (!tbody) return;
  try {
    const attacks = await API.getAttacks(campaignId);
    if (attacks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1rem;">No attacks yet.</td></tr>';
      return;
    }
    tbody.innerHTML = attacks.map(a => `
      <tr>
        <td><span class="badge ${a.result === 'success' ? 'badge-naive' : 'badge-hardened'}" style="font-size:0.6rem;">${a.result === 'success' ? '💥' : '🛡'}</span></td>
        <td><div style="display:flex;gap:4px;align-items:center;" id="atk-ico-${a.id}"></div></td>
        <td style="text-align:center;color:var(--danger-text);font-weight:700;">${a.forged_amount || '—'}</td>
        <td style="text-align:center;">${a.genuine_proof_length}</td>
        <td style="text-align:center;color:var(--danger-text);">${a.forged_proof_length}</td>
      </tr>
    `).join('');
    // Fill identicons
    attacks.forEach(a => {
      const row = document.getElementById(`atk-ico-${a.id}`);
      if (row && a.forged_address) {
        const ico = makeIdenticonEl(a.forged_address, 20, { borderRadius: '3px' });
        const span = document.createElement('span');
        span.style.cssText = 'font-family:var(--font-mono);font-size:0.6rem;color:var(--danger-text);';
        span.textContent = a.forged_address.slice(0,8);
        row.appendChild(ico); row.appendChild(span);
      }
    });
  } catch (e) { console.error(e); }
}

async function loadAttackHistory() {
  if (AttackSection.currentCampaignId) await _loadAttackHistory(AttackSection.currentCampaignId);
}

// Expose globals
window.AttackSection   = AttackSection;
window.attackLoadTree  = attackLoadTree;
window.launchAttack    = launchAttack;
window.resetAttack     = resetAttack;
window.togglePlayPause = togglePlayPause;
window.loadAttackHistory = loadAttackHistory;
window.runPreset       = runPreset;
