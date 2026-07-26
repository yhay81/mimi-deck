import { beforeEach, describe, expect, it, vi } from "vitest";

import { app, type Bindings } from "../src/worker";

const bind = vi.fn(() => ({}) as D1PreparedStatement);
const prepare = vi.fn(() => ({ bind }) as unknown as D1PreparedStatement);
const batch = vi.fn(() => Promise.resolve([]));
const limit = vi.fn(() => Promise.resolve({ success: true }));
const bindings = {
  ASSETS: {
    fetch: () => Promise.resolve(new Response("not used")),
  },
  DB: {
    batch,
    prepare,
  },
  SEARCH_RATE_LIMITER: {
    limit,
  },
} as unknown as Bindings;

const eventPayload = {
  name: "saved",
  sessionId: "7c0dbe70-8c47-4fc0-aa62-52427133c612",
};

const appleEpisode = {
  artworkUrl600: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/example/600x600bb.jpg",
  collectionId: 1450522865,
  collectionName: "歴史を面白く学ぶラジオ",
  description: "<b>平安時代</b>の暮らしを、資料から読み解きます。",
  primaryGenreName: "歴史",
  releaseDate: "2026-07-19T21:00:00Z",
  trackId: 1000777464059,
  trackName: "平安京の一日",
  trackTimeMillis: 2492000,
  trackViewUrl: "https://podcasts.apple.com/jp/podcast/example/id1450522865?i=1000777464059",
};

describe("worker", () => {
  beforeEach(() => {
    bind.mockClear();
    prepare.mockClear();
    batch.mockClear();
    limit.mockClear();
    limit.mockResolvedValue({ success: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            results: [
              appleEpisode,
              {
                ...appleEpisode,
                artworkUrl600: "https://attacker.example/art.jpg",
                trackId: 2,
              },
              {
                ...appleEpisode,
                collectionName: "English show",
                description: "English only",
                trackId: 3,
                trackName: "English only",
              },
            ],
          }),
        ),
      ),
    );
  });

  it("renders the actual Japanese episode discovery workspace", async () => {
    const response = await app.request("/", undefined, bindings);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("https://*.mzstatic.com");
    expect(html).toContain('lang="ja"');
    expect(html).toContain('id="search"');
    expect(html).toContain('id="episode-grid"');
    expect(html).toContain('id="queue-list"');
    expect(html).toContain('id="episode-template"');
    expect(html).toContain("今度聴く");
    expect(html).not.toContain("data-template-surface");
    expect(html).not.toContain('class="hero"');
    expect(html).not.toContain("実験");
    expect(html).not.toContain("成功条件");
  });

  it("explains the actual search and storage boundary", async () => {
    const response = await app.request("/privacy", undefined, bindings);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("iTunes Search API");
    expect(html).toContain("検索語");
    expect(html).toContain("localStorage");
    expect(html).toContain("35日間");
  });

  it("returns sanitized Japanese Apple podcast episodes", async () => {
    const response = await app.request(
      "/api/search",
      {
        body: JSON.stringify({ query: " 平安　時代 " }),
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        method: "POST",
      },
      bindings,
    );
    const body = await response.json<{ episodes: Array<Record<string, unknown>> }>();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.episodes).toHaveLength(1);
    expect(body.episodes[0]).toMatchObject({
      description: "平安時代の暮らしを、資料から読み解きます。",
      show: "歴史を面白く学ぶラジオ",
      title: "平安京の一日",
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("term=%E5%B9%B3%E5%AE%89+%E6%99%82%E4%BB%A3"),
      expect.objectContaining({
        cf: { cacheEverything: true, cacheTtl: 1800 },
      }),
    );
    expect(limit).toHaveBeenCalledOnce();
  });

  it("limits repeated upstream searches", async () => {
    limit.mockResolvedValueOnce({ success: false });
    const response = await app.request(
      "/api/search",
      {
        body: JSON.stringify({ query: "歴史" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
      bindings,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    {
      expected: 415,
      headers: { "content-type": "text/plain" },
      payload: JSON.stringify({ query: "歴史" }),
    },
    {
      expected: 403,
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "cross-site",
      },
      payload: JSON.stringify({ query: "歴史" }),
    },
    {
      expected: 400,
      headers: { "content-type": "application/json" },
      payload: "{",
    },
    {
      expected: 400,
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ query: "" }),
    },
    {
      expected: 413,
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ query: "x".repeat(1100) }),
    },
  ])("rejects invalid search requests with $expected", async ({ expected, headers, payload }) => {
    const response = await app.request(
      "/api/search",
      {
        body: payload,
        headers,
        method: "POST",
      },
      bindings,
    );

    expect(response.status).toBe(expected);
  });

  it("stores a validated anonymous product event", async () => {
    const response = await app.request(
      "/api/events",
      {
        body: JSON.stringify(eventPayload),
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        method: "POST",
      },
      bindings,
    );

    expect(response.status).toBe(204);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(bind).toHaveBeenCalledWith(
      eventPayload.sessionId,
      eventPayload.name,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(batch).toHaveBeenCalledOnce();
  });

  it("rejects an unknown event", async () => {
    const response = await app.request(
      "/api/events",
      {
        body: JSON.stringify({ ...eventPayload, name: "query_text" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
      bindings,
    );

    expect(response.status).toBe(400);
    expect(batch).not.toHaveBeenCalled();
  });

  it("runs retention cleanup on the daily schedule", async () => {
    const run = vi.fn(() => Promise.resolve({}) as unknown as Promise<D1Result>);
    const scheduledPrepare = vi.fn(() => ({ run }) as unknown as D1PreparedStatement);
    const waitUntil = vi.fn();
    const module = (await import("../src/worker")).default;

    module.scheduled(
      {} as ScheduledController,
      {
        ...bindings,
        DB: { prepare: scheduledPrepare } as unknown as D1Database,
      },
      { waitUntil } as unknown as ExecutionContext,
    );

    expect(scheduledPrepare).toHaveBeenCalledWith(
      "DELETE FROM product_events WHERE created_at < unixepoch() - (35 * 86400)",
    );
    expect(run).toHaveBeenCalledOnce();
    expect(waitUntil).toHaveBeenCalledOnce();
  });

  it("exposes a machine-readable health endpoint", async () => {
    const response = await app.request("/healthz", undefined, bindings);
    const body = await response.json<{ healthy: boolean }>();

    expect(response.status).toBe(200);
    expect(body.healthy).toBe(true);
  });
});
