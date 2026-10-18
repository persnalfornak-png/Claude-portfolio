/* ===========================================================================
   site.js — shared behaviour for every page.
   Nothing here is required for the page to be readable; it only adds motion.
   =========================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Scroll reveal ---------------------------------------------------- */
  var animated = document.querySelectorAll('.reveal, .stagger');
  if (!reduced && 'IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    animated.forEach(function (el) { obs.observe(el); });
  } else {
    // Reduced motion or no observer: everything starts in its final state.
    animated.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---- Video hero ------------------------------------------------------- */
  /* The poster is always painted behind the video, so a blocked or failed
     autoplay degrades to a still frame rather than a black box.
     To swap the clip, change the <source src> in the markup — nothing here
     is clip-specific. */
  document.querySelectorAll('[data-hero-video]').forEach(function (v) {
    if (reduced) { v.remove(); return; }          // honour the OS setting outright

    // Cellular / small screens get the lighter encode (data-src-small), if provided.
    // Done before load so the heavy file is never requested on a phone.
    var conn = navigator.connection || {};
    var light = v.getAttribute('data-src-small');
    var wantsLight = light && (window.innerWidth <= 833 || conn.saveData === true ||
                               /2g|slow-2g|3g/.test(conn.effectiveType || ''));
    if (wantsLight) {
      var src = v.querySelector('source');
      if (src) { src.src = light; v.load(); }
    }

    v.muted = true;                                // required for autoplay on iOS/Safari
    v.playsInline = true;
    var show = function () { v.classList.add('ready'); };
    if (v.readyState >= 2) { show(); } else { v.addEventListener('loadeddata', show, { once: true }); }
    var p = v.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function () { v.remove(); });        // autoplay refused -> poster stands in
    }
  });

  /* ---- Count-up numbers strip ------------------------------------------ */
  document.querySelectorAll('[data-count]').forEach(function (el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var suffix = el.getAttribute('data-suffix') || '';
    // data-decimals: fixed decimal places, so 2.5 counts up as 2.5 and not 3.
    var dp = parseInt(el.getAttribute('data-decimals'), 10);
    if (isNaN(dp)) { dp = 0; }
    var fmt = function (v) { return v.toFixed(dp) + suffix; };
    if (isNaN(target)) { return; }
    if (reduced || !('IntersectionObserver' in window)) { el.textContent = fmt(target); return; }
    el.textContent = fmt(0);
    var o = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) { return; }
        o.unobserve(el);
        var start = performance.now(), dur = 1400;
        (function step(now) {
          var t = Math.min(1, (now - start) / dur);
          var eased = 1 - Math.pow(1 - t, 3);
          el.textContent = fmt(target * eased);
          if (t < 1) { requestAnimationFrame(step); }
        })(start);
      });
    }, { threshold: 0.5 });
    o.observe(el);
  });

  /* ---- Inline looping gallery videos (Round 3, item 8) ------------------
     A gallery cell can hold a short muted clip instead of a photo:

       <video data-loop-video muted loop playsinline preload="metadata"
              poster="...jpg"><source src="...mp4" type="video/mp4"></video>

     Under prefers-reduced-motion the <video> is left paused, so the poster
     frame stands in and the cell still reads as a photograph. Otherwise it
     only plays while it is actually on screen — a clip scrolled past should
     not keep decoding. Autoplay refusal falls back to the poster too.      */
  var loopVideos = document.querySelectorAll('[data-loop-video]');
  if (loopVideos.length) {
    loopVideos.forEach(function (v) {
      v.muted = true;            // belt and braces for iOS autoplay rules
      v.playsInline = true;
      if (reduced) { return; }   // paused; poster frame shows

      var tryPlay = function () {
        var p = v.play();
        if (p && typeof p.catch === 'function') { p.catch(function () {}); }
      };

      if ('IntersectionObserver' in window) {
        var vo = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) { tryPlay(); } else { v.pause(); }
          });
        }, { threshold: 0.25 });
        vo.observe(v);
      } else {
        tryPlay();
      }
    });
  }

  /* ---- Round 7 EXPERIMENT: cinematic scroll video stage -----------------
     Markup (work/sailing.html):

       <section class="video-stage" data-video-stage>
         <div class="vs-track"><div class="vs-sticky">
           <div class="vs-frame"> <video ...> <div class="vs-scrim"></div> </div>
           <div class="vs-copy"> ... </div>
         </div></div>
       </section>

     Writes a 0..1 progress into --r7p on the section; every visual change is
     in CSS. The clip is finished expanding at 42% of the track so it holds
     full-bleed for the rest of the scroll rather than snapping at the end.
     prefers-reduced-motion: no listener at all, --r7p pinned to 1, and the
     stylesheet drops the sticky/track/transform machinery entirely. The clip
     itself carries data-loop-video, so the loop handler above already decides
     whether it is allowed to play.
     TO REMOVE: delete this block, the matching CSS block, and the section in
     work/sailing.html (the original markup is kept in a comment beside it). */
  document.querySelectorAll('[data-video-stage]').forEach(function (stage) {
    var track = stage.querySelector('.vs-track');
    if (!track) { return; }
    if (reduced) { stage.style.setProperty('--r7p', '1'); return; }

    var ticking = false;
    var update = function () {
      ticking = false;
      var r = track.getBoundingClientRect();
      var span = r.height - window.innerHeight;
      if (span <= 0) { stage.style.setProperty('--r7p', '1'); return; }
      var raw = (-r.top) / span;
      var p = raw / 0.42;
      if (p < 0) { p = 0; } else if (p > 1) { p = 1; }
      stage.style.setProperty('--r7p', p.toFixed(4));
    };
    var onScroll = function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  });
})();
