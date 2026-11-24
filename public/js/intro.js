// Intro splash (~2 s): the logo glows in on black inside a dark window with a warm
// orange rim, then gives way to a "Guess the player" screen, and the window opens
// onto the site. Plain script (not a module) so it covers the page before first paint.
// TEST MODE: while INTRO_TEST is true it only plays when the URL has ?intro.
// Flip it to false to show it to everyone once per browser session.
(function () {
  var INTRO_TEST = true;
  var KEY = 'gwai:intro-seen';
  var params = new URLSearchParams(location.search);
  var forced = params.has('intro');
  if (INTRO_TEST && !forced) return;
  if (!forced) {
    try { if (sessionStorage.getItem(KEY)) return; sessionStorage.setItem(KEY, '1'); } catch (e) { /* no storage: still play */ }
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  }

  var lang = 'ru';
  try { var l = JSON.parse(localStorage.getItem('gwai:lang') || 'null'); lang = l || ((navigator.language || 'ru').toLowerCase().indexOf('ru') === 0 ? 'ru' : 'en'); } catch (e) { /* default ru */ }
  var T = lang === 'en'
    ? { word: 'Guess the player', nav: ['Grid', 'Who am I?', 'Chain'], tag: 'daily', skip: 'Skip intro' }
    : { word: 'Угадай игрока', nav: ['Сетка', 'Кто я?', 'Цепочка'], tag: 'каждый день', skip: 'Пропустить заставку' };

  var mark = '<svg viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="19.5" fill="none" stroke="currentColor" stroke-width="2.5"/>' +
    '<path d="M13 21a8 8 0 0 1 16 0c0 4-3 5-5 6.5-.9.7-1 1.4-1 2.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
    '<circle cx="23" cy="34.5" r="2.2" fill="#ff7a4d"/></svg>';

  var el = document.createElement('div');
  el.className = 'intro';
  el.setAttribute('role', 'presentation');
  el.innerHTML =
    '<div class="intro-win">' +
      '<div class="intro-logo"><span class="intro-mark">' + mark + '</span><span class="intro-name">WhoAmI<b>Guess</b></span></div>' +
      '<div class="intro-screen">' +
        '<div class="intro-nav"><span class="intro-nav-logo">' + mark + '</span>' +
          T.nav.map(function (n) { return '<span>' + n + '</span>'; }).join('') + '<span class="intro-nav-end">RU · EN</span></div>' +
        '<span class="intro-dot"></span>' +
        '<span class="intro-flare"></span>' +
        '<div class="intro-tag">' + T.tag + '</div>' +
        '<div class="intro-word">' + T.word + '</div>' +
      '</div>' +
    '</div>' +
    '<button class="intro-skip" type="button">' + T.skip + '</button>';

  document.documentElement.classList.add('intro-on');
  (document.body || document.documentElement).appendChild(el);

  var done = false;
  function finish() {
    if (done) return; done = true;
    el.classList.add('intro-out');
    setTimeout(function () { el.remove(); document.documentElement.classList.remove('intro-on'); }, 500);
  }
  el.addEventListener('click', finish);
  document.addEventListener('keydown', function onKey(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); finish(); } });
  // The opening of the window (CSS) ends at ~2.1 s; then fade the overlay away.
  setTimeout(finish, 2100);
})();
