---
title: How to Use the FindLocal Events API
description: A free, no-key JSON API for every upcoming event and venue FindLocal tracks across 47 US cities. Endpoints, filters, response shapes, and examples in curl, JavaScript, and Python.
date: 2026-09-04
---

> **Reference:** the up-to-date endpoint, parameter and field tables now live at [/developers/api](/developers/api). This post is the walkthrough.

Every listing page on Find Local has a JSON twin. The same filters you click on the site — city, date, category, price, time of day, neighborhood, search — work as query parameters against `https://findlocal.community/api/events`, and the response is the same data the page renders. There is no API key, no signup, and CORS is open, so you can call it from a browser, a script, a spreadsheet, or a cron job.

If you'd rather have an AI assistant do the querying, see the companion guide on [connecting FindLocal to Claude, Cursor, and other assistants over MCP](/blog/findlocal-mcp-server).

## Endpoints

| Endpoint | Returns |
|---|---|
| `GET /api/events` | Upcoming events in a city, filtered and paginated |
| `GET /api/events/<uuid>` | One event, including past and delisted ones |
| `GET /api/venues` | Active venues in a city with upcoming-event counts |

Base URL: `https://findlocal.community`. Only `GET` (and `OPTIONS`) are supported.

## Quick start

```bash
# Live music in Boston this week
curl 'https://findlocal.community/api/events?city=boston&cat=music&when=week&limit=5'

# Free things to do in Brooklyn this weekend, evenings only
curl 'https://findlocal.community/api/events?city=new-york&region=Brooklyn&when=weekend&free=1&tod=evening'

# Every active venue in Chicago
curl 'https://findlocal.community/api/venues?city=chicago'
```

## Filtering `/api/events`

The parameters mirror the site's URLs exactly: `/city/boston?cat=music&when=weekend` on the site is `/api/events?city=boston&cat=music&when=weekend` on the API.

| Parameter | Values | Notes |
|---|---|---|
| `city` | Name or slug: `Boston`, `new-york`, `los-angeles` | Defaults to Boston. See [the city list](/llms.txt). |
| `when` | `anytime` · `today` · `tomorrow` · `weekend` · `week` · `YYYY-MM-DD` | Resolved in the city's time zone. `weekend` is the upcoming Fri–Sun, `week` the next 7 days. Default `anytime` (everything upcoming). |
| `cat` | Comma list of slugs, or repeated (`cat=music&cat=comedy`) | `music`, `comedy`, `theater`, `dance`, `art`, `food_drink`, `family`, `market`, `workshop`, `fitness`, `nightlife`, `community`, `festival`, `parks`, `literary` |
| `free` | `1` | Only free events ($0 or labelled free) |
| `paid` | `1` | Only ticketed events. `free=1&paid=1` returns both. |
| `max` | Number (USD) | Max ticket price. Events without a parsed price are excluded. |
| `tod` | Comma list of `morning`, `afternoon`, `evening` | Time of day of the start time |
| `region` | Borough / neighborhood label, e.g. `Brooklyn`, `Cambridge` | Use `/api/venues` to see the labels a city uses |
| `q` | Free text, up to 100 chars | Matches event title and venue name |
| `page` | 1-based | 100 events per page by default |
| `limit` | 1–500 | Overrides the page size |
| `venue` | Venue UUID | Upcoming events at one venue |
| `ids` | Comma list of up to 200 event UUIDs | Bypasses all other filters and returns any date, including delisted events. This is how the site's Saved page works. |

Unknown values are ignored rather than rejected, so `cat=jazz` quietly matches nothing extra — check the response `meta.total` if a filter seems to have no effect.

## Response shape

```json
{
  "data": [ /* EventRow[] */ ],
  "meta": { "city": "Boston", "count": 5, "total": 82, "page": 1, "page_size": 5 }
}
```

`total` is the full match count for the filters; `count` is how many rows are in this page. `/api/events?ids=…` returns `meta: { count }` only, and `/api/events/<uuid>` returns `{ "data": {…} }` or a `404` with `{ "error": "not found" }`.

An event row looks like this (trimmed from a real response):

```json
{
  "id": "8f9b9068-4e11-466b-a1cc-d36230d28fdd",
  "title": "Hooley Hour",
  "description": "donate to artists 5-7pm all ages",
  "event_date": "2026-09-04",
  "start_time": "17:00:00",
  "end_time": null,
  "city": "Boston",
  "region": "Cambridge",
  "category": "music",
  "event_type": ["Theater", "Music"],
  "price": null,
  "price_amount": null,
  "detail_page_url": "https://www.lilypadinman.com/home/2026/hooley-hour-bs5y2-pl4db9",
  "ticket_page_url": null,
  "image_url": "https://images.squarespace-cdn.com/…/1000016764.jpg",
  "is_deleted": 0,
  "venue_id": "b7716a13-e708-4573-8445-ea786a47233e",
  "venue_name": "The Lilypad",
  "venue_address": "1353 Cambridge St, Cambridge, MA 02139",
  "venue_lat": 42.3738079,
  "venue_lng": -71.100088,
  "venue_url": "https://www.lilypadinman.com/",
  "venue_type": "Jazz Club",
  "series_count": 4,
  "series_image": "https://images.squarespace-cdn.com/…/1000016764.jpg",
  "source": "scraper_local",
  "first_seen_at": "2026-07-03T06:20:36.366Z",
  "last_seen_at": "2026-08-07T07:23:34.117Z",
  "updated_at": "2026-09-04T23:17:55.599Z"
}
```

Things worth knowing about the fields:

- **`event_date` is a plain calendar day** in the venue's local time zone. Don't `new Date()` it — that would shift it by your UTC offset. Combine it with `start_time` (24-hour `HH:MM:SS`, may be `null`) if you need a timestamp.
- **`price` is the raw label** from the venue ("$15 adv / $20 door", "Free", "Donation"); **`price_amount`** is our best parsed number in USD, or `null` when we couldn't parse one. `free=1` uses both.
- **`category`** is one of the slugs above; **`event_type`** is the venue's own genre tags.
- **`series_count` > 1** means the same title has that many upcoming dates at this venue (a weekly trivia night, a theater run). `series_image` is the first image found in that series.
- **`is_deleted: 1`** means the venue stopped listing the event. `/api/events` never returns these; `/api/events/<uuid>` and `ids=` do, so you can render an honest "no longer listed" state.
- **Booleans are `0`/`1`**, straight from the database.
- The public page for any event is `https://findlocal.community/event/<id>`, and an iCalendar file is at `https://findlocal.community/event/<id>/calendar.ics`.

A venue row from `/api/venues`:

```json
{
  "id": "d21997e7-3a40-4863-8ef7-ad0227d80093",
  "name": "Agganis Arena",
  "city": "Boston",
  "region": "Boston",
  "address": "925 Commonwealth Ave, Boston, MA 02215",
  "url": "https://www.ticketmaster.com/agganis-arena-tickets-boston/venue/8886",
  "description": "Agganis Arena is a versatile venue hosting sports, concerts, and events.",
  "image": "https://s1.ticketm.net/dbimages/22246v.jpg",
  "type": "Music Venue",
  "venue_size": "Unknown",
  "categories": ["music"],
  "latitude": 42.3514544,
  "longitude": -71.1176226,
  "is_active": 1,
  "upcoming": 7
}
```

`/api/venues` accepts `city` and an optional `region`. The public venue page is `https://findlocal.community/venue/<id>`.

## Examples

### JavaScript (browser or Node)

```js
const params = new URLSearchParams({ city: 'seattle', when: 'weekend', cat: 'comedy,music', limit: '50' });
const res = await fetch(`https://findlocal.community/api/events?${params}`);
const { data, meta } = await res.json();

console.log(`${meta.total} events this weekend`);
for (const e of data) {
  console.log(`${e.event_date} ${e.start_time ?? ''} · ${e.title} @ ${e.venue_name}`);
}
```

### Python

```python
import requests

r = requests.get(
    "https://findlocal.community/api/events",
    params={"city": "denver", "when": "today", "free": "1"},
    timeout=15,
)
r.raise_for_status()
body = r.json()
for e in body["data"]:
    print(e["event_date"], e["start_time"], e["title"], "—", e["venue_name"])
print(body["meta"])
```

### Paging through everything

```bash
# Page size is 100 by default; walk `page` until data comes back empty
curl 'https://findlocal.community/api/events?city=austin&page=1'
curl 'https://findlocal.community/api/events?city=austin&page=2'
```

## Caching, freshness, and fair use

- Responses are cached at the edge for **5 minutes** and in your browser for **1 minute** (`Cache-Control: public, max-age=60, s-maxage=300`). Polling faster than that just returns the cached copy.
- Listings update as venues are re-scraped, typically **daily**. `last_seen_at` tells you the last time we saw an event on its source page.
- Coverage is 47 US metros. The full list is in [llms.txt](/llms.txt) and on the [city pages](/venues).
- Every listing page also advertises its JSON twin with `<link rel="alternate" type="application/json">`, so you can discover the API URL for any filtered view from the page itself.
- The API is free and unauthenticated. Please cache on your side, keep request rates reasonable, and link back to the event's Find Local page or the venue's own site. It's a small project; if you're building something that needs volume or guarantees, email **findlocalinternal@gmail.com** and we'll sort something out.
- Field names are stable but the API is not formally versioned. New fields may appear; existing ones won't be renamed without notice on this blog.

## What's next

- [Connect FindLocal to Claude, Cursor, and other AI assistants (MCP)](/blog/findlocal-mcp-server) — the same data as tools an assistant can call.
- [How Find Local finds events the big platforms miss](/blog/how-find-local-finds-events) — where the data comes from.
- [The FindLocal platform page](/platform) — the overview for teams building on the data.
