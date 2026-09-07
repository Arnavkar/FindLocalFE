---
title: "Put Live Local Events on Your Site: FindLocal Widgets, and Every Other Way to Get Our Data"
description: A single script tag now puts a live list, calendar and map of local events on any web page — starting with Literary New England. Here's the widget, and the API and MCP doors that sit beside it.
date: 2026-09-06
---

Find Local started as a website: one place to see what's happening in your city, pulled straight from venue calendars instead of whatever an algorithm decided to show you. That's still the heart of it. But a feed of clean, current local events is useful in a lot more places than our own pages, and over the past month we've been opening doors so the data can go where people already are.

Today there are four:

| Door | Best for | Where to start |
|---|---|---|
| **The site** | Browsing, saving, sharing | [findlocal.community](/) |
| **JSON API** | Apps, newsletters, dashboards, scripts | [/developers/api](/developers/api) |
| **MCP server** | Claude, Cursor and other AI assistants | [/developers/mcp](/developers/mcp) |
| **Widgets** (new) | Any web page, no code | [/developers/widgets](/developers/widgets) |

All four read the same database, so a bookstore's widget, a newsletter's API call and an assistant's tool result always agree.

## The widget

Paste one line where you want the calendar:

```html
<script src="https://findlocal.community/widget.js" data-widget="literary-new-england"></script>
```

That's it. The tag inserts a small frame that shows upcoming events three ways — a date-grouped **list**, a month **calendar** you can click through, and a **map** of the venues — with a "Powered by FindLocal" credit at the bottom. It sizes itself to its content, follows your visitor's light or dark setting, works in a sidebar or full width, and every event links back to its page on Find Local (and from there to the venue's own listing or ticket page).

There's no code to maintain and nothing to update. As venues change their calendars and our scrapers pick the changes up, the widget changes with them.

## Why Literary New England first

This summer we onboarded nearly three hundred literary venues across New England — independent bookstores, public libraries, writing centers and literary organizations — in eighteen metro areas from Stamford to Bangor, and gave their events their own `literary` category: author talks, readings, book launches, book clubs, poetry, storytelling, workshops.

It was the obvious first widget for two reasons. First, the audience is real and underserved: the people who go to a Tuesday-night reading at a bookstore in Northampton find out about it from a chalkboard, a newsletter or a friend, not from a ticketing aggregator. Second, these venues are exactly the kind of organizations that should be able to show "what's happening around here" on their own site without hiring a developer. A library can now put the whole region's literary calendar on its events page, and a bookstore blog can show what's on across the state next to its own listings.

"New England" isn't a thing our database knew about — events belong to one metro partition each. So the widget introduces **region groups**: named bundles of metros that a widget can query at once. `new-england` is the first; others are a one-line change, so tell us which you'd like.

## Build your own

The preset is one of many combinations. Every widget takes a scope and, optionally, a category, a date window, an initial view and a theme:

```html
<!-- Comedy in Chicago this weekend, map first, dark -->
<script src="https://findlocal.community/widget.js"
  data-city="chicago" data-cat="comedy" data-when="weekend"
  data-view="map" data-theme="dark"></script>
```

The [widget page](/developers/widgets) has a builder that writes the tag for you and shows a live preview, plus the full attribute reference. If you want to see which of your readers click through, add `data-partner="your-site"` and it rides along on every link as a UTM parameter.

## The other doors, briefly

**The JSON API** is the same data as plain HTTPS: `GET https://findlocal.community/api/events?city=boston&when=weekend&cat=music`. No key, no signup, CORS open, cached for five minutes at the edge. Every filter the site has is a query parameter, and every listing page advertises its JSON twin in a `<link rel="alternate">`. [Reference](/developers/api) · [walkthrough](/blog/findlocal-events-api).

**The MCP server** at `https://mcp.findlocal.community/mcp` gives an assistant seven tools — search events, look up a venue, list categories and so on — so "anything free in Cambridge tonight?" gets a sourced answer with links instead of a confident guess. It uses OAuth plus an account key; `demo-free` gets you a hundred calls a month to try it. [Reference](/developers/mcp) · [walkthrough](/blog/findlocal-mcp-server).

And if you're a team evaluating the data rather than a person embedding a calendar, the [platform overview](/platform) is the short version of why it's different: aggregated across sources, structured, and kept current, with the long tail of venue-site events the big platforms never see.

## What's next

- More presets: per-city "this weekend" widgets, a single-venue widget for venues that want their own calendar on their own site, and category widgets for the parks and outdoors events we added earlier this year.
- More region groups as people ask for them.
- A way for widget partners to see their own referral numbers without emailing us.

If you put a widget somewhere, we'd love to see it — [findlocalinternal@gmail.com](mailto:findlocalinternal@gmail.com). And if there's a door you need that isn't here yet, say so. The whole point is that the data should be able to go wherever local events are actually discovered.
