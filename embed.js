/* Advent calendar embed helper: sizes the iframe to its content (no inner scrollbars)
   and tells the calendar which part of it is visible, so the popup always lands on screen. */
(function () {
  if (window.__adventEmbed) return; window.__adventEmbed = true;
  function frames() {
    return Array.prototype.filter.call(document.querySelectorAll('iframe'), function (f) { return /[?&]embed=1/.test(f.src); });
  }
  function send(f) {
    if (!f.contentWindow) return;
    var r = f.getBoundingClientRect();
    f.contentWindow.postMessage({ type: 'advent-viewport', top: r.top, vh: window.innerHeight }, '*');
  }
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || typeof d !== 'object' || String(d.type).indexOf('advent-') !== 0) return;
    var f = frames().filter(function (x) { return x.contentWindow === e.source; })[0];
    if (!f) return;
    if (d.type === 'advent-height' && d.height > 0) {
      f.style.height = Math.ceil(d.height) + 'px';
      f.style.aspectRatio = 'auto';
      f.setAttribute('scrolling', 'no');
      send(f);
    } else if (d.type === 'advent-scrollto') {
      var r = f.getBoundingClientRect();
      window.scrollBy({ top: r.top + (+d.y || 0) - window.innerHeight / 2, behavior: 'smooth' });
    } else if (d.type === 'advent-hello') {
      send(f);
    }
  });
  var raf = 0;
  function all() { cancelAnimationFrame(raf); raf = requestAnimationFrame(function () { frames().forEach(send); }); }
  window.addEventListener('scroll', all, { passive: true });
  window.addEventListener('resize', all);
})();
