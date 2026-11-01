/**
 * SafeDrop Web3 & Blockchain Client
 * Manages EVM Wallet connection, on-chain contract transactions, and block explorer view.
 */

const Web3Client = {
  connectedAccount: null,
  accountData: null,
  chainStatus: null,
  isMetaMaskAvailable: typeof window.ethereum !== 'undefined',

  async init() {
    this._setupNavbarButton();
    await this.fetchStatus();
    // Default to first claimant account for easy local simulation
    this.connectedAccount = '0x1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B';
    await this.refreshAccount();
    this.updateWalletUI();
  },

  _setupNavbarButton() {
    const btn = document.getElementById('wallet-connect-btn');
    if (btn) {
      btn.addEventListener('click', () => this.toggleWalletModal());
    }
  },

  async fetchStatus() {
    try {
      const res = await fetch('/api/blockchain/status');
      this.chainStatus = await res.json();
      this._updateNetworkBadge();
      return this.chainStatus;
    } catch (e) {
      console.error('Failed to fetch blockchain status:', e);
    }
  },

  async refreshAccount() {
    if (!this.connectedAccount) return;
    try {
      const res = await fetch('/api/blockchain/accounts');
      const accounts = await res.json();
      this.accountData = accounts[this.connectedAccount] || { name: 'EVM Account', eth: 10.0, sft: 0.0 };
      this.updateWalletUI();
    } catch (e) {
      console.error('Failed to refresh account:', e);
    }
  },

  _updateNetworkBadge() {
    const badge = document.getElementById('network-status-badge');
    if (badge && this.chainStatus) {
      badge.innerHTML = `
        <span class="status-pulse-dot" style="background:#10b981;"></span>
        <span>EVM Block #${this.chainStatus.block_number}</span>
      `;
    }
  },

  updateWalletUI() {
    const btn = document.getElementById('wallet-connect-btn');
    if (!btn) return;
    if (this.connectedAccount) {
      const sft = this.accountData ? this.accountData.sft : 0;
      const shortAddr = this.connectedAccount.slice(0, 6) + '...' + this.connectedAccount.slice(-4);
      btn.innerHTML = `
        <span class="wallet-dot"></span>
        <span style="font-family:var(--font-mono);">${shortAddr}</span>
        <span class="badge" style="background:var(--warning-bg);color:var(--warning-text);font-size:0.65rem;font-weight:700;">${sft} SFT</span>
      `;
      btn.classList.add('wallet-connected');
    } else {
      btn.innerHTML = `
        <span style="font-size:0.9rem;">🦊</span>
        <span>Connect Wallet</span>
      `;
      btn.classList.remove('wallet-connected');
    }
  },

  async connectAccount(address) {
    this.connectedAccount = address;
    await this.refreshAccount();
    this.updateWalletUI();
    App.showToast(`Switched active EVM account to ${address.slice(0, 8)}...`, 'info');
    
    // Also auto-fill into claim address input if on claim tab
    const claimAddrInput = document.getElementById('claim-address');
    if (claimAddrInput) {
      claimAddrInput.value = address;
    }

    const modal = document.getElementById('wallet-modal');
    if (modal) modal.style.display = 'none';
  },

  toggleWalletModal() {
    let modal = document.getElementById('wallet-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'wallet-modal';
      modal.className = 'wallet-modal-overlay';
      document.body.appendChild(modal);
    }

    if (modal.style.display === 'flex') {
      modal.style.display = 'none';
      return;
    }

    const accounts = this.chainStatus?.accounts || {};
    const accountsList = Object.entries(accounts).map(([addr, data]) => {
      const isSelected = (addr.toLowerCase() === (this.connectedAccount || '').toLowerCase());
      return `
        <div class="wallet-account-row ${isSelected ? 'active' : ''}" onclick="Web3Client.connectAccount('${addr}')">
          <div>
            <div style="font-weight:700;font-size:0.8rem;color:var(--text-primary);">${data.name}</div>
            <div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-muted);">${addr}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.8rem;font-weight:700;color:var(--warning-text);">${data.sft} SFT</div>
            <div style="font-size:0.68rem;color:var(--text-muted);">${data.eth.toFixed(3)} ETH</div>
          </div>
        </div>
      `;
    }).join('');

    modal.innerHTML = `
      <div class="wallet-modal-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:1.4rem;">🦊</span>
            <div>
              <div style="font-weight:800;font-size:1rem;">EVM Web3 Wallet & Accounts</div>
              <div style="font-size:0.7rem;color:var(--text-muted);">Chain ID: 31337 · SafeDrop Local EVM</div>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('wallet-modal').style.display='none'">✕</button>
        </div>

        <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Select Active Account:</div>
        <div class="wallet-accounts-list">${accountsList}</div>

        <div style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border);">
          <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Deployed Smart Contracts:</div>
          <div style="font-size:0.7rem;color:var(--text-secondary);display:flex;flex-direction:column;gap:4px;">
            <div>SafeDropToken (ERC-20): <code style="font-family:var(--font-mono);">${this.chainStatus?.token?.address}</code></div>
            <div>NaiveAirdrop: <code style="font-family:var(--font-mono);">${this.chainStatus?.contracts?.naive_airdrop?.address}</code></div>
            <div>HardenedAirdrop: <code style="font-family:var(--font-mono);">${this.chainStatus?.contracts?.hardened_airdrop?.address}</code></div>
          </div>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
  },

  async sendOnChainClaim(mode, recipient, amount, proof) {
    const res = await fetch('/api/blockchain/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        recipient,
        amount,
        proof,
        sender: this.connectedAccount || recipient,
      }),
    });
    const data = await res.json();
    await this.fetchStatus();
    await this.refreshAccount();
    return data;
  },

  async sendOnChainAttack(level, index, forged_address, forged_amount, forged_proof) {
    const res = await fetch('/api/blockchain/attack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level,
        index,
        forged_address,
        forged_amount,
        forged_proof,
      }),
    });
    const data = await res.json();
    await this.fetchStatus();
    await this.refreshAccount();
    return data;
  }
};

window.Web3Client = Web3Client;
