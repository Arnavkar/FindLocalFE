// /llms.txt — machine-readable summary of the site for AI answer engines,
// per https://llmstxt.org. Prerendered so it ships as a static asset, but
// generated (rather than a hand-maintained public/llms.txt) so the city
// count and list never drift from the vendored data (see cities.json / CITIES).
import type { APIRoute } from 'astro';
import { CATEGORIES, CITIES } from '@findlocal/shared';

export const prerender = true;

function body(): string {
  const cityNames = CITIES.map((c) => c.name).join(', ');
  const categorySlugs = CATEGORIES.map((c) => c.slug).join(', ');
  return `# Find Local

> Find Local (findlocal.community) is a local event discovery site covering ${CITIES.length} US cities. It aggregates concerts, comedy shows, theater, live music, and community events directly from venue calendars — updated daily — with list and map browsing, category/date/price filters, and per-venue pages.

Find Local's data is scraped from the venues themselves rather than ticketing aggregators, so it includes small community events that never appear on Ticketmaster-style platforms. Event and venue pages serve schema.org Event/Place JSON-LD in the initial HTML.

## Key pages

- [Event feed](https://findlocal.community/): all upcoming events, filterable by city, date, category, and price
- [Venues](https://findlocal.community/venues): browsable directory of active venues
- [City pages](https://findlocal.community/city/boston): per-city event listings at /city/<slug> (e.g. /city/new-york, /city/chicago, /city/los-angeles)
- [Blog](https://findlocal.community/blog): guides and writing about local event discovery
- [Platform](https://findlocal.community/platform): the FindLocal data platform for teams building on the data
- [Developers](https://findlocal.community/developers): reference docs for the JSON API (/developers/api), the MCP server (/developers/mcp) and embeddable widgets (/developers/widgets)
- [About](https://findlocal.community/about)

## URL shapes

- Event detail: https://findlocal.community/event/<uuid> — expired events return 410
- Venue detail: https://findlocal.community/venue/<uuid>
- City listing: https://findlocal.community/city/<city-slug>

## Machine-readable

- Sitemap: https://findlocal.community/sitemap.xml
- JSON API: https://findlocal.community/api/events?city=Boston (also /api/events/<uuid>, /api/venues?city=Boston); noindex, CORS enabled
- API reference: https://findlocal.community/developers/api (walkthrough: https://findlocal.community/blog/findlocal-events-api)
- MCP server: https://mcp.findlocal.community/mcp — reference: https://findlocal.community/developers/mcp
- Embeddable widget: <script src="https://findlocal.community/widget.js" data-widget="literary-new-england"></script> renders a list/calendar/map of live events in an iframe (/embed/events); reference: https://findlocal.community/developers/widgets
- Cities covered (${CITIES.length}): ${cityNames}
- Event categories: ${categorySlugs}
`;
}

export const GET: APIRoute = () =>
  new Response(body(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
