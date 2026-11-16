/* Advent calendar: plain JavaScript, no dependencies, no requests to other servers. */
(function () {
  'use strict';
  var DATA = JSON.parse(document.getElementById('advent-data').textContent);
  var params = new URLSearchParams(location.search);
  var YEAR = DATA.year;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var embedded = window.parent !== window;
  var isEmbed = params.get('embed') === '1';
  var testMode = params.has('test');
  var dateParam = params.get('date');
  var testDate = null;
  var unlockAll = false;
  var parentView = null; // {top, vh} from embed.js

  // ---------- language ----------
  var langs = DATA.languages;
  var lang = langs[0];
  if (langs.length > 1) {
    var nav = (navigator.language || '').slice(0, 2).toLowerCase();
    if (langs.indexOf(nav) >= 0) lang = nav;
  }
  var T = DATA.strings[lang];
  var fmt = function (s, o) { return s.replace(/\{(\w+)\}/g, function (_, k) { return o[k]; }); };
  var plural = function (n, one, many) { return n === 1 ? one : many; };
  document.documentElement.lang = lang;

  // ---------- dates ----------
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0) : null;
  }
  if (dateParam) testDate = parseDate(dateParam);
  var storageKey = 'advent-' + YEAR + '-opened' + (testMode || testDate ? '-test' : '');
  function now() { return testDate ? new Date(testDate.getTime()) : new Date(); }
  function unlockTime(n) { return new Date(YEAR, 11, n, 0, 0, 0); }
  function isUnlocked(n) { return unlockAll || now() >= unlockTime(n); }
  function phase() {
    var t = now();
    if (t < unlockTime(1)) return 'before';
    if (t >= unlockTime(25)) return 'after';
    return 'during';
  }
  function todayDoor() {
    var t = now();
    return (t.getFullYear() === YEAR && t.getMonth() === 11 && t.getDate() <= 24) ? t.getDate() : 0;
  }

  // ---------- storage ----------
  var opened = {};
  try { opened = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch (e) { opened = {}; }
  function save() { try { localStorage.setItem(storageKey, JSON.stringify(opened)); } catch (e) {} }

  // ---------- elements ----------
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var grid = $('.grid');
  var doors = {};
  Array.prototype.forEach.call(document.querySelectorAll('.door'), function (b) { doors[+b.dataset.day] = b; });
  var dayData = {};
  DATA.days.forEach(function (d) { dayData[d.day] = d; });
  var statusEl = $('.status-text');
  var greetingEl = $('.greeting');
  var overlay = $('.overlay'), dialog = $('.dialog'), popImg = $('.frame img'), popTitle = $('#pop-title'), popExtra = $('.extra');
  var btnClose = $('.close'), btnPrev = $('.prev'), btnNext = $('.next');
  var toastEl = $('.toast');

  // ---------- render ----------
  function render() {
    var today = todayDoor();
    Object.keys(doors).forEach(function (k) {
      var n = +k, b = doors[n], unlocked = isUnlocked(n), isOpen = unlocked && !!opened[n];
      b.classList.toggle('locked', !unlocked);
      b.classList.toggle('today', n === today && !isOpen);
      b.classList.toggle('open', isOpen);
      b.setAttribute('aria-label', unlocked ? fmt(T.doorOpenLabel, { n: n }) : fmt(T.doorLockedLabel, { n: n }));
      if (isOpen) loadThumb(n);
    });
    var p = phase();
    if (p === 'before') {
      var ms = unlockTime(1) - now();
      var d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.max(1, Math.floor(ms % 36e5 / 6e4));
      var parts = [];
      if (d) parts.push(d + ' ' + plural(d, T.day1, T.dayN));
      if (h || d) parts.push(h + ' ' + plural(h, T.hour1, T.hourN));
      if (!d) parts.push(m + ' ' + plural(m, T.min1, T.minN));
      statusEl.textContent = fmt(T.before, { time: parts.slice(0, 2).join(', ') });
    } else if (p === 'after') {
      statusEl.textContent = T.after;
    } else {
      statusEl.textContent = today === 24 ? T.eve : fmt(T.during, { n: today });
    }
    greetingEl.hidden = p !== 'after';
    reportHeight();
  }

  function loadThumb(n) {
    var img = doors[n].querySelector('.door-inside img');
    if (img) return;
    img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.onload = function () { img.classList.add('loaded'); };
    img.src = dayData[n].thumb;
    doors[n].querySelector('.door-inside').appendChild(img);
  }

  // ---------- toast ----------
  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    if (parentView) {
      var v = visibleWindow();
      toastEl.style.position = 'absolute';
      toastEl.style.top = (v.top + v.height - 70) + 'px';
      toastEl.style.bottom = 'auto';
    }
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
  }
  function lockedMessage(n) {
    var ms = unlockTime(n) - now();
    var days = Math.ceil(ms / 864e5);
    var t = now(), midnight = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
    if (unlockTime(n) <= midnight) return T.opensMidnight;
    var cal = Math.round((unlockTime(n) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5);
    return cal === 1 ? T.opensTomorrow : fmt(T.opensIn, { n: cal || days });
  }

  // ---------- doors ----------
  grid.addEventListener('click', function (e) {
    var b = e.target.closest('.door');
    if (!b) return;
    var n = +b.dataset.day;
    if (!isUnlocked(n)) {
      b.classList.remove('wiggle'); void b.offsetWidth; b.classList.add('wiggle');
      toast(lockedMessage(n));
      return;
    }
    if (opened[n]) { openPopup(n, b); return; }
    opened[n] = 1; save();
    loadThumb(n);
    b.classList.add('open'); b.classList.remove('today');
    b.setAttribute('aria-label', fmt(T.doorOpenLabel, { n: n }));
    setTimeout(function () { openPopup(n, b); }, reduceMotion ? 0 : 650);
  });

  // ---------- popup ----------
  var current = 0, lastFocus = null;
  function unlockedDays() {
    var out = [];
    for (var n = 1; n <= 24; n++) if (isUnlocked(n)) out.push(n);
    return out;
  }
  function fillPopup(n) {
    var d = dayData[n];
    current = n;
    popTitle.textContent = fmt(T.dayTitle, { n: n });
    popImg.removeAttribute('src');
    popImg.width = d.w; popImg.height = d.h;
    popImg.alt = d.alt;
    popImg.src = d.img;
    popExtra.innerHTML = '';
    if (d.text) { var p = document.createElement('p'); p.textContent = d.text; popExtra.appendChild(p); }
    if (d.link) {
      var a = document.createElement('a'); a.href = d.link; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = d.linkLabel || T.linkLabel; popExtra.appendChild(a);
    }
    popExtra.hidden = !d.text && !d.link;
    var list = unlockedDays(), i = list.indexOf(n);
    btnPrev.disabled = i <= 0;
    btnNext.disabled = i < 0 || i >= list.length - 1;
    if (!opened[n]) { opened[n] = 1; save(); render(); }
  }
  function openPopup(n, from) {
    lastFocus = from || document.activeElement;
    fillPopup(n);
    overlay.hidden = false;
    positionOverlay();
    if (embedded && parentView) {
      var v = visibleWindow(), r = from && from.getBoundingClientRect();
      if (v.height < Math.min(parentView.vh, document.documentElement.scrollHeight) * 0.85 && r) {
        window.parent.postMessage({ type: 'advent-scrollto', y: r.top + r.height / 2 }, '*');
      }
    }
    requestAnimationFrame(function () { overlay.classList.add('show'); });
    btnClose.focus({ preventScroll: true });
    document.addEventListener('keydown', onKey);
  }
  function closePopup() {
    overlay.classList.remove('show');
    document.removeEventListener('keydown', onKey);
    setTimeout(function () { overlay.hidden = true; dialog.style.transform = ''; }, reduceMotion ? 0 : 220);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function step(dir) {
    var list = unlockedDays(), i = list.indexOf(current) + dir;
    if (i >= 0 && i < list.length) fillPopup(list[i]);
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closePopup(); }
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'Tab') {
      var f = Array.prototype.filter.call(dialog.querySelectorAll('button, a[href]'), function (el) { return !el.disabled && el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!dialog.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  }
  btnClose.addEventListener('click', closePopup);
  btnPrev.addEventListener('click', function () { step(-1); });
  btnNext.addEventListener('click', function () { step(1); });
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closePopup(); });
  // swipe down to close
  var startY = null, dy = 0;
  dialog.addEventListener('touchstart', function (e) { if (e.touches.length === 1) { startY = e.touches[0].clientY; dy = 0; dialog.style.transition = 'none'; } }, { passive: true });
  dialog.addEventListener('touchmove', function (e) {
    if (startY === null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    dialog.style.transform = 'translateY(' + dy + 'px)';
  }, { passive: true });
  dialog.addEventListener('touchend', function () {
    if (startY === null) return;
    dialog.style.transition = '';
    startY = null;
    if (dy > 90) closePopup(); else dialog.style.transform = '';
  });

  // ---------- embedding ----------
  if (isEmbed) { document.body.classList.add('embed'); document.documentElement.classList.add('embed-mode'); }
  var lastH = 0;
  function reportHeight() {
    if (!embedded) return;
    var h = Math.ceil(document.querySelector('.wrap').getBoundingClientRect().height);
    if (h !== lastH) { lastH = h; window.parent.postMessage({ type: 'advent-height', height: h }, '*'); }
  }
  if (embedded) {
    if (window.ResizeObserver) new ResizeObserver(reportHeight).observe(document.querySelector('.wrap'));
    window.addEventListener('load', reportHeight);
    window.addEventListener('message', function (e) {
      if (e.source !== window.parent || !e.data || e.data.type !== 'advent-viewport') return;
      parentView = { top: +e.data.top || 0, vh: +e.data.vh || 0 };
      if (!overlay.hidden) positionOverlay();
    });
    window.parent.postMessage({ type: 'advent-hello' }, '*');
  }
  function visibleWindow() {
    var docH = document.documentElement.scrollHeight;
    var top = Math.max(0, -parentView.top);
    var bottom = Math.min(docH, parentView.vh - parentView.top);
    if (bottom - top < 200) { top = Math.max(0, Math.min(top, docH - 200)); bottom = top + Math.min(docH, 200); }
    return { top: top, height: bottom - top };
  }
  function positionOverlay() {
    if (!parentView) { overlay.style.cssText = ''; return; }
    var v = visibleWindow();
    overlay.style.position = 'absolute';
    overlay.style.top = v.top + 'px';
    overlay.style.height = v.height + 'px';
    overlay.style.bottom = 'auto';
    overlay.style.setProperty('--vh', v.height + 'px');
  }

  // ---------- snow ----------
  var snowBtn = $('.snow-toggle');
  var snowOn = false, canvas, ctx, flakes = [], raf = 0;
  if (DATA.festive === 'full' && !reduceMotion) {
    var pref = null;
    try { pref = localStorage.getItem('advent-snow'); } catch (e) {}
    snowBtn.hidden = false;
    setSnow(pref !== 'off');
    snowBtn.addEventListener('click', function () {
      setSnow(!snowOn);
      try { localStorage.setItem('advent-snow', snowOn ? 'on' : 'off'); } catch (e) {}
    });
  }
  function setSnow(on) {
    snowOn = on;
    snowBtn.textContent = on ? T.snowOn : T.snowOff;
    snowBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) startSnow(); else stopSnow();
  }
  function sizeCanvas() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var want = Math.min(120, Math.round(innerWidth * Math.min(innerHeight, 1400) / 11000));
    while (flakes.length < want) flakes.push(newFlake(true));
    flakes.length = want;
  }
  function newFlake(anywhere) {
    return { x: Math.random() * innerWidth, y: anywhere ? Math.random() * innerHeight : -10, r: 1 + Math.random() * 3,
      v: 0.3 + Math.random() * 0.9, d: Math.random() * Math.PI * 2, o: 0.4 + Math.random() * 0.5 };
  }
  function startSnow() {
    if (!canvas) {
      canvas = document.createElement('canvas'); canvas.id = 'snow'; canvas.setAttribute('aria-hidden', 'true');
      document.body.appendChild(canvas); ctx = canvas.getContext('2d');
      window.addEventListener('resize', function () { if (snowOn) sizeCanvas(); });
    }
    canvas.hidden = false; sizeCanvas();
    cancelAnimationFrame(raf);
    var color = getComputedStyle(document.documentElement).getPropertyValue('--snow').trim() || '#fff';
    (function tick() {
      if (!document.hidden) {
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        ctx.fillStyle = color;
        for (var i = 0; i < flakes.length; i++) {
          var f = flakes[i];
          f.y += f.v; f.d += 0.01; f.x += Math.sin(f.d) * 0.4;
          if (f.y > innerHeight + 5) flakes[i] = f = newFlake(false);
          ctx.globalAlpha = f.o; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
        }
      }
      raf = requestAnimationFrame(tick);
    })();
  }
  function stopSnow() { cancelAnimationFrame(raf); if (canvas) canvas.hidden = true; }

  // ---------- test mode ----------
  if (testMode) {
    var start = new Date(YEAR, 10, 28, 12);
    var bar = document.createElement('div');
    bar.className = 'testbar';
    bar.innerHTML = '<b>TEST MODE</b><label><span class="sr-only">Date</span><input type="range" min="0" max="29" step="1"></label>' +
      '<span class="tdate"></span><button type="button" data-a="all">Unlock all</button><button type="button" data-a="reset">Reset opened doors</button>';
    document.body.appendChild(bar);
    var range = bar.querySelector('input'), lbl = bar.querySelector('.tdate');
    var cur = testDate || now();
    range.value = Math.max(0, Math.min(29, Math.round((new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 12) - start) / 864e5)));
    var setFromRange = function () {
      testDate = new Date(YEAR, 10, 28 + (+range.value), 12);
      lbl.textContent = testDate.toLocaleDateString(lang, { month: 'short', day: 'numeric' });
      render();
    };
    range.addEventListener('input', setFromRange);
    setFromRange();
    bar.addEventListener('click', function (e) {
      var a = e.target.dataset && e.target.dataset.a;
      if (a === 'all') { unlockAll = !unlockAll; e.target.textContent = unlockAll ? 'Lock again' : 'Unlock all'; render(); }
      if (a === 'reset') { opened = {}; save(); Object.keys(doors).forEach(function (k) { var i = doors[k].querySelector('.door-inside img'); if (i) i.remove(); }); render(); }
    });
  }

  render();
  setInterval(render, 30000);
})();
