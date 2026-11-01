/**
 * SafeDrop Hash Identicon Generator
 * Converts any SHA-256 hex hash into a unique 5×5 colored pixel fingerprint SVG.
 * Visually distinct hashes make tampered data instantly recognizable.
 */

const IDENTICON_PALETTE = [
  '#4f46e5','#6366f1','#818cf8',   // indigo family
  '#0d9488','#14b8a6','#2dd4bf',   // teal family
  '#059669','#10b981','#34d399',   // emerald family
  '#d97706','#f59e0b','#fbbf24',   // amber family
  '#e11d48','#f43f5e','#fb7185',   // rose family
  '#7c3aed','#8b5cf6','#a78bfa',   // violet family
  '#0284c7','#0ea5e9','#38bdf8',   // sky family
];

/**
 * Generate a 5×5 identicon SVG element from a hash string.
 * @param {string} hash - Hex hash string (any length ≥ 8)
 * @param {number} size - SVG width/height in pixels
 * @param {string} [borderRadius] - CSS border-radius for the SVG wrapper
 * @returns {SVGElement}
 */
function makeIdenticon(hash, size = 32, borderRadius = '6px') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 5 5');
  svg.style.borderRadius = borderRadius;
  svg.style.flexShrink = '0';

  if (!hash || hash.length < 8) {
    // Fallback: solid indigo square
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('width', '5'); rect.setAttribute('height', '5');
    rect.setAttribute('fill', '#4f46e5');
    svg.appendChild(rect);
    return svg;
  }

  // Derive color palette from first 6 chars of hash
  const seed = parseInt(hash.slice(0, 8), 16);
  const color1 = IDENTICON_PALETTE[seed % IDENTICON_PALETTE.length];
  const color2 = IDENTICON_PALETTE[(seed >> 4) % IDENTICON_PALETTE.length];
  const bgColor = '#f8fafc'; // near-white background

  // Background
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', '5'); bg.setAttribute('height', '5');
  bg.setAttribute('fill', bgColor);
  svg.appendChild(bg);

  // Mirror pattern: compute left half (3 cols), mirror to right
  // Use hash bytes to determine which cells are filled
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const byteIdx = (row * 3 + col) % (hash.length / 2);
      const byte = parseInt(hash.slice(byteIdx * 2, byteIdx * 2 + 2), 16);
      const filled = byte > 128; // ~50% density

      if (!filled) continue;

      const colorBit = parseInt(hash.slice((row + col) % (hash.length - 2), (row + col) % (hash.length - 2) + 2), 16);
      const fill = colorBit % 3 === 0 ? color1 : color2;

      // Left cell
      const r1 = document.createElementNS(ns, 'rect');
      r1.setAttribute('x', col); r1.setAttribute('y', row);
      r1.setAttribute('width', '1'); r1.setAttribute('height', '1');
      r1.setAttribute('fill', fill);
      svg.appendChild(r1);

      // Mirror (right side, skip center col 2)
      if (col < 2) {
        const r2 = document.createElementNS(ns, 'rect');
        r2.setAttribute('x', 4 - col); r2.setAttribute('y', row);
        r2.setAttribute('width', '1'); r2.setAttribute('height', '1');
        r2.setAttribute('fill', fill);
        svg.appendChild(r2);
      }
    }
  }

  return svg;
}

/**
 * Generate identicon as an HTML img-like div with inline SVG.
 * @param {string} hash
 * @param {number} size
 * @param {object} opts - { borderRadius, title, className }
 */
function makeIdenticonEl(hash, size = 32, opts = {}) {
  const wrap = document.createElement('div');
  wrap.style.cssText = `
    width:${size}px; height:${size}px; flex-shrink:0;
    border-radius:${opts.borderRadius || '6px'};
    overflow:hidden; display:inline-flex;
    border: 1.5px solid rgba(0,0,0,0.08);
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  `;
  if (opts.className) wrap.className = opts.className;
  if (opts.title) wrap.title = opts.title;

  const svg = makeIdenticon(hash, size, opts.borderRadius || '6px');
  wrap.appendChild(svg);
  return wrap;
}

/**
 * Create a hash "fingerprint display": identicon + short mono string.
 * @param {string} hash - full hex hash
 * @param {number} iconSize
 * @param {number} chars - how many chars of hash to show
 */
function hashFingerprint(hash, iconSize = 28, chars = 8) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px;';

  const icon = makeIdenticonEl(hash, iconSize, { borderRadius: '4px', title: hash });
  const label = document.createElement('span');
  label.style.cssText = `
    font-family:var(--font-mono);font-size:${Math.max(9, iconSize * 0.38)}px;
    color:var(--primary-text);letter-spacing:0.02em;font-weight:500;
  `;
  label.textContent = hash ? hash.slice(0, chars) : '——';
  label.title = hash || '';

  wrap.appendChild(icon);
  wrap.appendChild(label);
  return wrap;
}

window.makeIdenticon    = makeIdenticon;
window.makeIdenticonEl  = makeIdenticonEl;
window.hashFingerprint  = hashFingerprint;
