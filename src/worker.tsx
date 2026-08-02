import { Hono } from "hono";
import { requestId } from "hono/request-id";

import { securityHeaders } from "./middleware/security";
import { HomePage, PrivacyPage } from "./ui/pages";

export type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
};

type CatalogEpisode = {
  artwork: string;
  collectionId: string;
  description: string;
  durationMs: number;
  genre: string;
  releaseDate: string;
  show: string;
  title: string;
  topics: string[];
  trackId: string;
  url: string;
};
type CatalogPayload = { episodes?: CatalogEpisode[]; generatedAt?: string };

const eventNames = new Set(["visited", "searched", "saved", "opened", "returned"]);
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let catalogPromise: Promise<CatalogEpisode[]> | undefined;

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", requestId());
app.use("*", securityHeaders);

app.get("/", (c) => c.html(<HomePage />));
app.get("/privacy", (c) => c.html(<PrivacyPage />));

function hasControlCharacters(value: string) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").replaceAll(/\s+/g, " ").trim().toLocaleLowerCase("ja-JP");
}

function isCatalogEpisode(value: unknown): value is CatalogEpisode {
  if (!value || typeof value !== "object") {
    return false;
  }
  const episode = value as Partial<CatalogEpisode>;
  return (
    typeof episode.artwork === "string" &&
    episode.artwork.startsWith("https://") &&
    typeof episode.collectionId === "string" &&
    typeof episode.description === "string" &&
    typeof episode.durationMs === "number" &&
    typeof episode.genre === "string" &&
    typeof episode.releaseDate === "string" &&
    typeof episode.show === "string" &&
    typeof episode.title === "string" &&
    Array.isArray(episode.topics) &&
    episode.topics.every((topic) => typeof topic === "string") &&
    typeof episode.trackId === "string" &&
    typeof episode.url === "string" &&
    episode.url.startsWith("https://podcasts.apple.com/")
  );
}

function loadCatalog(assets: Fetcher, requestUrl: string) {
  catalogPromise ??= assets
    .fetch(new Request(new URL("/episodes.json", requestUrl)))
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`catalog_http_${response.status}`);
      }
      const payload = (await response.json()) as CatalogPayload;
      return (Array.isArray(payload.episodes) ? payload.episodes : [])
        .filter(isCatalogEpisode)
        .slice(0, 500);
    });
  return catalogPromise;
}

function episodeScore(episode: CatalogEpisode, query: string) {
  const normalized = normalizeSearchText(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const fields = {
    description: normalizeSearchText(episode.description),
    genre: normalizeSearchText(episode.genre),
    show: normalizeSearchText(episode.show),
    title: normalizeSearchText(episode.title),
    topics: normalizeSearchText(episode.topics.join(" ")),
  };
  let score = 0;
  if (fields.title.includes(normalized)) score += 14;
  if (fields.topics.includes(normalized)) score += 12;
  if (fields.show.includes(normalized)) score += 8;
  if (fields.description.includes(normalized)) score += 5;
  if (fields.genre.includes(normalized)) score += 3;
  for (const token of tokens) {
    if (fields.title.includes(token)) score += 6;
    if (fields.topics.includes(token)) score += 5;
    if (fields.show.includes(token)) score += 4;
    if (fields.description.includes(token)) score += 2;
    if (fields.genre.includes(token)) score += 1;
  }
  return score;
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
      ? normalizeSearchText((payload as { query: string }).query)
      : "";
  if (query.length < 1 || query.length > 40 || hasControlCharacters(query)) {
    return c.json({ error: "invalid_query" }, 400);
  }

  let catalog: CatalogEpisode[];
  try {
    catalog = await loadCatalog(c.env.ASSETS, c.req.url);
  } catch {
    catalogPromise = undefined;
    return c.json({ error: "catalog_unavailable" }, 503);
  }
  const episodes = catalog
    .map((episode) => ({ episode, score: episodeScore(episode, query) }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.episode.releaseDate.localeCompare(left.episode.releaseDate),
    )
    .slice(0, 12)
    .map(({ episode }) => episode);

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
