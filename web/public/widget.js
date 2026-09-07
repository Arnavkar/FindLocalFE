/* FindLocal embeddable widget loader — https://findlocal.community/developers/widgets
 * Usage: <script src="https://findlocal.community/widget.js" data-widget="literary-new-england"></script>
 * Attributes: data-widget | data-region | data-city | data-cat | data-when | data-view (list|calendar|map)
 *             data-theme (light|dark|auto) | data-limit (1-300) | data-height (initial px) | data-partner
 * Injects an auto-resizing iframe after the script tag. No dependencies, no cookies, no tracking.
 * The URL rules mirror web/src/lib/embed.ts::buildEmbedSrc — keep both in sync. */
(function () {
  var script = document.currentScript;
  if (!script || !script.src) return;
  var origin = new URL(script.src, location.href).origin;
  var PRESETS = {
    'literary-new-england': { region: 'new-england', cat: 'literary' },
    'new-england': { region: 'new-england' }
  };
  var KEYS = ['region', 'city', 'cat', 'when', 'view', 'theme', 'limit', 'partner'];
  var VIEWS = ['list', 'calendar', 'map'];
  var THEMES = ['light', 'dark', 'auto'];

  function attr(name) {
    var v = script.getAttribute('data-' + name);
    return v ? v.trim() : '';
  }

  var merged = {};
  var preset = PRESETS[attr('widget').toLowerCase()];
  if (preset) for (var pk in preset) merged[pk] = preset[pk];
  for (var i = 0; i < KEYS.length; i++) {
    var v = attr(KEYS[i]);
    if (v) merged[KEYS[i]] = v;
  }
  if (merged.region) delete merged.city;
  if (merged.view === 'list' || (merged.view && VIEWS.indexOf(merged.view) < 0)) delete merged.view;
  if (merged.theme === 'auto' || (merged.theme && THEMES.indexOf(merged.theme) < 0)) delete merged.theme;
  if (merged.when === 'anytime') delete merged.when;
  if (merged.limit !== undefined) {
    var n = parseInt(merged.limit, 10);
    if (!(n >= 1) || n === 100) delete merged.limit;
    else merged.limit = String(Math.min(n, 300));
  }
  var params = new URLSearchParams(merged);
  params.sort();
  var q = params.toString();
  var src = origin + '/embed/events' + (q ? '?' + q : '');

  var height = parseInt(attr('height'), 10);
  if (!(height > 0)) height = 320;
  var iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = 'FindLocal events widget';
  iframe.loading = 'lazy';
  iframe.setAttribute('scrolling', 'no');
  iframe.setAttribute('allow', "geolocation 'none'");
  iframe.style.cssText = 'width:100%;border:0;display:block;min-height:' + height + 'px;height:' + height + 'px;';
  script.parentNode.insertBefore(iframe, script.nextSibling);

  window.addEventListener('message', function (ev) {
    if (ev.source !== iframe.contentWindow || ev.origin !== origin) return;
    var d = ev.data;
    if (!d || d.type !== 'findlocal:resize' || typeof d.height !== 'number') return;
    iframe.style.height = Math.max(120, Math.ceil(d.height)) + 'px';
  });
})();
