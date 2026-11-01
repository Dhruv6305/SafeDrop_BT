/**
 * Admin Section
 * Campaign creation (CSV paste + file upload) and campaign list management.
 */

const AdminSection = {
  selectedMode: 'naive',

  onEnter() {
    AdminSection.renderCampaignList(App.campaigns);
  },

  renderCampaignList(campaigns) {
    const tbody = document.getElementById('admin-campaign-tbody');
    if (tbody) {
      if (!campaigns || campaigns.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem;">No campaigns yet.</td></tr>';
      } else {
        tbody.innerHTML = campaigns.map(c => `
          <tr>
            <td><span style="color:var(--text-muted);font-size:0.75rem;">#${c.id}</span> ${c.name}</td>
            <td>${App.modeBadge(c.mode)}</td>
            <td id="adm-fp-${c.id}"></td>
            <td style="text-align:center;">${c.total_recipients}</td>
            <td style="text-align:center;">${c.total_claims}</td>
            <td style="text-align:center;color:${c.total_attacks > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${c.total_attacks}</td>
          </tr>
        `).join('');
        // Inject identicons in the root hash column
        setTimeout(() => {
          campaigns.forEach(c => {
            const cell = document.getElementById(`adm-fp-${c.id}`);
            if (cell && c.root) {
              const fp = hashFingerprint(c.root, 18, 8);
              cell.appendChild(fp);
            }
          });
        }, 50);
      }
    }

    // Visual mini-cards in the preview column
    const cards = document.getElementById('admin-campaign-cards');
    if (cards) {
      if (!campaigns || campaigns.length === 0) {
        cards.innerHTML = '<div style="font-size:0.8rem;color:var(--text-muted);">No campaigns yet.</div>';
      } else {
        cards.innerHTML = campaigns.map(c => `
          <div class="home-campaign-card ${c.mode}" style="cursor:default;padding:0.75rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <div style="font-size:0.75rem;font-weight:700;color:var(--text-primary);">${c.name}</div>
              ${App.modeBadge(c.mode)}
            </div>
            <div id="adm-card-fp-${c.id}" style="margin-bottom:6px;"></div>
            <div style="display:flex;gap:8px;font-size:0.65rem;color:var(--text-muted);">
              <span>D:${c.depth}</span>
              <span>${c.total_recipients} recip</span>
              <span style="color:var(--danger)">${c.total_attacks} atk</span>
            </div>
          </div>
        `).join('');
        setTimeout(() => {
          campaigns.forEach(c => {
            const el = document.getElementById(`adm-card-fp-${c.id}`);
            if (el && c.root) { const fp = hashFingerprint(c.root, 20, 10); el.appendChild(fp); }
          });
        }, 50);
      }
    }
  },
};

// ── Form Event Wiring ─────────────────────────────────────────────

function selectMode(mode) {
  AdminSection.selectedMode = mode;
  document.querySelectorAll('.mode-visual-option').forEach(opt => {
    opt.classList.remove('mode-visual-active');
  });
  const el = document.getElementById(`mode-${mode}`);
  if (el) el.classList.add('mode-visual-active');
  const input = document.getElementById('mode-input');
  if (input) input.value = mode;
}


function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const textarea = document.getElementById('csv-textarea');
    if (textarea) textarea.value = e.target.result;
  };
  reader.readAsText(file);
  App.showToast(`Loaded: ${file.name}`, 'success');
}

function loadSampleCSV() {
  const sample = `0x1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B,100
0x3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D,250
0x5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D3E4F,500
0x7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D3E4F5A6B,75
0x9C0D1E2F3A4B5C6D7E8F9A0B1C2D3E4F5A6B7C8D,1000
0xABCDEF0123456789ABCDEF0123456789ABCDEF01,150
0xEF0123456789ABCDEF0123456789ABCDEF012345,300
0x23456789ABCDEF0123456789ABCDEF0123456789,200`;
  const textarea = document.getElementById('csv-textarea');
  if (textarea) textarea.value = sample;
  App.showToast('Sample CSV loaded!', 'info');
}

async function submitCreateCampaign(event) {
  if (event) event.preventDefault();
  const btn = document.getElementById('build-tree-btn')
    || (event && (event.currentTarget || (event.target && event.target.closest('button'))));
  const statusEl = document.getElementById('create-status');

  const nameInput = document.getElementById('campaign-name');
  const modeInput = document.getElementById('mode-input');
  const csvTextarea = document.getElementById('csv-textarea');
  const fileInput = document.getElementById('csv-file');

  const name = nameInput ? nameInput.value.trim() : '';
  const mode = modeInput ? modeInput.value : '';
  const csvText = csvTextarea ? csvTextarea.value.trim() : '';

  if (!name) { showStatus(statusEl, 'Campaign name is required.', 'danger'); return; }
  if (!mode) { showStatus(statusEl, 'Please select a mode.', 'danger'); return; }
  if (!csvText) { showStatus(statusEl, 'Please enter or upload recipient list.', 'danger'); return; }

  const originalBtnHtml = btn ? btn.innerHTML : 'Build Tree';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Building tree...';
  }
  clearStatus(statusEl);

  try {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('mode', mode);
    formData.append('csv_text', csvText);

    const result = await API.createCampaign(formData);

    showStatus(statusEl, `
      <strong>Campaign created!</strong><br>
      ID: #${result.id} &nbsp;|&nbsp; Root: <code style="font-family:var(--font-mono);font-size:0.75rem;">${result.root.slice(0,24)}...</code><br>
      Depth: ${result.depth} &nbsp;|&nbsp; Recipients: ${result.total_recipients}
    `, 'success');

    if (nameInput) nameInput.value = '';
    if (csvTextarea) csvTextarea.value = '';
    if (fileInput) fileInput.value = '';
    selectMode('naive');
    await App.loadCampaigns();
    App.showToast(`Campaign "${result.name}" created!`, 'success');

  } catch (e) {
    showStatus(statusEl, e.message, 'danger');
    App.showToast(e.message, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalBtnHtml;
    }
  }
}

function showStatus(el, msg, type) {
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.innerHTML = `<span class="alert-icon">${type === 'success' ? '✓' : '✕'}</span><div>${msg}</div>`;
  el.style.display = 'flex';
}
function clearStatus(el) {
  if (!el) return;
  el.style.display = 'none';
  el.innerHTML = '';
}

window.AdminSection = AdminSection;
window.selectMode = selectMode;
window.handleFileSelect = handleFileSelect;
window.loadSampleCSV = loadSampleCSV;
window.submitCreateCampaign = submitCreateCampaign;
