/**
 * SafeDrop API Client
 * Centralised fetch wrapper for all backend calls.
 */

const API_BASE = '';

async function apiRequest(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(API_BASE + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function apiUpload(path, formData) {
  const res = await fetch(API_BASE + path, { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const API = {
  // Campaigns
  getCampaigns: () => apiRequest('GET', '/api/campaigns'),
  getCampaign: (id) => apiRequest('GET', `/api/campaigns/${id}`),
  createCampaign: (formData) => apiUpload('/api/campaigns', formData),

  // Proof & Claim
  getProof: (campaignId, address) =>
    apiRequest('GET', `/api/campaigns/${campaignId}/proof/${encodeURIComponent(address)}`),
  submitClaim: (campaignId, payload) =>
    apiRequest('POST', `/api/campaigns/${campaignId}/claim`, payload),
  getClaims: (campaignId) => apiRequest('GET', `/api/campaigns/${campaignId}/claims`),

  // Attack Lab
  getTree: (campaignId) => apiRequest('GET', `/api/campaigns/${campaignId}/tree`),
  launchAttack: (campaignId, payload) =>
    apiRequest('POST', `/api/campaigns/${campaignId}/attack`, payload),
  getAttacks: (campaignId) => apiRequest('GET', `/api/campaigns/${campaignId}/attacks`),
};

window.API = API;
