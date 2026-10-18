/* ===========================================================================
   magnetic.js — OPTIONAL cursor-aware "magnetic" hover for buttons.

   >>> HOW TO REMOVE COMPLETELY (2 steps, no other file depends on it) <<<
   1. Delete the <script src="assets/js/magnetic.js"> tag from each page.
   2. Delete the class="... magnetic" token from any button (harmless if left:
      the .magnetic CSS below lives in this file and is injected by it).
   Nothing in site.css or site.js references .magnetic. Removing this file
   cannot break layout, reveal animations, or the video hero.

   ROUND 2 (2026-10-07): the effect was far too strong and adjacent buttons
   visually collided. Three changes, all of them deliberate:
     * PULL 0.32 -> 0.07 and the travel is hard-clamped to MAX_SHIFT px, so a
       button can never move far enough to touch its neighbour.
     * The pull field no longer extends 90px past the button. Only the element
       the pointer is actually over (plus a 10px forgiveness margin) responds,
       so two side-by-side buttons are never both active.
     * Exclusive activation: one button at a time. The nearest candidate wins
       and every other button is reset on the same frame.
   Disabled entirely for reduced-motion users and coarse/touch pointers.
   =========================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse  = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  var targets = Array.prototype.slice.call(document.querySelectorAll('.magnetic'));
  if (!targets.length || reduced || coarse) { return; }

  // --- tuning -------------------------------------------------------------
  var MARGIN    = 10;   // px of forgiveness around the button box (was 90)
  var PULL      = 0.07; // fraction of cursor offset travelled (was 0.32)
  var MAX_SHIFT = 4;    // px hard cap on travel in either axis
  var LABEL_LAG = 0.5;  // label travels this fraction of the button's shift
  // ------------------------------------------------------------------------

  // Self-contained styles: keeps the feature deletable by removing one file.
  var style = document.createElement('style');
  style.setAttribute('data-magnetic', '');
  style.textContent =
    '.magnetic{will-change:transform;transition:transform .5s cubic-bezier(.2,.7,.2,1)}' +
    '.magnetic.mag-active{transition:transform .12s ease-out}' +
    '.magnetic > .mag-label{display:inline-block;will-change:transform;transition:transform .5s cubic-bezier(.2,.7,.2,1)}' +
    '.magnetic.mag-active > .mag-label{transition:transform .12s ease-out}';
  document.head.appendChild(style);

  function clamp(v, lim) { return v < -lim ? -lim : (v > lim ? lim : v); }

  // Wrap each label once so it can lag behind the button body.
  var items = targets.map(function (el) {
    if (!el.querySelector('.mag-label')) {
      var span = document.createElement('span');
      span.className = 'mag-label';
      while (el.firstChild) { span.appendChild(el.firstChild); }
      el.appendChild(span);
    }
    return { el: el, label: el.querySelector('.mag-label'), on: false };
  });

  function rest(it) {
    if (!it.on) { return; }
    it.on = false;
    it.el.classList.remove('mag-active');
    it.el.style.transform = '';
    it.label.style.transform = '';
  }

  function resetAll() { items.forEach(rest); }

  var queued = false, mx = 0, my = 0;

  function apply() {
    queued = false;
    var best = null, bestDist = Infinity, bestDx = 0, bestDy = 0;

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      // Measure the UNTRANSFORMED box so an active button cannot chase the
      // cursor away from itself (that feedback loop caused the drift/overlap).
      var r = it.el.getBoundingClientRect();
      var ox = it.on ? parseFloat(it.el.dataset.magX || 0) : 0;
      var oy = it.on ? parseFloat(it.el.dataset.magY || 0) : 0;
      var cx = r.left + r.width / 2 - ox;
      var cy = r.top + r.height / 2 - oy;
      var hw = r.width / 2 + MARGIN;
      var hh = r.height / 2 + MARGIN;
      var dx = mx - cx;
      var dy = my - cy;
      if (Math.abs(dx) > hw || Math.abs(dy) > hh) { continue; }
      var d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = it; bestDx = dx; bestDy = dy; }
    }

    // Exclusive: everything that is not the winner goes home.
    for (var j = 0; j < items.length; j++) {
      if (items[j] !== best) { rest(items[j]); }
    }
    if (!best) { return; }

    var tx = clamp(bestDx * PULL, MAX_SHIFT);
    var ty = clamp(bestDy * PULL, MAX_SHIFT);
    best.on = true;
    best.el.dataset.magX = tx;
    best.el.dataset.magY = ty;
    best.el.classList.add('mag-active');
    best.el.style.transform = 'translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0)';
    best.label.style.transform =
      'translate3d(' + (tx * LABEL_LAG).toFixed(2) + 'px,' + (ty * LABEL_LAG).toFixed(2) + 'px,0)';
  }

  document.addEventListener('mousemove', function (ev) {
    mx = ev.clientX; my = ev.clientY;
    if (!queued) { queued = true; requestAnimationFrame(apply); }
  }, { passive: true });

  document.addEventListener('mouseleave', resetAll);
  window.addEventListener('blur', resetAll);
  window.addEventListener('scroll', resetAll, { passive: true });
})();
