/**
 * Hash Scramble Animation
 * Creates a typewriter/scramble effect on hash text elements.
 * Characters cycle through hex chars then settle on the real value.
 */

const HEX_CHARS = '0123456789abcdef';
const ALL_CHARS  = '0123456789abcdefABCDEF?!#$%^&*@~';

/**
 * Scrambles an element's text content to look like a hash resolving.
 * @param {HTMLElement} el - Target element
 * @param {string} finalHash - The final hash to settle on
 * @param {number} duration - Total duration in ms (default 500)
 * @param {function} onComplete - Callback when done
 */
function scrambleHash(el, finalHash, duration = 500, onComplete = null) {
  if (!el || !finalHash) return;
  if (window.prefersReducedMotion()) {
    el.textContent = finalHash;
    if (onComplete) onComplete();
    return;
  }

  const len = finalHash.length;
  const start = performance.now();
  const settled = new Array(len).fill(false);
  let raf;

  function frame(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);

    // How many chars have settled (left-to-right)
    const numSettled = Math.floor(progress * len);

    let result = '';
    for (let i = 0; i < len; i++) {
      if (finalHash[i] === '.' || finalHash[i] === ' ' || finalHash[i] === ':' || finalHash[i] === 'x' && i === 1) {
        // Keep special chars (0x prefix, dots) literal
        result += finalHash[i];
      } else if (i < numSettled) {
        result += finalHash[i];
      } else {
        // Scramble
        result += HEX_CHARS[Math.floor(Math.random() * HEX_CHARS.length)];
      }
    }

    el.textContent = result;
    el.classList.toggle('hash-scrambling', progress < 0.9);

    if (progress < 1) {
      raf = requestAnimationFrame(frame);
    } else {
      el.textContent = finalHash;
      el.classList.remove('hash-scrambling');
      if (onComplete) onComplete();
    }
  }

  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
  return { cancel: () => { cancelAnimationFrame(raf); el.textContent = finalHash; } };
}

/**
 * Scramble all hash boxes in a container with staggered timing.
 * @param {HTMLElement} container - Parent element
 * @param {number} baseDelay - Base delay per element in ms
 */
function scrambleAllHashes(container, baseDelay = 80) {
  const els = container.querySelectorAll('.hash-box, .td-mono, [data-hash]');
  els.forEach((el, i) => {
    const finalText = el.dataset.hash || el.textContent.trim();
    if (!finalText || finalText.length < 8) return;
    el.dataset.hash = finalText;
    setTimeout(() => scrambleHash(el, finalText, 600), i * baseDelay);
  });
}

/**
 * Typewriter effect — types text character by character.
 * @param {HTMLElement} el - Target element
 * @param {string} text - Text to type
 * @param {number} speed - ms per character
 */
function typewriter(el, text, speed = 28, onComplete = null) {
  if (!el) return;
  if (window.prefersReducedMotion()) {
    el.textContent = text;
    if (onComplete) onComplete();
    return;
  }
  el.textContent = '';
  let i = 0;
  const interval = setInterval(() => {
    el.textContent += text[i];
    i++;
    if (i >= text.length) {
      clearInterval(interval);
      if (onComplete) onComplete();
    }
  }, speed);
  return { cancel: () => { clearInterval(interval); el.textContent = text; } };
}

// Utility: check reduced motion preference
window.prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

window.scrambleHash = scrambleHash;
window.scrambleAllHashes = scrambleAllHashes;
window.typewriter = typewriter;
