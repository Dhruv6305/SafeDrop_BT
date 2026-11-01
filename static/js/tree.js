/**
 * SafeDrop Merkle Tree Visualizer v3 — Visual-First Edition
 * Features: hash identicons · padlock status icons · animated edge pulses
 *           auto-zoom/pan · spring node entry · red attack path with sparks
 */

class MerkleTreeVisualizer {
  constructor(svgId, options = {}) {
    this.svgId = svgId;
    this.svg = null;
    this.levels = null;
    this.depth = 0;
    this.root = null;
    this.nodePositions = {};
    this.nodeElements  = {};
    this.onNodeClick   = options.onNodeClick || null;
    this.selectedNode  = null;
    this.attackPathIds = [];
    this._pulseIntervals = [];
    this._edgePulses = [];

    // Visual config
    this.NODE_R  = 26;
    this.LEAF_R  = 20;
    this.PAD_X   = 60;
    this.PAD_Y   = 72;
    this.LEVEL_H = 116;

    // Pan/zoom state
    this._zoom   = 1;
    this._panX   = 0;
    this._panY   = 0;
    this._isDragging = false;
    this._dragStart  = { x: 0, y: 0 };

    // Colors
    this.C = {
      leaf:     { fill: '#f0fdfa', stroke: '#0d9488', text: '#0f766e', glow: 'url(#glow-teal)' },
      internal: { fill: '#eef2ff', stroke: '#4f46e5', text: '#3730a3', glow: 'url(#glow-indigo)' },
      root:     { fill: '#fffbeb', stroke: '#d97706', text: '#92400e', glow: 'url(#glow-amber)' },
      selected: { fill: '#fff1f2', stroke: '#e11d48', text: '#be123c', glow: 'url(#glow-red)' },
      proof:    { fill: '#ecfdf5', stroke: '#059669', text: '#047857', glow: 'url(#glow-green)' },
      edge:     '#cbd5e1',
      pulse:    '#0d9488',
      attackEdge: '#e11d48',
    };
  }

  // ── Mount ──────────────────────────────────────────────────────────

  mount(svgElement) {
    this.svg = svgElement;
    this._setupPanZoom();
    this._resize();
  }

  _resize() {
    if (!this.svg) return;
    const container = this.svg.parentElement;
    this.W = container ? (container.clientWidth || 700) : 700;
    this.H = Math.max(380, (this.depth + 1) * this.LEVEL_H + this.PAD_Y * 2);
    this.svg.setAttribute('viewBox', `0 0 ${this.W} ${this.H}`);
    this.svg.setAttribute('width',  '100%');
    this.svg.setAttribute('height', this.H);
  }

  _setupPanZoom() {
    if (!this.svg) return;
    // Subtle pan on drag
    this.svg.addEventListener('mousedown', e => {
      if (e.target === this.svg || e.target.classList.contains('bg-grid')) {
        this._isDragging = true;
        this._dragStart = { x: e.clientX - this._panX, y: e.clientY - this._panY };
        this.svg.style.cursor = 'grabbing';
      }
    });
    document.addEventListener('mousemove', e => {
      if (!this._isDragging) return;
      this._panX = e.clientX - this._dragStart.x;
      this._panY = e.clientY - this._dragStart.y;
      this._applyTransform();
    });
    document.addEventListener('mouseup', () => {
      this._isDragging = false;
      if (this.svg) this.svg.style.cursor = '';
    });
    // Wheel zoom
    this.svg.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this._zoom = Math.min(2.5, Math.max(0.4, this._zoom * delta));
      this._applyTransform();
    }, { passive: false });
  }

  _applyTransform() {
    const g = this.svg.getElementById('transform-group');
    if (g) g.setAttribute('transform', `translate(${this._panX},${this._panY}) scale(${this._zoom})`);
  }

  _autoCenter() {
    this._panX = 0; this._panY = 0; this._zoom = 1;
    this._applyTransform();
  }

  _zoomToNode(key) {
    const pos = this.nodePositions[key];
    if (!pos || !this.svg) return;
    const svgRect = this.svg.getBoundingClientRect();
    const cW = svgRect.width  || this.W;
    const cH = svgRect.height || this.H;
    const targetZoom = 1.4;
    this._zoom = targetZoom;
    this._panX = cW / 2 - pos.cx * targetZoom;
    this._panY = cH / 2 - pos.cy * targetZoom;
    // Animate the pan
    const g = this.svg.getElementById('transform-group');
    if (g) {
      g.style.transition = 'transform 0.5s cubic-bezier(0.4,0,0.2,1)';
      this._applyTransform();
      setTimeout(() => { if(g) g.style.transition = ''; }, 600);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────

  render(levels, depth, root) {
    this.levels = levels;
    this.depth  = depth;
    this.root   = root;
    this.nodePositions = {};
    this.nodeElements  = {};
    this.selectedNode  = null;
    this.attackPathIds = [];
    this._stopAllPulses();

    this._resize();
    this.svg.innerHTML = '';

    this._renderDefs();

    // Create transform group for pan/zoom
    const tg = this._el('g', { id: 'transform-group' });
    this.svg.appendChild(tg);
    this._tg = tg;

    this._computePositions();
    this._renderEdges(tg);
    this._renderNodes(tg);
    this._startEdgePulses();
  }

  _renderDefs() {
    const defs = this._el('defs');

    // Glow filters
    [
      { id: 'glow-teal',   color: '#0d9488' },
      { id: 'glow-indigo', color: '#4f46e5' },
      { id: 'glow-amber',  color: '#d97706' },
      { id: 'glow-red',    color: '#e11d48' },
      { id: 'glow-green',  color: '#059669' },
    ].forEach(({ id, color }) => {
      const f = this._el('filter', { id, x:'-60%', y:'-60%', width:'220%', height:'220%' });
      const blur  = this._el('feGaussianBlur', { stdDeviation:'4', result:'blur' });
      const flood = this._el('feFlood', { 'flood-color':color, 'flood-opacity':'0.5', result:'color' });
      const comp  = this._el('feComposite', { in:'color', in2:'blur', operator:'in', result:'glow' });
      const merge = this._el('feMerge');
      merge.appendChild(this._el('feMergeNode', { in:'glow' }));
      merge.appendChild(this._el('feMergeNode', { in:'SourceGraphic' }));
      [blur, flood, comp, merge].forEach(c => f.appendChild(c));
      defs.appendChild(f);
    });

    this.svg.appendChild(defs);
  }

  _computePositions() {
    const totalLevels = this.levels.length;
    for (let lvl = 0; lvl < totalLevels; lvl++) {
      const nodes = this.levels[lvl];
      const n = nodes.length;
      const spacing = (this.W - this.PAD_X * 2) / Math.max(n - 1, 1);
      for (let i = 0; i < n; i++) {
        const cx = n === 1 ? this.W / 2 : this.PAD_X + i * spacing;
        const cy = this.PAD_Y + (totalLevels - 1 - lvl) * this.LEVEL_H;
        this.nodePositions[`${lvl}-${i}`] = { cx, cy };
      }
    }
  }

  _renderEdges(parent) {
    const edgeGroup = this._el('g', { id: 'edge-group' });
    const totalLevels = this.levels.length;

    for (let lvl = 1; lvl < totalLevels; lvl++) {
      for (let i = 0; i < this.levels[lvl].length; i++) {
        const parentPos = this.nodePositions[`${lvl}-${i}`];
        [i * 2, i * 2 + 1].forEach(childIdx => {
          const childPos = this.nodePositions[`${lvl - 1}-${childIdx}`];
          if (!childPos) return;

          const len = Math.hypot(childPos.cx - parentPos.cx, childPos.cy - parentPos.cy);
          const edgeId = `edge-${lvl}-${i}-${childIdx}`;

          const path = this._el('path', {
            id: edgeId,
            d: `M ${parentPos.cx} ${parentPos.cy} L ${childPos.cx} ${childPos.cy}`,
            stroke: this.C.edge,
            'stroke-width': '1.5',
            fill: 'none',
            'stroke-linecap': 'round',
          });

          // Animate stroke draw
          path.style.strokeDasharray = len;
          path.style.strokeDashoffset = len;
          const delay = (totalLevels - 1 - lvl) * 120 + childIdx * 40;
          setTimeout(() => {
            path.style.transition = `stroke-dashoffset 0.45s ease ${delay}ms`;
            path.style.strokeDashoffset = '0';
          }, 100);

          edgeGroup.appendChild(path);

          // Store edge meta for pulse system
          this._edgePulses.push({ edgeId, from: parentPos, to: childPos, lvl, i, childIdx });
        });
      }
    }
    parent.appendChild(edgeGroup);
    this._edgePulseGroup = this._el('g', { id: 'pulse-group' });
    parent.appendChild(this._edgePulseGroup);
  }

  // ── Edge Pulses (traveling dots along edges) ───────────────────────

  _startEdgePulses() {
    if (window.prefersReducedMotion?.()) return;
    const delay = this.levels ? this.levels.length * 120 + 800 : 800;
    setTimeout(() => this._spawnPulses(), delay);
  }

  _spawnPulses() {
    this._edgePulses.forEach((edge, idx) => {
      const interval = setInterval(() => {
        if (!this.svg || !this._edgePulseGroup) { clearInterval(interval); return; }
        this._animatePulse(edge);
      }, 2200 + idx * 340);
      this._pulseIntervals.push(interval);
      // Stagger first pulse
      setTimeout(() => this._animatePulse(edge), 400 + idx * 200);
    });
  }

  _animatePulse(edge) {
    if (!this._edgePulseGroup || !this.svg) return;
    const dot = this._el('circle', {
      cx: edge.from.cx, cy: edge.from.cy,
      r: '3.5',
      fill: this.C.pulse,
      opacity: '0',
    });
    dot.style.filter = 'url(#glow-teal)';
    this._edgePulseGroup.appendChild(dot);

    const duration = 700 + Math.random() * 300;
    const start = performance.now();
    const fx = edge.from.cx, fy = edge.from.cy;
    const tx = edge.to.cx,   ty = edge.to.cy;

    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t; // ease-in-out
      dot.setAttribute('cx', fx + (tx - fx) * ease);
      dot.setAttribute('cy', fy + (ty - fy) * ease);
      dot.setAttribute('opacity', t < 0.15 ? t/0.15 : t > 0.85 ? (1-t)/0.15 : 1);
      if (t < 1) requestAnimationFrame(tick);
      else dot.remove();
    };
    requestAnimationFrame(tick);
  }

  _stopAllPulses() {
    this._pulseIntervals.forEach(clearInterval);
    this._pulseIntervals = [];
    this._edgePulses = [];
    const pg = this.svg?.getElementById?.('pulse-group');
    if (pg) pg.innerHTML = '';
  }

  // ── Nodes ──────────────────────────────────────────────────────────

  _renderNodes(parent) {
    const nodeGroup = this._el('g', { id: 'node-group' });
    const totalLevels = this.levels.length;

    for (let lvl = 0; lvl < totalLevels; lvl++) {
      const nodes = this.levels[lvl];
      const isRoot   = lvl === totalLevels - 1;
      const isLeaves = lvl === 0;

      for (let i = 0; i < nodes.length; i++) {
        const pos = this.nodePositions[`${lvl}-${i}`];
        const node = nodes[i];
        const key = `${lvl}-${i}`;
        const scheme = isRoot ? this.C.root : isLeaves ? this.C.leaf : this.C.internal;
        const r = isLeaves ? this.LEAF_R : this.NODE_R;
        const isClickable = !isRoot && !isLeaves && !!this.onNodeClick;

        const g = this._el('g', {
          class: 'node-g',
          id: `node-${key}`,
          style: isClickable ? 'cursor:pointer' : 'cursor:default',
        });

        // Glow ring (hover/select)
        const ring = this._el('circle', {
          cx: pos.cx, cy: pos.cy, r: r + 8,
          fill: 'none',
          stroke: scheme.stroke,
          'stroke-width': '2.5',
          opacity: '0',
          id: `ring-${key}`,
        });
        g.appendChild(ring);

        // Main circle
        const circle = this._el('circle', {
          cx: pos.cx, cy: pos.cy, r,
          fill: scheme.fill,
          stroke: scheme.stroke,
          'stroke-width': isRoot ? '2.5' : '2',
          id: `circle-${key}`,
        });
        g.appendChild(circle);

        // Identicon (clipped to circle)
        const clipId = `clip-${key}`;
        const defs = this.svg.querySelector('defs') || this._el('defs');
        const clipPath = this._el('clipPath', { id: clipId });
        const clipCircle = this._el('circle', { cx: pos.cx, cy: pos.cy, r: r - 3 });
        clipPath.appendChild(clipCircle);
        defs.appendChild(clipPath);

        // Draw identicon pixels
        if (node.hash) {
          this._renderIdenticonOnSVG(g, node.hash, pos.cx, pos.cy, r - 4, clipId);
        }

        // Padlock icon
        const lockY = pos.cy + r + 14;
        const lockG = this._el('g', { id: `lock-${key}`, opacity: '0.85' });
        const lockBg = this._el('circle', {
          cx: pos.cx, cy: lockY, r: '8',
          fill: isRoot ? '#fffbeb' : isLeaves ? '#f0fdfa' : '#f5f3ff',
          stroke: scheme.stroke, 'stroke-width': '1.2',
        });
        lockG.appendChild(lockBg);
        const lockIcon = this._el('text', {
          x: pos.cx, y: lockY + 4,
          'text-anchor': 'middle',
          'font-size': '9',
          'pointer-events': 'none',
        });
        lockIcon.textContent = isLeaves ? '🔒' : isRoot ? '🔑' : '🔒';
        lockIcon.id = `lockicon-${key}`;
        lockG.appendChild(lockIcon);
        g.appendChild(lockG);

        // Level label (tiny, below lock)
        if (!isLeaves) {
          const lbl = this._el('text', {
            x: pos.cx, y: lockY + 22,
            'text-anchor': 'middle',
            fill: scheme.text,
            'font-size': '9',
            'font-family': 'Inter,sans-serif',
            'font-weight': '600',
            opacity: '0.65',
            'pointer-events': 'none',
          });
          lbl.textContent = isRoot ? 'ROOT' : `L${lvl}·${i}`;
          g.appendChild(lbl);
        }

        // Leaf index
        if (isLeaves) {
          const lbl = this._el('text', {
            x: pos.cx, y: lockY + 22,
            'text-anchor': 'middle',
            fill: scheme.text,
            'font-size': '8.5', 'font-family': 'Inter,sans-serif',
            'font-weight': '500', opacity: '0.6',
            'pointer-events': 'none',
          });
          lbl.textContent = `#${i}`;
          g.appendChild(lbl);
        }

        // Click / hover events
        if (isClickable) {
          g.addEventListener('mouseenter', () => this._hover(key, true, scheme));
          g.addEventListener('mouseleave', () => this._hover(key, false, scheme));
          g.addEventListener('click', () => {
            this._select(lvl, i, scheme);
            if (this.onNodeClick) this.onNodeClick({ level: lvl, index: i }, pos);
          });
        }

        // Tooltip on all nodes
        g.addEventListener('mouseenter', (e) => this._showTooltip(node, lvl, i, isRoot, isLeaves, e));
        g.addEventListener('mouseleave', () => this._hideTooltip());

        // Spring entrance animation
        g.style.transformOrigin = `${pos.cx}px ${pos.cy}px`;
        g.style.transform = 'scale(0)';
        g.style.opacity = '0';
        const delay = (totalLevels - 1 - lvl) * 100 + i * 55 + 250;
        setTimeout(() => {
          g.style.transition = 'transform 0.55s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease';
          g.style.transform = 'scale(1)';
          g.style.opacity = '1';
        }, delay);

        nodeGroup.appendChild(g);
        this.nodeElements[key] = g;
      }
    }
    parent.appendChild(nodeGroup);
  }

  // ── Identicon pixels in SVG ────────────────────────────────────────

  _renderIdenticonOnSVG(parent, hash, cx, cy, r, clipId) {
    if (!hash || hash.length < 8) return;

    const PALETTE = [
      '#4f46e5','#6366f1','#0d9488','#14b8a6',
      '#059669','#d97706','#e11d48','#7c3aed','#0284c7',
    ];

    const seed = parseInt(hash.slice(0, 8), 16);
    const c1 = PALETTE[seed % PALETTE.length];
    const c2 = PALETTE[(seed >> 4) % PALETTE.length];

    const pixSize = (r * 2) / 5;
    const startX  = cx - r;
    const startY  = cy - r;

    const group = this._el('g', {
      'clip-path': `url(#${clipId})`,
      opacity: '0.45',
    });

    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        const byteIdx = (row * 3 + col) % Math.floor(hash.length / 2);
        const byte = parseInt(hash.slice(byteIdx * 2, byteIdx * 2 + 2), 16);
        if (byte <= 128) continue;

        const colorBit = parseInt(hash.slice((row + col * 2) % (hash.length - 2), (row + col * 2) % (hash.length - 2) + 2), 16);
        const fill = colorBit % 2 === 0 ? c1 : c2;

        const cols = col === 2 ? [col] : [col, 4 - col]; // mirror
        cols.forEach(c => {
          const rect = this._el('rect', {
            x: startX + c * pixSize,
            y: startY + row * pixSize,
            width: pixSize, height: pixSize,
            fill,
          });
          group.appendChild(rect);
        });
      }
    }
    parent.appendChild(group);
  }

  // ── Node Tooltip ──────────────────────────────────────────────────

  _showTooltip(node, lvl, idx, isRoot, isLeaves, e) {
    let tt = document.getElementById('node-tooltip');
    if (!tt) {
      tt = document.createElement('div');
      tt.id = 'node-tooltip';
      document.body.appendChild(tt);
    }

    const role = isRoot ? 'Root' : isLeaves ? `Leaf #${idx}` : `Internal L${lvl}:${idx}`;
    const hash = node.hash || '';

    // Build identicon HTML
    const icoEl = makeIdenticonEl(hash, 36, { borderRadius: '6px' });

    tt.innerHTML = '';
    tt.appendChild(icoEl);

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;';
    info.innerHTML = `
      <div style="font-weight:700;font-size:0.78rem;color:#131b2e;margin-bottom:2px;">${role}</div>
      <div style="font-family:'JetBrains Mono',mono;font-size:0.65rem;color:#3730a3;
           word-break:break-all;line-height:1.4;">${hash.slice(0,32) || '—'}</div>
      ${!isLeaves && !isRoot ? '<div style="font-size:0.62rem;color:#e11d48;margin-top:3px;font-weight:600;">Click to select as attack target</div>' : ''}
    `;
    tt.appendChild(info);

    tt.style.display = 'flex';
    tt.style.gap     = '8px';
    tt.style.alignItems = 'flex-start';

    // Position tooltip
    const svgRect = this.svg.getBoundingClientRect();
    const ttLeft = e.clientX - svgRect.left + 14;
    const ttTop  = e.clientY - svgRect.top  - 20;
    tt.style.left = ttLeft + 'px';
    tt.style.top  = ttTop  + 'px';
    tt.style.opacity = '1';
    tt.style.pointerEvents = 'none';
  }

  _hideTooltip() {
    const tt = document.getElementById('node-tooltip');
    if (tt) tt.style.opacity = '0';
  }

  // ── Hover / Select ────────────────────────────────────────────────

  _hover(key, enter, scheme) {
    if (key === this.selectedNode) return;
    const ring = document.getElementById(`ring-${key}`);
    const circle = document.getElementById(`circle-${key}`);
    if (ring) ring.setAttribute('opacity', enter ? '0.6' : '0');
    if (circle && enter) {
      circle.style.filter = scheme.glow;
      circle.setAttribute('r', String(this.NODE_R + 2));
    } else if (circle) {
      circle.style.filter = '';
      circle.setAttribute('r', String(this.NODE_R));
    }
  }

  _select(lvl, idx, scheme) {
    const key = `${lvl}-${idx}`;
    // Deselect previous
    if (this.selectedNode && this.selectedNode !== key) {
      this._deselect(this.selectedNode);
    }
    this.selectedNode = key;

    const circle = document.getElementById(`circle-${key}`);
    const ring   = document.getElementById(`ring-${key}`);
    const lock   = document.getElementById(`lockicon-${key}`);

    if (circle) {
      circle.setAttribute('fill',   this.C.selected.fill);
      circle.setAttribute('stroke', this.C.selected.stroke);
      circle.setAttribute('stroke-width', '3');
      circle.style.filter = 'url(#glow-red)';
    }
    if (ring) {
      ring.setAttribute('stroke', this.C.selected.stroke);
      ring.setAttribute('opacity', '1');
      ring.setAttribute('r', String(this.NODE_R + 10));
      ring.style.animation = 'ringPulse 1.5s ease-in-out infinite';
    }
    if (lock) { lock.textContent = '🔓'; }

    // Auto-zoom to selected node
    setTimeout(() => this._zoomToNode(key), 100);
  }

  _deselect(key) {
    const [lvl] = key.split('-').map(Number);
    const totalLevels = this.levels?.length || 1;
    const isRoot   = lvl === totalLevels - 1;
    const isLeaves = lvl === 0;
    const scheme = isRoot ? this.C.root : isLeaves ? this.C.leaf : this.C.internal;
    const r = isLeaves ? this.LEAF_R : this.NODE_R;

    const circle = document.getElementById(`circle-${key}`);
    const ring   = document.getElementById(`ring-${key}`);
    const lock   = document.getElementById(`lockicon-${key}`);

    if (circle) {
      circle.setAttribute('fill', scheme.fill);
      circle.setAttribute('stroke', scheme.stroke);
      circle.setAttribute('stroke-width', isRoot ? '2.5' : '2');
      circle.setAttribute('r', r);
      circle.style.filter = '';
    }
    if (ring) { ring.setAttribute('opacity', '0'); ring.style.animation = ''; }
    if (lock)  { lock.textContent = isLeaves ? '🔒' : isRoot ? '🔑' : '🔒'; }
  }

  clearSelection() {
    if (this.selectedNode) this._deselect(this.selectedNode);
    this.selectedNode = null;
    this._clearAttackPath();
    this._autoCenter();
  }

  // ── Proof Path Highlight ───────────────────────────────────────────

  highlightProofPath(leafIdx, proof) {
    if (!this.levels) return;
    let cur = leafIdx, curLvl = 0;

    this._highlightNode(`${curLvl}-${cur}`, this.C.proof);

    proof.forEach((step, i) => {
      setTimeout(() => {
        const sibIdx = step.position === 'right' ? cur + 1 : cur - 1;
        this._highlightNode(`${curLvl}-${sibIdx}`, { ...this.C.proof, fill: '#d1fae5' });
        this._highlightEdgeTeal(curLvl, Math.floor(cur/2), cur);
        cur = Math.floor(cur/2);
        curLvl++;
        setTimeout(() => this._highlightNode(`${curLvl}-${cur}`, this.C.proof), 200);
      }, i * 240);
    });
  }

  _highlightNode(key, scheme) {
    const circle = document.getElementById(`circle-${key}`);
    if (!circle) return;
    circle.setAttribute('fill', scheme.fill);
    circle.setAttribute('stroke', scheme.stroke);
    circle.style.filter = scheme.glow || 'url(#glow-green)';
  }

  _highlightEdgeTeal(toLvl, toIdx, fromIdx) {
    const el = document.getElementById(`edge-${toLvl+1}-${toIdx}-${fromIdx}`);
    if (!el) return;
    el.setAttribute('stroke', '#0d9488');
    el.setAttribute('stroke-width', '2.5');
    el.style.filter = 'url(#glow-teal)';
  }

  // ── Attack Path Animation ──────────────────────────────────────────

  async animateAttackPath(nodeLvl, nodeIdx, forgedProof) {
    this._clearAttackPath();

    const selKey = `${nodeLvl}-${nodeIdx}`;
    const selCircle = document.getElementById(`circle-${selKey}`);
    if (selCircle) {
      selCircle.style.filter = 'url(#glow-red)';
      selCircle.setAttribute('stroke-width', '3.5');
    }

    await this._delay(350);

    let curLvl = nodeLvl, curIdx = nodeIdx;

    for (let i = 0; i < forgedProof.length; i++) {
      const parentLvl = curLvl + 1;
      const parentIdx = Math.floor(curIdx / 2);
      await this._drawRedEdge(curLvl, curIdx, parentLvl, parentIdx);

      const parentKey = `${parentLvl}-${parentIdx}`;
      const pCircle = document.getElementById(`circle-${parentKey}`);
      if (pCircle) {
        pCircle.style.transition = 'fill 0.3s, stroke 0.3s';
        pCircle.setAttribute('fill', '#fff1f2');
        pCircle.setAttribute('stroke', '#e11d48');
        pCircle.style.filter = 'url(#glow-red)';
      }
      const pLock = document.getElementById(`lockicon-${parentKey}`);
      if (pLock) {
        pLock.textContent = '🔓';
        pLock.style.animation = 'crackShake 0.4s ease';
      }

      await this._delay(480);
      curIdx = parentIdx;
      curLvl = parentLvl;
    }

    // Root flashes red
    const rootKey = `${this.levels.length - 1}-0`;
    ['circle', 'lockicon'].forEach(pfx => {
      const el = document.getElementById(`${pfx}-${rootKey}`);
      if (!el) return;
      if (pfx === 'circle') {
        el.setAttribute('fill', '#fff1f2');
        el.setAttribute('stroke', '#e11d48');
        el.style.filter = 'url(#glow-red)';
      } else { el.textContent = '💥'; }
    });

    await this._delay(300);
  }

  async _drawRedEdge(fromLvl, fromIdx, toLvl, toIdx) {
    const fp = this.nodePositions[`${fromLvl}-${fromIdx}`];
    const tp = this.nodePositions[`${toLvl}-${toIdx}`];
    if (!fp || !tp) return;

    const len = Math.hypot(tp.cx - fp.cx, tp.cy - fp.cy);
    const id  = `attack-e-${fromLvl}-${fromIdx}`;
    const line = this._el('path', {
      id, d: `M ${fp.cx} ${fp.cy} L ${tp.cx} ${tp.cy}`,
      stroke: '#e11d48', 'stroke-width': '3',
      'stroke-dasharray': '8 5', 'stroke-linecap': 'round',
      fill: 'none', opacity: '0',
      class: 'attack-edge',
    });
    line.style.filter = 'url(#glow-red)';
    line.style.strokeDasharray = len;
    line.style.strokeDashoffset = len;

    if (this._tg) this._tg.appendChild(line);
    this.attackPathIds.push(id);

    return new Promise(resolve => {
      requestAnimationFrame(() => {
        line.style.opacity = '1';
        line.style.transition = 'stroke-dashoffset 0.42s cubic-bezier(0.4,0,0.2,1)';
        line.style.strokeDashoffset = '0';
        setTimeout(() => {
          line.style.strokeDasharray = '8 5';
          line.style.animation = 'dashFlow 0.4s linear infinite';
          resolve();
        }, 430);
      });
    });
  }

  _clearAttackPath() {
    this.attackPathIds.forEach(id => document.getElementById(id)?.remove());
    this.attackPathIds = [];
  }

  // ── Utilities ──────────────────────────────────────────────────────

  _el(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  _delay(ms) {
    const mult = window.App?.speedMultiplier || 1;
    return new Promise(r => setTimeout(r, ms / mult));
  }
}

// Inject keyframes
const _treeStyle = document.createElement('style');
_treeStyle.textContent = `
  @keyframes ringPulse {
    0%,100% { opacity:0.9; }
    50%      { opacity:0.3; }
  }
  @keyframes dashFlow {
    from { stroke-dashoffset:30; }
    to   { stroke-dashoffset:0; }
  }
  @keyframes crackShake {
    0%,100% { transform:translateX(0); }
    25%     { transform:translateX(-2px) rotate(-8deg); }
    75%     { transform:translateX(2px) rotate(8deg); }
  }

  /* Node tooltip */
  #node-tooltip {
    position:absolute;
    background:rgba(255,255,255,0.96);
    border:1px solid #e2e8f0;
    border-radius:10px;
    padding:8px 10px;
    box-shadow:0 8px 24px rgba(15,23,42,0.12);
    pointer-events:none;
    z-index:200;
    max-width:240px;
    opacity:0;
    transition:opacity 0.15s ease;
    font-family:'Inter',sans-serif;
  }
`;
document.head.appendChild(_treeStyle);

window.MerkleTreeVisualizer = MerkleTreeVisualizer;
