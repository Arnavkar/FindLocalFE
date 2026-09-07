---
title: How to Connect FindLocal to Claude, Cursor, and Other AI Assistants (MCP)
description: Add the FindLocal MCP server to Claude.ai, Claude Code, Cursor, or any MCP client and ask plain-English questions about live local events in 47 US cities. Setup steps, the account key, and every tool explained.
date: 2026-09-04
---

> **Reference:** the up-to-date endpoint, parameter and field tables now live at [/developers/mcp](/developers/mcp). This post is the walkthrough.

Find Local runs a remote [MCP](https://modelcontextprotocol.io) server. MCP (Model Context Protocol) is the open standard AI assistants use to call outside tools, so once it's connected you can ask Claude or Cursor things like "what's free in Brooklyn this weekend?" or "any jazz near Cambridge tonight?" and it will answer from the same curated venue calendars the website uses, with links back to each event.

The server lives at:

```
https://mcp.findlocal.community/mcp
```

It's read-only, uses the Streamable HTTP transport (an `/sse` endpoint exists for older clients), and authorizes with OAuth plus a short **account key** step described below. If you'd rather query the data directly from code, see [the Events API guide](/blog/findlocal-events-api).

## 1. Add the server to your client

### Claude.ai (web and desktop)

1. Open **Settings → Connectors**.
2. Choose **Add custom connector**.
3. Paste `https://mcp.findlocal.community/mcp` and save.
4. Click **Connect**. A small FindLocal authorization page opens — see the account key step below.
5. In a new chat, make sure the **FindLocal** connector is toggled on, then ask about events.

### Claude Code (terminal)

```bash
claude mcp add --transport http findlocal https://mcp.findlocal.community/mcp
```

Start a session and the first FindLocal tool call will open the authorization page in your browser.

### Cursor

Add the server to `~/.cursor/mcp.json` (or your project's `.cursor/mcp.json`) and restart Cursor:

```json
{
  "mcpServers": {
    "findlocal": {
      "url": "https://mcp.findlocal.community/mcp"
    }
  }
}
```

### Any other MCP client

Any client that supports remote servers over Streamable HTTP with OAuth works — point it at the URL above. To poke at the tools without a chat client, use the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
# transport: Streamable HTTP, URL: https://mcp.findlocal.community/mcp
```

## 2. Authorize with an account key

When your client connects, FindLocal shows a one-field consent page asking for an **account key**. Usage is metered per key so we can keep the service healthy.

- To try it out, enter **`demo-free`**. It's a shared demo account with **100 tool calls per month**.
- For your own key with a higher quota, email **findlocalinternal@gmail.com** with a sentence about what you're building. There's no self-serve signup yet.

Once authorized you won't be asked again for that client. You can check where you stand any time by asking the assistant to run `get_usage`, which reports the account's calls used and remaining for the current month. When a quota is exhausted, tool calls return a clear "monthly quota reached" message rather than partial data.

## 3. Ask questions

Some prompts that work well:

- "What's happening in Boston tonight that's free?"
- "Find comedy shows in Chicago this weekend under $25."
- "List music venues in Austin's East Side and what's coming up at each."
- "Is there anything family-friendly in Denver on Saturday afternoon?"
- "What categories of events does FindLocal have in Seattle, and how many of each?"

Every event the assistant gets back includes a `url` to its page on findlocal.community, plus ticket and venue links when the venue publishes them, so you can jump straight from the chat to buying a ticket.

## The tools

These are the tools the server exposes. Your assistant picks the right one automatically; the list is here so you know what's possible and how to phrase requests.

| Tool | What it does | Inputs |
|---|---|---|
| `search_events` | The main one. Upcoming events in a city, filtered every way the site can filter. Returns `{ city, total_matched, returned, events }`. | `city` (required; name or slug), `region`, `when` (`anytime`, `today`, `tomorrow`, `weekend`, `week`), `date_from` / `date_to` (`YYYY-MM-DD`), `category` (a slug or a genre word like `jazz`), `free_only`, `price_max` (USD), `time_of_day` (`morning`, `afternoon`, `evening`), `query` (free text), `limit` (1–200, default 50) |
| `get_event` | Full detail for one event, including its description. Past and delisted events still come back, flagged `expired` / `delisted`. | `id` |
| `list_venues` | Active venues in a city or region with address, coordinates, and upcoming counts. | `city` (required), `region`, `limit` (≤500) |
| `get_venue` | One venue by id, or a fuzzy name search returning up to 5 matches. | `id`, or `name` (+ optional `city`) |
| `list_categories` | The category slugs `search_events` accepts, with the number of upcoming events in each for a city. | `city` (required) |
| `get_events_at_venue` | Upcoming events at one venue. | `venue_id`, `limit` (≤100, default 20) |
| `get_usage` | This account's calls used and remaining this month. Not metered. | none |

Categories are `music`, `comedy`, `theater`, `dance`, `art`, `food_drink`, `family`, `market`, `workshop`, `fitness`, `nightlife`, `community`, `festival`, `parks`, `literary`, and `literary`. Cities can be given by name ("New York") or slug ("new-york"); the full list of 47 metros is in [llms.txt](/llms.txt).

An event in a tool result looks like:

```json
{
  "id": "8f9b9068-4e11-466b-a1cc-d36230d28fdd",
  "title": "Hooley Hour",
  "date": "2026-09-04",
  "start_time": "17:00:00",
  "city": "Boston",
  "region": "Cambridge",
  "venue": { "id": "b7716a13-…", "name": "The Lilypad", "address": "1353 Cambridge St, Cambridge, MA 02139" },
  "category": "music",
  "category_tags": ["Theater", "Music"],
  "recurring": true,
  "upcoming_dates_in_series": 4,
  "details_url": "https://www.lilypadinman.com/home/2026/hooley-hour-bs5y2-pl4db9",
  "image": "https://images.squarespace-cdn.com/…/1000016764.jpg",
  "website": "https://www.lilypadinman.com/",
  "url": "https://findlocal.community/event/8f9b9068-4e11-466b-a1cc-d36230d28fdd",
  "source": "scraper_local"
}
```

Fields that are empty for an event are simply omitted. `date` is the venue's local calendar day; `price_label` is the venue's own wording and `price_usd` our parsed number when we have one; `is_free` is set when we can tell either way.

## Good to know

- **Freshness.** Venue calendars are re-scraped regularly, typically daily, so results reflect what venues currently list. The `when` buckets are resolved in each city's time zone.
- **Coverage.** 47 US metros, thousands of venues, with an emphasis on the small and mid-size venues that never make it onto ticketing aggregators. A missing venue is a gap in our crawl, not a sign the event doesn't exist — tell us at findlocalinternal@gmail.com.
- **Privacy.** The server only ever reads event and venue data. It stores the account key you authorize with and a per-month call counter, nothing about your conversations.
- **Rate limits.** Quotas are monthly per account key. If `demo-free` is exhausted when you try it, that's other people trying it too — request your own key.

## What's next

- [How to use the FindLocal Events API](/blog/findlocal-events-api) — the same data as plain JSON.
- [How Find Local finds events the big platforms miss](/blog/how-find-local-finds-events) — where the data comes from.
- [The FindLocal platform page](/platform) — the overview for teams building on the data.
