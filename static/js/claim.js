/**
 * Claim Section
 * Address proof lookup, eligibility verification, and claim submission.
 * (Tree visualization moved exclusively to Attack Lab).
 */

const ClaimSection = {
  currentProof: null,
  currentCampaign: null,

  onEnter() {
    ClaimSection.populateCampaignDropdown(App.campaigns);
    const sel = document.getElementById('claim-campaign-select');
    if (sel && sel.options.length > 1 && !sel.value) {
      sel.selectedIndex = 1;
      onClaimCampaignChange();
    } else if (sel && sel.value) {
      onClaimCampaignChange();
    }
  },

  populateCampaignDropdown(campaigns) {
    const sel = document.getElementById('claim-campaign-select');
    if (!sel) return;
    const prevVal = sel.value;
    sel.innerHTML = `<option value="">-- Choose Airdrop Campaign --</option>`;
    (campaigns || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `#${c.id} — ${c.name} [${c.mode.toUpperCase()}]`;
      sel.appendChild(opt);
    });
    if (prevVal) sel.value = prevVal;
  },
};

// ── Campaign Change & Stats ──────────────────────────────────────

async function onClaimCampaignChange() {
  const sel = document.getElementById('claim-campaign-select');
  if (!sel || !sel.value) {
    _resetClaimUI();
    return;
  }
  const campaignId = sel.value;
  ClaimSection.currentCampaign = campaignId;
  await updateClaimCampaignInfo(campaignId);
  await loadClaimHistory(campaignId);
}

function _resetClaimUI() {
  const badgeText = document.getElementById('claim-campaign-badge-text');
  if (badgeText) badgeText.textContent = 'Select a Campaign to Start';
  ['claim-param-mode', 'claim-param-depth', 'claim-param-recipients', 'claim-param-claims'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });
  const rootEl = document.getElementById('claim-param-root');
  if (rootEl) rootEl.textContent = 'Select a campaign to inspect root';
}

async function updateClaimCampaignInfo(campaignId) {
  if (!campaignId) return;
  try {
    const campaign = await API.getCampaign(campaignId);
    if (!campaign) return;
    const modeEl = document.getElementById('claim-param-mode');
    const depthEl = document.getElementById('claim-param-depth');
    const recipEl = document.getElementById('claim-param-recipients');
    const claimsEl = document.getElementById('claim-param-claims');
    const rootEl = document.getElementById('claim-param-root');
    const badgeText = document.getElementById('claim-campaign-badge-text');

    if (modeEl) modeEl.innerHTML = App.modeBadge(campaign.mode);
    if (depthEl) depthEl.textContent = campaign.depth;
    if (recipEl) recipEl.textContent = campaign.total_recipients;
    if (claimsEl) claimsEl.textContent = campaign.total_claims;
    if (rootEl) {
      rootEl.innerHTML = `<code style="font-family:var(--font-mono);word-break:break-all;">${campaign.root}</code>`;
    }
    if (badgeText) {
      badgeText.innerHTML = `Active: <strong>${campaign.name}</strong> (${campaign.mode.toUpperCase()})`;
    }
  } catch (e) {
    console.error('Error fetching campaign details:', e);
  }
}

function setAddr(addr) {
  const input = document.getElementById('claim-address');
  if (input) {
    input.value = addr;
    lookupProof();
  }
}

// ── Proof Lookup ─────────────────────────────────────────────────

async function lookupProof() {
  const campaignId = document.getElementById('claim-campaign-select').value;
  const address = document.getElementById('claim-address').value.trim();
  const btn = document.getElementById('lookup-btn');

  if (!campaignId) { App.showToast('Please select a campaign first', 'danger'); return; }
  if (!address) { App.showToast('Please enter your wallet address', 'danger'); return; }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Verifying...';
  }

  try {
    const data = await API.getProof(campaignId, address);
    ClaimSection.currentProof = data;
    ClaimSection.currentCampaign = campaignId;
    renderProofResult(data);
    App.showToast('Address is eligible! Merkle proof generated.', 'success');
  } catch (e) {
    const resEl = document.getElementById('proof-result');
    if (resEl) {
      resEl.innerHTML = `
        <div class="alert alert-danger" style="margin-top:0.75rem;">
          <span class="alert-icon">✕</span>
          <div>
            <strong>Verification Failed:</strong> ${e.message}<br>
            <span style="font-size:0.75rem;color:var(--text-muted);">This address is not in the campaign recipient list or proof generation failed.</span>
          </div>
        </div>`;
    }
    App.showToast(e.message, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Check Eligibility';
    }
  }
}

function renderProofResult(data) {
  const el = document.getElementById('proof-result');
  if (!el) return;

  const alreadyClaimed = data.already_claimed
    ? `<div class="alert alert-warning" style="margin-top:0.5rem;margin-bottom:0.75rem;">
         <span class="alert-icon">⚠</span>
         <div>
           <strong>Already Claimed:</strong> Tokens have already been distributed to this address.
         </div>
       </div>`
    : '';

  el.innerHTML = `
    ${alreadyClaimed}
    <div class="proof-verified-card">
      <div class="proof-verified-top">
        <div class="allocation-badge">
          <div class="allocation-lbl">VERIFIED ALLOCATION</div>
          <div class="allocation-val">${data.amount.toLocaleString()} <span style="font-size:0.85rem;font-weight:600;">TOKENS</span></div>
        </div>
        <div style="text-align:right;">
          ${App.modeBadge(data.campaign_mode)}
          <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">Leaf Index: <strong>#${data.idx}</strong></div>
        </div>
      </div>

      <div style="margin-top:1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);">
            Cryptographic Merkle Proof (${data.proof_length} Hashes • Depth ${data.tree_depth})
          </div>
          <span class="badge badge-success" style="font-size:0.6rem;">Cryptographically Valid ✓</span>
        </div>
        <div class="proof-steps-clean">
          ${data.proof.map((step, i) => `
            <div class="proof-step-row" id="ps-${i}">
              <span class="proof-step-num">#${i+1}</span>
              <span class="proof-step-pos ${step.position}">${step.position.toUpperCase()}</span>
              <span class="proof-step-hash td-mono">${step.hash}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="margin-top:1rem;">
        <div style="font-size:0.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Target Merkle Root</div>
        <div class="hash-box success-hash" style="font-size:0.74rem;">${data.root}</div>
      </div>

      <div style="margin-top:1.25rem;">
        ${!data.already_claimed ? `
          <button class="btn btn-primary w-full" style="padding:0.75rem;font-size:0.95rem;font-weight:700;" onclick="submitClaim()" id="claim-submit-btn">
            Claim ${data.amount.toLocaleString()} Tokens Now
          </button>
        ` : `
          <button class="btn btn-ghost w-full" disabled style="opacity:0.6;cursor:not-allowed;padding:0.75rem;">
            Allocation Already Claimed
          </button>
        `}
      </div>
    </div>
  `;

  // Animate proof rows
  data.proof.forEach((_, i) => {
    setTimeout(() => {
      const step = document.getElementById(`ps-${i}`);
      if (step) step.classList.add('visible');
    }, i * 80 + 80);
  });
}

// ── Claim Submission ─────────────────────────────────────────────

async function submitClaim() {
  const data = ClaimSection.currentProof;
  const campaignId = ClaimSection.currentCampaign;
  if (!data || !campaignId) return;

  const btn = document.getElementById('claim-submit-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Processing claim...'; }

  try {
    const result = await API.submitClaim(campaignId, {
      address: data.address,
      amount: data.amount,
      proof: data.proof,
    });

    // Also execute on-chain smart contract transaction
    let onchainTx = null;
    if (window.Web3Client) {
      try {
        const onchainRes = await window.Web3Client.sendOnChainClaim(data.campaign_mode, data.address, data.amount, data.proof);
        if (onchainRes && onchainRes.tx) {
          onchainTx = onchainRes.tx;
        }
      } catch (err) {
        console.warn('On-chain claim sync error:', err);
      }
    }

    const resultEl = document.getElementById('proof-result');
    if (result.status === 'accepted') {
      const txInfoHtml = onchainTx ? `
        <div style="margin-top:0.75rem;padding:0.75rem;background:rgba(255,255,255,0.8);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.75rem;">
          <div style="font-weight:700;color:var(--text-primary);margin-bottom:4px;display:flex;align-items:center;gap:6px;">
            <span class="status-pulse-dot"></span>
            <span>Confirmed on EVM Blockchain (Block #${onchainTx.block_number})</span>
          </div>
          <div style="font-family:var(--font-mono);font-size:0.68rem;color:var(--text-secondary);word-break:break-all;">
            Tx Hash: <strong style="color:var(--primary);">${onchainTx.tx_hash}</strong>
          </div>
          <div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">
            Gas Used: ${onchainTx.gas_used.toLocaleString()} · Smart Contract: ${onchainTx.to}
          </div>
        </div>
      ` : '';

      resultEl.innerHTML = `
        <div class="alert alert-success" style="margin-top:0.5rem;padding:1.25rem;">
          <span class="alert-icon" style="font-size:1.6rem;">✓</span>
          <div style="width:100%;">
            <strong style="font-size:1rem;">${data.amount} Tokens Claimed Successfully!</strong><br>
            <span style="font-size:0.8rem;color:var(--text-secondary);">${result.reason}</span>
            ${txInfoHtml}
            <div style="margin-top:0.75rem;">
              <button class="btn btn-ghost btn-sm" onclick="lookupProof()">Check Allocation Again</button>
            </div>
          </div>
        </div>`;
      App.showToast('Claim accepted and tokens transferred on-chain!', 'success');
    } else {
      resultEl.innerHTML = `
        <div class="alert alert-danger" style="margin-top:0.5rem;padding:1.25rem;">
          <span class="alert-icon" style="font-size:1.6rem;">✕</span>
          <div>
            <strong style="font-size:1rem;">Claim Rejected:</strong><br>
            <span style="font-size:0.8rem;">${result.reason}</span>
          </div>
        </div>`;
      App.showToast('Claim rejected: ' + result.reason, 'danger');
    }

    await updateClaimCampaignInfo(campaignId);
    await loadClaimHistory(campaignId);
    await App.loadCampaigns();
  } catch (e) {
    App.showToast(e.message, 'danger');
    if (btn) { btn.disabled = false; btn.innerHTML = `Claim ${data.amount} Tokens Now`; }
  }
}

// ── Claim History ────────────────────────────────────────────────

async function loadClaimHistory(campaignId = null) {
  const cid = campaignId || document.getElementById('claim-campaign-select')?.value;
  const tbody = document.getElementById('claim-history-tbody');
  if (!cid) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem;">Select a campaign to view claims.</td></tr>`;
    return;
  }

  try {
    const claims = await API.getClaims(cid);
    if (!tbody) return;
    if (claims.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem;">No claims recorded yet for this campaign.</td></tr>`;
      return;
    }
    tbody.innerHTML = claims.map(c => `
      <tr>
        <td><span class="td-mono">${App.formatHash(c.address, 10)}</span></td>
        <td style="text-align:right;font-weight:700;color:var(--warning)">${c.amount}</td>
        <td style="text-align:center;"><span class="badge ${c.status === 'accepted' ? 'badge-hardened' : 'badge-naive'}">${c.status}</span></td>
        <td style="font-size:0.72rem;color:var(--text-muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${c.reason || ''}">${c.reason || '—'}</td>
        <td style="font-size:0.72rem;color:var(--text-muted);text-align:right;">${App.formatTime(c.timestamp)}</td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Failed to load claim history:', e);
  }
}

window.ClaimSection = ClaimSection;
window.lookupProof = lookupProof;
window.submitClaim = submitClaim;
window.loadClaimHistory = loadClaimHistory;
window.onClaimCampaignChange = onClaimCampaignChange;
window.setAddr = setAddr;
