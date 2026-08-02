import { Hono } from "hono";
import { requestId } from "hono/request-id";

import { securityHeaders } from "./middleware/security";
import { HomePage, PrivacyPage } from "./ui/pages";

type RateLimiter = {
  limit(input: { key: string }): Promise<{ success: boolean }>;
};

export type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
  SEARCH_RATE_LIMITER: RateLimiter;
};

type AppleResult = Record<string, unknown>;
type AppleResponse = {
  results?: AppleResult[];
};

const eventNames = new Set(["visited", "searched", "saved", "opened", "returned"]);
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const japanesePattern = /[\u3040-\u30ff\u3400-\u9fff]/;

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", requestId());
app.use("*", securityHeaders);

app.get("/", (c) => c.html(<HomePage />));
app.get("/privacy", (c) => c.html(<PrivacyPage />));

function stringValue(value: unknown, maximum = 240) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function safeUrl(value: unknown, allowedHost: (host: string) => boolean) {
  const raw = stringValue(value, 2048);
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && allowedHost(url.hostname) ? url.toString() : "";
  } catch {
    return "";
  }
}

function cleanDescription(value: unknown) {
  return stringValue(value, 1200)
    .replaceAll(/<[^>]*>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function hasControlCharacters(value: string) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function mapEpisode(item: AppleResult) {
  const title = stringValue(item.trackName, 180);
  const show = stringValue(item.collectionName, 140);
  const description = cleanDescription(item.description ?? item.shortDescription);
  const japaneseText = `${title} ${show} ${description}`;
  const trackId =
    typeof item.trackId === "number" || typeof item.trackId === "string"
      ? String(item.trackId).slice(0, 32)
      : "";

  if (!title || !show || !trackId || !japanesePattern.test(japaneseText)) {
    return null;
  }

  return {
    artwork: safeUrl(item.artworkUrl600 ?? item.artworkUrl160, (host) =>
      host.endsWith(".mzstatic.com"),
    ),
    collectionId:
      typeof item.collectionId === "number" || typeof item.collectionId === "string"
        ? String(item.collectionId).slice(0, 32)
        : "",
    description: description || "番組ページでエピソードの詳しい内容を確認できます。",
    durationMs:
      typeof item.trackTimeMillis === "number" && Number.isFinite(item.trackTimeMillis)
        ? Math.max(0, Math.min(item.trackTimeMillis, 86_400_000))
        : 0,
    genre: stringValue(item.primaryGenreName, 40),
    releaseDate: stringValue(item.releaseDate, 40),
    show,
    title,
    trackId,
    url: safeUrl(item.trackViewUrl, (host) => host === "podcasts.apple.com"),
  };
}

app.post("/api/search", async (c) => {
  c.header("Cache-Control", "no-store");

  const contentLength = Number(c.req.header("content-length") ?? "0");
  if (contentLength > 1024) {
    return c.json({ error: "payload_too_large" }, 413);
  }
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return c.json({ error: "unsupported_media_type" }, 415);
  }
  const fetchSite = c.req.header("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    return c.json({ error: "cross_site_request" }, 403);
  }

  const rate = await c.env.SEARCH_RATE_LIMITER.limit({
    key: c.req.header("cf-connecting-ip") ?? "unknown",
  });
  if (!rate.success) {
    c.header("Retry-After", "60");
    return c.json({ error: "rate_limited" }, 429);
  }

  let rawPayload: string;
  try {
    rawPayload = await c.req.text();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (new TextEncoder().encode(rawPayload).byteLength > 1024) {
    return c.json({ error: "payload_too_large" }, 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const query =
    payload &&
    typeof payload === "object" &&
    typeof (payload as { query?: unknown }).query === "string"
      ? (payload as { query: string }).query.normalize("NFKC").replaceAll(/\s+/g, " ").trim()
      : "";
  if (query.length < 1 || query.length > 40 || hasControlCharacters(query)) {
    return c.json({ error: "invalid_query" }, 400);
  }

  const parameters = new URLSearchParams({
    attribute: "descriptionTerm",
    country: "JP",
    entity: "podcastEpisode",
    explicit: "No",
    lang: "ja_jp",
    limit: "16",
    media: "podcast",
    term: query,
  });
  const upstream = await fetch(`https://itunes.apple.com/search?${parameters.toString()}`, {
    cf: {
      cacheEverything: true,
      cacheTtl: 1800,
    },
    headers: {
      accept: "application/json",
      "user-agent": "MimiDeck/0.1 (+https://mimi-deck.yhay81.com)",
    },
  });
  if (!upstream.ok) {
    return c.json({ error: "upstream_unavailable" }, 502);
  }

  const data = (await upstream.json()) as AppleResponse;
  const episodes = (Array.isArray(data.results) ? data.results : [])
    .map(mapEpisode)
    .filter((episode) => episode !== null && episode.url && episode.artwork)
    .slice(0, 12);

  return c.json({ episodes });
});

app.post("/api/events", async (c) => {
  c.header("Cache-Control", "no-store");

  const contentLength = Number(c.req.header("content-length") ?? "0");
  if (contentLength > 1024) {
    return c.json({ error: "payload_too_large" }, 413);
  }
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return c.json({ error: "unsupported_media_type" }, 415);
  }
  const fetchSite = c.req.header("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    return c.json({ error: "cross_site_request" }, 403);
  }

  let rawPayload: string;
  try {
    rawPayload = await c.req.text();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (new TextEncoder().encode(rawPayload).byteLength > 1024) {
    return c.json({ error: "payload_too_large" }, 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!payload || typeof payload !== "object") {
    return c.json({ error: "invalid_event" }, 400);
  }

  const { name, sessionId } = payload as Record<string, unknown>;
  if (
    typeof name !== "string" ||
    !eventNames.has(name) ||
    typeof sessionId !== "string" ||
    !sessionIdPattern.test(sessionId)
  ) {
    return c.json({ error: "invalid_event" }, 400);
  }

  const occurredOn = new Date().toISOString().slice(0, 10);
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO product_events
        (session_id, name, occurred_on)
       VALUES (?, ?, ?)`,
    ).bind(sessionId, name, occurredOn),
    c.env.DB.prepare("DELETE FROM product_events WHERE created_at < unixepoch() - (35 * 86400)"),
  ]);
  return c.body(null, 204);
});

app.get("/healthz", (c) =>
  c.json({
    healthy: true,
    service: "mimi-deck",
    time: new Date().toISOString(),
  }),
);

app.notFound((c) =>
  c.json(
    {
      error: "not_found",
      requestId: c.get("requestId"),
    },
    404,
  ),
);

app.onError((error, c) => {
  console.error(
    JSON.stringify({
      event: "request_failed",
      message: error.message,
      requestId: c.get("requestId"),
    }),
  );

  return c.json(
    {
      error: "internal_error",
      requestId: c.get("requestId"),
    },
    500,
  );
});

export { app };
export default {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, env: Bindings, context: ExecutionContext) {
    context.waitUntil(
      env.DB.prepare(
        "DELETE FROM product_events WHERE created_at < unixepoch() - (35 * 86400)",
      ).run(),
    );
  },
};
