/* Homepage host for the ocean study. The five Elm selectors still own routing. */
(function (root) {
  'use strict';
  if (root.OceanHero) return;

  var canvas, renderer, collage, overlay, observer, labelObserver, style, firstSelector, selectorTitle, selectorLabel;
  var active = false, destroyed = false, failed = false, ready = false, frame = 0;
  var options = {variant: 'currents', scale: .7, curl: 5.4, detail: .8, seams: true, tileVariation: .65, motion: false};

  function restore() {
    active = false;
    document.body.classList.remove('ocean-hero-active');
    if (canvas) canvas.setAttribute('data-active', 'false');
    if (renderer) renderer.pause();
  }

  function fail(error) {
    failed = true;
    restore();
    if (renderer) renderer.destroy();
    renderer = null;
    if (canvas) canvas.remove();
    canvas = null;
    if (labelObserver) labelObserver.disconnect();
    restoreLabel();
    console.warn('Ocean homepage unavailable; retaining the original background.', error);
  }

  function restoreLabel() {
    if (!firstSelector) return;
    if (selectorTitle === null) firstSelector.removeAttribute('title');
    else firstSelector.setAttribute('title', selectorTitle);
    if (selectorLabel === null) firstSelector.removeAttribute('aria-label');
    else firstSelector.setAttribute('aria-label', selectorLabel);
  }

  function label() {
    if (failed || destroyed || !firstSelector) return;
    if (firstSelector.title !== 'Ocean tiles') firstSelector.title = 'Ocean tiles';
    if (firstSelector.getAttribute('aria-label') !== 'Ocean tiles') firstSelector.setAttribute('aria-label', 'Ocean tiles');
  }

  function mount() {
    if (renderer) return true;
    if (!root.OceanTessellation || !root.OceanTilingGeometry) {
      fail(new Error('Ocean assets did not load.'));
      return false;
    }
    canvas = document.createElement('canvas');
    canvas.id = 'ocean-hero-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('data-active', 'false');
    document.body.appendChild(canvas);
    try {
      renderer = root.OceanTessellation.create(canvas, options);
      renderer.pause();
      return true;
    } catch (error) {
      fail(error);
      return false;
    }
  }

  function sync() {
    if (!ready || destroyed || failed) return;
    var hash = root.location.hash.slice(1);
    var opening = !hash || hash === 'drag';
    var panelOpen = overlay.classList.contains('overlay-visible');
    var show = opening && !panelOpen && !document.body.classList.contains('lava-active');
    if (!show) { restore(); return; }
    if (!mount()) return;
    var wasActive = active;
    active = true;
    canvas.setAttribute('data-active', 'true');
    document.body.classList.add('ocean-hero-active');
    // The opening is a static composition: returning to it does not start a loop.
    renderer.pause();
    if (!wasActive && !document.hidden) {
      try { renderer.renderAt(0); } catch (error) { fail(error); }
    }
  }

  function schedule() {
    if (frame || destroyed) return;
    frame = root.requestAnimationFrame(function () { frame = 0; sync(); });
  }

  function control(event) {
    var target = event.target;
    if (target.closest && target.closest('#background-buttons, #spa-nav, #spa-overlay')) schedule();
  }

  function visibility() {
    if (renderer) renderer.pause();
    if (!document.hidden) schedule();
  }

  function pagehide(event) {
    if (renderer) renderer.pause();
    if (!event.persisted) destroy();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    root.cancelAnimationFrame(frame);
    frame = 0;
    restore();
    if (observer) observer.disconnect();
    if (labelObserver) labelObserver.disconnect();
    if (renderer) renderer.destroy();
    renderer = null;
    if (canvas) canvas.remove();
    if (collage) collage.classList.remove('ocean-hero-legacy');
    if (style) style.remove();
    restoreLabel();
    document.removeEventListener('mousedown', control);
    document.removeEventListener('click', control);
    document.removeEventListener('visibilitychange', visibility);
    root.removeEventListener('hashchange', schedule);
    root.removeEventListener('popstate', schedule);
    root.removeEventListener('pageshow', schedule);
    root.removeEventListener('pagehide', pagehide);
  }

  function boot() {
    if (ready || destroyed) return;
    var buttons = document.getElementById('background-buttons');
    overlay = document.getElementById('spa-overlay');
    var name = document.getElementById('site-name');
    // Main.elm renders its collage immediately before this identified selector bar.
    collage = buttons && buttons.parentElement.firstElementChild;
    if (!collage || collage === buttons || !collage.querySelector('canvas') || !overlay || !name) return;
    collage.classList.add('ocean-hero-legacy');
    firstSelector = buttons.querySelector('button');
    if (firstSelector) {
      selectorTitle = firstSelector.getAttribute('title') || 'Drag';
      selectorLabel = firstSelector.getAttribute('aria-label') || 'Drag';
      label();
      // fx.js can finish wiring after Elm mounts; retain the replacement's label.
      labelObserver = new MutationObserver(function () { label(); schedule(); });
      labelObserver.observe(firstSelector, {attributes: true, attributeFilter: ['title', 'aria-label']});
    }
    style = document.createElement('style');
    style.id = 'ocean-hero-style';
    style.textContent = '#ocean-hero-canvas{position:fixed;inset:0;width:100%;height:100%;z-index:10;pointer-events:none;visibility:hidden;opacity:0;background:#061e30}' +
      'body.ocean-hero-active{background:#061e30}' +
      'body.ocean-hero-active #ocean-hero-canvas{visibility:visible;opacity:1}' +
      'body.ocean-hero-active .ocean-hero-legacy{visibility:hidden;opacity:0}' +
      'body.ocean-hero-active #site-name{display:block;visibility:visible;opacity:1;text-shadow:0 2px 8px rgba(0,15,26,.8),0 0 35px rgba(0,15,26,.45)}';
    document.head.appendChild(style);
    // Panels and legacy selectors use replaceState, which does not fire hashchange.
    observer = new MutationObserver(schedule);
    observer.observe(overlay, {attributes: true, attributeFilter: ['class']});
    document.addEventListener('mousedown', control);
    document.addEventListener('click', control);
    document.addEventListener('visibilitychange', visibility);
    root.addEventListener('hashchange', schedule);
    root.addEventListener('popstate', schedule);
    root.addEventListener('pageshow', schedule);
    root.addEventListener('pagehide', pagehide);
    ready = true;
    sync();
  }

  root.OceanHero = Object.freeze({sync: schedule, destroy: destroy,
    get active() { return active; }, get ready() { return ready; },
    get failed() { return failed; }, get renderer() { return renderer; }});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
  else boot();
})(window);
