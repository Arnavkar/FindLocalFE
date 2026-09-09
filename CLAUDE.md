# FindLocalFE — front doors for FindLocal

**Last updated:** 2026-09-06 (developers hub, /platform ported to Astro, embeddable widgets + region groups)

FindLocalFE is the **front-doors** workspace for findlocal.community: the public
website (`web/`, Astro on Cloudflare Workers), its JSON
API, and the OAuth-gated MCP server (`workers/mcp/`). All of them read one
Cloudflare D1 database, `findlocal`, through a single shared query layer.

The **data** side (scrapers, pipeline, schema, migrations) lives in the sibling
repo `../FindLocalData` (`cf/workers/data-api`, `cf/workers/scraper`). This repo
never writes to D1.

## Layout

```
package.json          npm workspaces: shared, workers/mcp, web
tsconfig.base.json    strict + noUncheckedIndexedAccess + resolveJsonModule
vitest.config.ts      @cloudflare/vitest-pool-workers: tests run in workerd with a miniflare D1
scripts/sync-data.mjs vendors canonical data from ../FindLocalData (see below)
shared/               @findlocal/shared — raw TS, no build step (main = src/index.ts)
  data/               VENDORED: cities.json, categories.json, schema/0001_init.sql
  src/
    cities.ts         CITIES, getCity(name), cityBySlug, citySlug, nearestCity
    categories.ts     CATEGORIES, categoryBySlug, slugForToken (parity with FindLocalData/src/categories.py)
    dates.ts          todayIn(tz), addDays, dateRangeFor(when, tz), formatEventDate, formatTime, timeOfDayBucket
    filters.ts        EventFilters + parseFilters(URLSearchParams, city) / canonicalQuery / filtersToQuery
    regions.ts        REGION_GROUPS (e.g. new-england = 18 metro slugs) for multi-city widgets
    queries.ts        THE ONLY CODE THAT TOUCHES D1 — SELECT helpers, all SQL lives here
    seo.ts            SITE, canonicalUrl, isUuid, redirectTargetFor, GONE_PATHS, IMPACT_SITE_VERIFICATION
    types.ts          EventRow / VenueRow
  test/               vitest suites + seed fixture (setup.ts applies the vendored schema)
workers/mcp/          @findlocal/mcp — findlocal-mcp Worker (mcp.findlocal.community); see its README
web/                  @findlocal/web — Astro 7 SSR Worker (findlocal.community)
  astro.config.mjs    output:'server', @astrojs/cloudflare (platformProxy reads wrangler.toml)
  wrangler.toml       findlocal-web: D1 `DB` findlocal, `SESSION` KV placeholder, custom_domain route
  src/middleware.ts   301/410 tables, fl_city cookie -> locals.city, Cache API edge cache, X-Robots-Tag
  src/lib/            db.ts (ONLY importer of cloudflare:workers), feed.ts, cacheKey.ts, cacheHeaders.ts,
                      jsonld.ts, ics.ts, format.ts, icons.ts — pure helpers unit-tested in web/test/
  src/pages/          one file per route in the route table below; about/privacy/terms/blog/platform/developers are prerendered
                      embed/events.astro = the widget iframe page (EmbedLayout, no site chrome); lib/embed.ts = its query contract
  src/content/blog/   markdown posts (Astro content collection)
  public/             fonts, logo, favicon, og-default, robots/llms, widget.js (embed loader), _headers
```

## Commands (root)

```bash
npm install --legacy-peer-deps   # oauth provider pins old workers-types
npm run typecheck                # tsc -b shared workers/mcp
npm test                         # vitest (workers pool, miniflare D1)
npm run sync-data                # re-vendor cities/categories/schema from ../FindLocalData
npm run sync-data:check          # non-zero if vendored copies drifted (CI)
npm run dev:mcp / deploy:mcp     # wrangler for workers/mcp (deploy = typecheck + test + deploy)
npm run dev:web                  # astro dev on :4321 (local D1 via platformProxy; seed it: web/package.json d1:seed + a data file)
npm run check:web                # astro check (types across .astro + .ts)
npm run deploy:web               # astro build + wrangler deploy (needs a real SESSION KV id in web/wrangler.toml)
```

## Rules

- **Read-only by discipline.** D1 has no read-only binding. Only
  `shared/src/queries.ts` may issue SQL, and only `SELECT`. Site pages, API
  routes and MCP tools call those helpers; they never build SQL themselves.
- **One filter contract.** `EventFilters` (filters.ts) is shared by the site's
  URL parsing (`parseFilters`), the JSON API and the MCP `search_events` tool,
  so every front door returns identical results for identical inputs.
  URL keys: `when` (anytime|today|tomorrow|weekend|week|YYYY-MM-DD), `cat`
  (comma slugs), `free=1`, `paid=1`, `max`, `tod` (comma morning|afternoon|evening),
  `region`, `q`, `page` (100/page). `canonicalQuery()` = sorted, defaults dropped
  — use it as the edge-cache key and in the canonical URL.
- **Vendored data, never hand-edited.** `shared/data/*` is copied from
  FindLocalData by `npm run sync-data`; CI runs `sync-data:check`. Change the
  source files in FindLocalData, then re-sync here.
- **Dates are strings.** `events.event_date` is a plain `YYYY-MM-DD` (D1
  schema), so the old "never `new Date(event_date)`" trap is gone — but keep
  it that way: use `dates.ts` (`todayIn(city.tz)`, `addDays`, `formatEventDate`)
  and never construct a local-time `Date` from a calendar day. "Today" is
  always resolved in the **city's time zone** (`City.tz`); helpers that aren't
  city-scoped (getEvent, sitemaps) use `DEFAULT_TZ = America/New_York`.
- **Recurrence** = same `lower(trim(title))` at the same venue on >1 upcoming
  date. `listUpcomingEvents` computes `series_count`/`series_image` over the
  *unfiltered* upcoming set for the city, so a filtered view still shows the
  recurring pill. Image fallback chain: `image_url || series_image || venue_image`.
- Keep functions under ~60 lines; D1 allows 100 binds per statement (ids are
  chunked at 90); escape LIKE wildcards (`escapeLike` + `ESCAPE '\'`).

## Product / SEO facts (still true — carried over from the Expo era)

- **Domain / canonical**: `https://findlocal.community` (`SITE` in seo.ts).
  Canonical URLs are absolute, never derived from the request host; query
  params other than the canonical filter keys are stripped; `/?view=map`
  folds into `/`. Trailing slashes are stripped.
- **URL shapes**: `/event/<uuid>`, `/venue/<uuid>`, `/city/<slug>`, `/venues`,
  `/about`, `/privacy`, `/terms`, `/blog/*`, `/platform`, `/developers{,/api,/mcp,/widgets}`,
  `/embed/events` (widget iframe; `noindex`, `frame-ancestors *`, keyed on its full query),
  `/widget.js` (static loader), `/sitemap.xml`.
  Uuids are lowercase; case variants **301** to lowercase (`redirectTargetFor`).
- **301 table** (`redirectTargetFor`): trailing slash → none; uppercase uuid →
  lowercase; `/<city-slug>` → `/city/<slug>`; `/map` → `/?view=map`;
  `/filters` → `/`; `/sitemap`, `/sitemaps`, `/sitemap-blog.xml` → `/sitemap.xml`.
- **410 table** (`GONE_PATHS`): `/friends /create /home /profile /support
  /discover-creators /followed-venues /following-activity /followers /user/*
  /auth/* /invite/*` — answer **410 + noindex**. Do NOT block them in
  robots.txt: crawlers must fetch them to drop them from the index.
- **Event pages**: live → 200 with per-event title/description/canonical/OG +
  Event JSON-LD; past date → **410 + noindex** (still render a friendly page);
  soft-deleted (`is_deleted=1`, `getEvent` returns it) → **410** + "no longer listed"
  notice + noindex; unknown id → 404 + noindex. 404/410 on `/event/*` and `/venue/*`
  are edge-cached like a 200. Venue pages: unknown/inactive → 404; no upcoming events
  *and* no description/address → noindex. City pages with <3 events → noindex.
- **Feed pagination vs filters**: `?page=N` on `/city/<slug>` is indexable with a
  self-referencing canonical (`canonicalQuery="page=N"`); `/?page=N` canonicalises to
  it. Any real filter (`when cat free paid max tod region q`) → noindex + canonical to
  the bare city page, filter chips are `rel=nofollow`, and robots.txt disallows those
  query keys. Never link filter permutations without nofollow.
- **Sitemap**: `/sitemap.xml` is a sitemap index → `/sitemaps/static.xml` (static,
  blog, cities with ≥3 events), `/sitemaps/venues.xml` (active venues with ≥1 upcoming
  event), `/sitemaps/events-N.xml` (10k per chunk; upcoming, non-deleted, ≤180 days out,
  one URL per recurring series = its next date). No `<lastmod>` on events/venues: the
  pipeline bumps `updated_at` on every upsert. Google's cap is 50k URLs per file.
- **robots.txt**: allow all crawlers **including AI/answer engines** (GPTBot,
  ClaudeBot, PerplexityBot …) — blocking them killed GEO visibility; disallow
  only `/api/`, `/embed/`, `/saved`, `/filters` and the filter query keys (`/*?when=` …); `Sitemap: https://findlocal.community/sitemap.xml`.
  `noindex` on `/saved`, `/filters`. Keep `public/llms.txt` (site description,
  key pages, URL shapes, city list) current.
- **Verification meta**: `<meta name="impact-site-verification" value="69cc4690-1595-47a6-9724-1c86ad3258b6">`
  on every HTML page (`IMPACT_SITE_VERIFICATION`).
- **`fl_city` cookie contract**: the site writes
  `fl_city=<City.name, URL-encoded>; Path=/; Max-Age=31536000; SameSite=Lax`
  when the user picks a city; server-rendered pages read it
  (`decodeURIComponent`, fall back to **Boston**) to pick the city for `/`.
  Anything cached per city must key on it (old Pages Functions: 5-min
  `caches.default` per city, `private, no-cache` to browsers).
- **No analytics** (GA4/Clarity removed 2026-09-02; Cloudflare's cookieless
  Web Analytics only). No user accounts, auth, RSVPs or event creation exist
  — treat requests for them as net-new features.
- **Favorites** ("saved events") are local-only (browser storage), per city.

## Cloudflare resources (account fdd795bd6b82faac11b02577a977ccc9)

- D1 `findlocal` (70f5c88b-958d-46be-ba63-cfc695f1d496) — owned by FindLocalData
- Worker `findlocal-mcp` → mcp.findlocal.community (DO `FindLocalMCP`,
  KV `OAUTH_KV` 660e7821…, `USAGE_KV` 41e6a9fd…; secret `COOKIE_ENCRYPTION_KEY`)
- Worker `findlocal-web` → findlocal.community (web/; custom_domain route — remove the hostname from the old Pages project first)

## Testing notes

Tests run inside workerd (`cloudflareTest` plugin, vitest 4). `shared/test/setup.ts`
applies `shared/data/schema/*.sql` via `applyD1Migrations`; `shared/test/seed.ts`
inserts ~60 deterministic events (dates relative to today in America/New_York).
Seed in `beforeAll` — per-test storage isolation rolls back writes made inside tests.
