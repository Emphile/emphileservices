/* Portal theme: remembered per browser. Loaded in <head> on every portal page. */
(function () {
  var KEY = 'emphile_theme', THEMES = ['dark', 'light', 'navy'];
  function apply(t) { document.documentElement.setAttribute('data-theme', THEMES.indexOf(t) < 0 ? 'dark' : t); }
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* storage unavailable */ }
  apply(saved);
  window.EmphileTheme = {
    themes: THEMES,
    get: function () { return document.documentElement.getAttribute('data-theme') || 'dark'; },
    set: function (t) { apply(t); try { localStorage.setItem(KEY, t); } catch (e) { /* ignore */ } },
  };
})();
