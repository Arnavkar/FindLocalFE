import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CATEGORIES,
  CITIES,
  categoryBySlug,
  categoryCounts,
  cityBySlug,
  countUpcomingEvents,
  dateRangeFor,
  getCity,
  getEvent,
  getVenue,
  listUpcomingEvents,
  listUpcomingEventsForVenue,
  listVenues,
  searchVenuesByName,
  slugForToken,
  todayIn,
  type City,
  type EventFilters,
} from "@findlocal/shared";
import type { CustomerProps, Env } from "./types";
import { enforceAndMeter, readUsage } from "./metering";
import { shapeEvent, shapeVenue } from "./shape";

function jsonText(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function errText(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/** Accept a city by display name ('New York') or slug ('new-york'). */
function resolveCity(input: string): City | undefined {
  return getCity(input) ?? cityBySlug(input);
}

function cityError(input: string) {
  return errText(`Unknown city '${input}'. Supported cities: ${CITIES.map((c) => c.name).join(", ")} (slugs like 'new-york' also work).`);
}

const WHEN = z.enum(["anytime", "today", "tomorrow", "this_weekend", "weekend", "week"]);

/**
 * FindLocal Events MCP server. Read-only tools over the curated D1 `events` /
 * `venues` data (via @findlocal/shared query helpers — the same semantics the
 * website uses). Every tool first passes through `enforceAndMeter`, which
 * validates the calling customer (from the OAuth grant props) and meters usage.
 */
export class FindLocalMCP extends McpAgent<Env, unknown, CustomerProps> {
  server = new McpServer({
    name: "FindLocal Events",
    version: "2.0.0",
  });

  private get customerId(): string | undefined {
    return this.props?.customerId;
  }

  private async gate(): Promise<{ ok: true } | { ok: false; response: ReturnType<typeof errText> }> {
    const res = await enforceAndMeter(this.env, this.customerId);
    if (res.ok) return { ok: true };
    return { ok: false, response: errText(res.message) };
  }

  async init(): Promise<void> {
    this.server.tool(
      "search_events",
      "Search curated upcoming local events in a city. Filter by date (or a `when` bucket), category, price, time of day, region, and free-text. Returns events enriched with venue name and address. This is the primary tool.",
      {
        city: z.string().describe("City name or slug, e.g. 'New York' / 'new-york', 'Boston'. Required."),
        region: z.string().optional().describe("Borough/neighbourhood, e.g. 'Brooklyn', 'Cambridge'."),
        when: WHEN.optional().describe("Date bucket resolved in the city's time zone. Overrides date_from/date_to. 'weekend' = upcoming Fri–Sun, 'week' = next 7 days."),
        date_from: z.string().optional().describe("Inclusive lower bound, YYYY-MM-DD. Defaults to today."),
        date_to: z.string().optional().describe("Inclusive upper bound, YYYY-MM-DD."),
        category: z.string().optional().describe(`Category slug (${CATEGORIES.map((c) => c.slug).join(", ")}) or a raw genre token like 'jazz'. Call list_categories to discover options.`),
        free_only: z.boolean().optional().describe("Only free events ($0 or labelled free)."),
        price_max: z.number().optional().describe("Maximum ticket price in USD (events without a parsed price are excluded)."),
        time_of_day: z.enum(["morning", "afternoon", "evening"]).optional(),
        query: z.string().optional().describe("Free-text search over event title, venue name and performer/author names."),
        limit: z.number().int().min(1).max(200).optional().describe("Max events to return (default 50)."),
      },
      async (input) => {
        const gate = await this.gate();
        if (!gate.ok) return gate.response;
        try {
          const city = resolveCity(input.city);
          if (!city) return cityError(input.city);
          const f = buildFilters(city, input);
          const [events, total] = await Promise.all([listUpcomingEvents(this.env.DB, f), countUpcomingEvents(this.env.DB, f)]);
          return jsonText({ city: city.name, total_matched: total, returned: events.length, events: events.map((e) => shapeEvent(e)) });
        } catch (e: any) {
          return errText(`search_events failed: ${e.message}`);
        }
      },
    );

    this.server.tool(
      "get_event",
      "Get the full detail for a single event by id (includes description). Past and delisted events are still returned, flagged with `expired` / `delisted`.",
      { id: z.string().describe("Event UUID.") },
      async ({ id }) => {
        const gate = await this.gate();
        if (!gate.ok) return gate.response;
        try {
          const event = await getEvent(this.env.DB, id);
          if (!event) return jsonText({ found: false as const, id });
          const tz = getCity(event.city)?.tz ?? "America/New_York";
          return jsonText({
            found: true as const,
            expired: event.event_date < todayIn(tz),
            delisted: event.is_deleted === 1,
            event: shapeEvent(event, true),
          });
        } catch (e: any) {
          return errText(`get_event failed: ${e.message}`);
        }
      },
    );

    this.server.tool(
      "list_venues",
      "List active venues in a city (optionally a specific region), with address, coordinates and upcoming event counts.",
      {
        city: z.string().describe("City name or slug. Required."),
        region: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
      async (input) => {
        const gate = await this.gate();
        if (!gate.ok) return gate.response;
        try {
          const city = resolveCity(input.city);
          if (!city) return cityError(input.city);
          const venues = await listVenues(this.env.DB, { city: city.name, region: input.region, withUpcoming: true });
          const capped = venues.slice(0, Math.min(input.limit ?? 500, 500));
          return jsonText({ city: city.name, count: capped.length, venues: capped.map(shapeVenue) });
        } catch (e: any) {
          return errText(`list_venues failed: ${e.message}`);
        }
      },
    );

    this.server.tool(
      "get_venue",
      "Look up a venue by id, or fuzzy-search by name (returns up to 5 matches).",
      {
        id: z.string().optional().describe("Venue UUID."),
        name: z.string().optional().describe("Full or partial venue name."),
        city: z.string().optional().describe("Restrict a name search to one city."),
      },
      async (input) => {
        const gate = await this.gate();
        if (!gate.ok) return gate.response;
        try {
          if (input.id) {
            const v = await getVenue(this.env.DB, input.id);
            return jsonText(v ? { found: true as const, venue: shapeVenue(v) } : { found: false as const });
          }
          if (input.name) {
            const cityName = input.city ? resolveCity(input.city)?.name : undefined;
            const matches = await searchVenuesByName(this.env.DB, input.name, cityName, 5);
            return jsonText({ found: matches.length > 0, matches: matches.map(shapeVenue) });
          }
          return errText("get_venue requires either `id` or `name`.");
        } catch (e: any) {
          return errText(`get_venue failed: ${e.message}`);
        }
      },
    );

    this.server.tool(
      "list_categories",
      "List the event categories search_events accepts, with the number of upcoming events in each for a city.",
      { city: z.string().describe("City name or slug. Required.") },
      async (input) => {
        const gate = await this.gate();
        if (!gate.ok) return gate.response;
        try {
          const city = resolveCity(input.city);
          if (!city) return cityError(input.city);
          const counts = new Map((await categoryCounts(this.env.DB, city.name)).map((c) => [c.category, c.count]));
          return jsonText({
            city: city.name,
            categories: CATEGORIES.map((c) => ({ slug: c.slug, label: c.label, upcoming_events: counts.get(c.slug) ?? 0 })),
          });
        } catch (e: any) {
          return errText(`list_categories failed: ${e.message}`);
        }
      },
    );

    this.server.tool(
      "get_events_at_venue",
      "List upcoming events at a specific venue (by venue id).",
      {
        venue_id: z.string().describe("Venue UUID."),
        limit: z.number().int().min(1).max(100).optional(),
      },
      async (input) => {
        const gate = await this.gate();
        if (!gate.ok) return gate.response;
        try {
          const venue = await getVenue(this.env.DB, input.venue_id);
          const events = await listUpcomingEventsForVenue(this.env.DB, input.venue_id, Math.min(input.limit ?? 20, 100), venue ? { city: venue.city } : {});
          return jsonText({ venue: venue ? shapeVenue(venue) : { id: input.venue_id }, count: events.length, events: events.map((e) => shapeEvent(e)) });
        } catch (e: any) {
          return errText(`get_events_at_venue failed: ${e.message}`);
        }
      },
    );

    // Not metered — lets a customer (or the demo) inspect their own quota usage.
    this.server.tool(
      "get_usage",
      "Report this account's current-month API usage and remaining quota.",
      {},
      async () => jsonText(await readUsage(this.env, this.customerId)),
    );
  }
}

interface SearchInput {
  region?: string;
  when?: z.infer<typeof WHEN>;
  date_from?: string;
  date_to?: string;
  category?: string;
  free_only?: boolean;
  price_max?: number;
  time_of_day?: "morning" | "afternoon" | "evening";
  query?: string;
  limit?: number;
}

function buildFilters(city: City, p: SearchInput): EventFilters {
  const f: EventFilters = { city: city.name, limit: Math.min(p.limit ?? 50, 200) };
  if (p.when && p.when !== "anytime") {
    const r = dateRangeFor(p.when === "this_weekend" ? "weekend" : p.when, city.tz);
    f.from = r.from;
    f.to = r.to;
  } else {
    if (p.date_from) f.from = p.date_from;
    if (p.date_to) f.to = p.date_to;
  }
  if (p.region) f.region = p.region;
  if (p.category) {
    const slug = categoryBySlug(p.category)?.slug ?? slugForToken(p.category);
    // An unknown category matches nothing rather than silently everything.
    f.categories = [slug ?? "__none__"];
  }
  if (p.free_only) f.free = true;
  if (p.price_max !== undefined) f.maxPrice = p.price_max;
  if (p.time_of_day) f.timeOfDay = [p.time_of_day];
  if (p.query) f.text = p.query;
  return f;
}
