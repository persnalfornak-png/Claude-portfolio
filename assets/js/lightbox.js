/* ===========================================================================
   lightbox.js — Noah Kline portfolio
   Reusable fullscreen image viewer. Vanilla JS, zero dependencies.

   USAGE
   -----
   Mark any gallery container with data-lightbox. Every <img> inside it (or
   every <img> inside a <figure>) becomes a viewer trigger:

       <div class="gallery cols-3" data-lightbox="Layering">
         <img src="..." alt="Caption text">
       </div>

   - The group name (the attribute value) is shown as the album label.
   - The image's alt text becomes the caption. Keep alt text meaningful.
   - A <figcaption> next to the img wins over alt if present.
   - Add data-full="path/to/large.jpg" on an img to load a larger file in the
     viewer than the grid thumbnail.
   - Multiple containers sharing the same data-lightbox value are ONE album,
     so a page can interleave prose between gallery rows and still page
     through every photo in order.

   ACCESSIBILITY / MOTION
   ----------------------
   - Triggers are real <button>s injected around nothing: the img gets
     role="button", tabindex=0 and keyboard activation instead, so markup
     stays clean and no layout changes.
   - Open state traps focus, sets aria-modal, and restores focus on close.
   - All transitions live behind prefers-reduced-motion: no-preference.
   - Esc closes, ArrowLeft/ArrowRight page, Home/End jump to ends.
   - Touch: horizontal swipe pages, vertical swipe-down closes.

   REMOVAL
   -------
   Delete the <script src=".../lightbox.js"> line from each page and drop the
   data-lightbox attributes. The galleries degrade to plain image grids.
   =========================================================================== */
(function () {
  'use strict';

  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- collect albums ------------------------------------------- */
  // Map of album name -> array of {src, caption, el}
  var albums = Object.create(null);

  function captionFor(img) {
    // An explicit figcaption beats alt text.
    var fig = img.closest('figure');
    if (fig) {
      var fc = fig.querySelector('figcaption');
      if (fc && fc.textContent.trim()) return fc.textContent.trim();
    }
    return (img.getAttribute('alt') || '').trim();
  }

  function collect() {
    albums = Object.create(null);
    // src -> index, per album. A case study deliberately repeats a few of its
    // strongest photographs in the editorial rows above the full grid, so the
    // same file is marked up twice on the page. Without this the viewer would
    // show those images twice while paging, and the counter would overstate
    // the size of the set. The second occurrence is wired to the index of the
    // first instead of appending a duplicate entry.
    var seen = Object.create(null);

    var containers = document.querySelectorAll('[data-lightbox]');
    Array.prototype.forEach.call(containers, function (box) {
      var name = box.getAttribute('data-lightbox') || 'Gallery';
      if (!albums[name]) { albums[name] = []; seen[name] = Object.create(null); }
      var list = albums[name];
      var index = seen[name];

      var imgs = box.querySelectorAll('img');
      Array.prototype.forEach.call(imgs, function (img) {
        if (img.hasAttribute('data-lightbox-skip')) return;

        var src = img.getAttribute('data-full') || img.currentSrc || img.src;
        var caption = captionFor(img);
        var at;

        if (Object.prototype.hasOwnProperty.call(index, src)) {
          at = index[src];
          // Prefer the more descriptive caption if this copy carries one.
          if (caption && caption.length > (list[at].caption || '').length) {
            list[at].caption = caption;
          }
        } else {
          at = list.length;
          index[src] = at;
          list.push({ src: src, caption: caption });
        }

        img.setAttribute('data-lb-album', name);
        img.setAttribute('data-lb-index', String(at));
        img.setAttribute('role', 'button');
        img.setAttribute('tabindex', '0');
        if (!img.getAttribute('aria-label')) {
          img.setAttribute('aria-label', (caption || 'Photograph') + ' — open full screen');
        }
        img.classList.add('lb-trigger');
      });
    });
  }

  /* ---------- build the overlay once ----------------------------------- */
  var overlay, imgEl, capEl, countEl, albumEl, btnPrev, btnNext, btnClose, spinner;
  var current = { album: null, index: 0 };
  var lastFocus = null;

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'lb' + (REDUCED ? ' lb-reduced' : '');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Image viewer');
    overlay.hidden = true;

    overlay.innerHTML =
      '<div class="lb-backdrop" data-lb-dismiss></div>' +
      '<div class="lb-bar">' +
        '<div class="lb-meta"><span class="lb-album"></span><span class="lb-count"></span></div>' +
        '<button type="button" class="lb-btn lb-close" aria-label="Close viewer (Escape)">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5l14 14M19 5L5 19"/></svg>' +
        '</button>' +
      '</div>' +
      '<button type="button" class="lb-btn lb-nav lb-prev" aria-label="Previous image (Left arrow)">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 4L7 12l8 8"/></svg>' +
      '</button>' +
      '<button type="button" class="lb-btn lb-nav lb-next" aria-label="Next image (Right arrow)">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 4l8 8-8 8"/></svg>' +
      '</button>' +
      '<figure class="lb-stage">' +
        '<div class="lb-spinner" aria-hidden="true"></div>' +
        '<img class="lb-img" alt="">' +
        '<figcaption class="lb-cap"></figcaption>' +
      '</figure>';

    document.body.appendChild(overlay);

    imgEl   = overlay.querySelector('.lb-img');
    capEl   = overlay.querySelector('.lb-cap');
    countEl = overlay.querySelector('.lb-count');
    albumEl = overlay.querySelector('.lb-album');
    btnPrev = overlay.querySelector('.lb-prev');
    btnNext = overlay.querySelector('.lb-next');
    btnClose= overlay.querySelector('.lb-close');
    spinner = overlay.querySelector('.lb-spinner');

    btnPrev.addEventListener('click', function (e) { e.stopPropagation(); step(-1); });
    btnNext.addEventListener('click', function (e) { e.stopPropagation(); step(1); });
    btnClose.addEventListener('click', function (e) { e.stopPropagation(); close(); });

    // Clicking the backdrop (or the padding around the photo) dismisses.
    overlay.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-lb-dismiss') || e.target === overlay || e.target.classList.contains('lb-stage')) close();
    });

    imgEl.addEventListener('load', function () {
      overlay.classList.remove('lb-loading');
      overlay.classList.add('lb-loaded');
    });
    imgEl.addEventListener('error', function () {
      overlay.classList.remove('lb-loading');
      capEl.textContent = 'This image could not be loaded.';
    });

    bindTouch();
  }

  /* ---------- open / close / paging ------------------------------------ */
  function list() { return albums[current.album] || []; }

  function render() {
    var items = list();
    var item = items[current.index];
    if (!item) return;

    overlay.classList.remove('lb-loaded');
    overlay.classList.add('lb-loading');

    imgEl.src = item.src;
    imgEl.alt = item.caption || '';
    capEl.textContent = item.caption || '';
    capEl.hidden = !item.caption;
    albumEl.textContent = current.album || '';
    countEl.textContent = (current.index + 1) + ' / ' + items.length;

    var multi = items.length > 1;
    btnPrev.hidden = !multi;
    btnNext.hidden = !multi;

    preload(current.index + 1);
    preload(current.index - 1);
  }

  function preload(i) {
    var items = list();
    if (!items.length) return;
    var n = ((i % items.length) + items.length) % items.length;
    var it = items[n];
    if (!it || it._pre) return;
    it._pre = new Image();
    it._pre.src = it.src;
  }

  function step(delta) {
    var items = list();
    if (items.length < 2) return;
    current.index = ((current.index + delta) % items.length + items.length) % items.length;
    render();
  }

  function open(album, index) {
    if (!albums[album] || !albums[album].length) return;
    lastFocus = document.activeElement;
    current.album = album;
    current.index = index || 0;

    overlay.hidden = false;
    // Force a frame so the enter transition actually runs.
    requestAnimationFrame(function () { overlay.classList.add('lb-open'); });

    document.documentElement.classList.add('lb-lock');
    render();
    btnClose.focus();

    document.addEventListener('keydown', onKey, true);
  }

  function close() {
    overlay.classList.remove('lb-open');
    document.documentElement.classList.remove('lb-lock');
    document.removeEventListener('keydown', onKey, true);

    var finish = function () {
      overlay.hidden = true;
      imgEl.removeAttribute('src');
      overlay.classList.remove('lb-loaded', 'lb-loading');
    };
    if (REDUCED) finish(); else setTimeout(finish, 240);

    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }

  function onKey(e) {
    switch (e.key) {
      case 'Escape':     e.preventDefault(); close(); break;
      case 'ArrowLeft':  e.preventDefault(); step(-1); break;
      case 'ArrowRight': e.preventDefault(); step(1);  break;
      case 'Home':       e.preventDefault(); current.index = 0; render(); break;
      case 'End':        e.preventDefault(); current.index = list().length - 1; render(); break;
      case 'Tab':        trapFocus(e); break;
    }
  }

  // Keep Tab inside the dialog while it is open.
  function trapFocus(e) {
    var f = Array.prototype.filter.call(
      overlay.querySelectorAll('button:not([hidden])'),
      function (b) { return b.offsetParent !== null; }
    );
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------- touch: swipe to page, swipe down to dismiss -------------- */
  function bindTouch() {
    var x0 = 0, y0 = 0, tracking = false;
    overlay.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { tracking = false; return; }
      tracking = true; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    overlay.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
      else if (dy > 70 && Math.abs(dy) > Math.abs(dx)) close();
    }, { passive: true });
  }

  /* ---------- wire triggers -------------------------------------------- */
  function onActivate(e) {
    var img = e.target.closest ? e.target.closest('.lb-trigger') : null;
    if (!img) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    // Never hijack a gallery image that is itself inside a link.
    if (img.closest('a')) return;
    e.preventDefault();
    open(img.getAttribute('data-lb-album'), parseInt(img.getAttribute('data-lb-index'), 10) || 0);
  }

  function init() {
    collect();
    var any = Object.keys(albums).some(function (k) { return albums[k].length; });
    if (!any) return;
    build();
    document.addEventListener('click', onActivate);
    document.addEventListener('keydown', onActivate);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
