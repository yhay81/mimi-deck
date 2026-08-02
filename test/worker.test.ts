import { beforeEach, describe, expect, it, vi } from "vitest";

import { app, type Bindings } from "../src/worker";

const bind = vi.fn(() => ({}) as D1PreparedStatement);
const prepare = vi.fn(() => ({ bind }) as unknown as D1PreparedStatement);
const batch = vi.fn(() => Promise.resolve([]));
const assetsFetch = vi.fn(() => Promise.resolve(Response.json({ episodes: [] })));
const remoteFetch = vi.fn(() => Promise.resolve(Response.json({ episodes: [] })));
const bindings = {
  ASSETS: {
    fetch: assetsFetch,
  },
  DB: {
    batch,
    prepare,
  },
} as unknown as Bindings;

const eventPayload = {
  name: "saved",
  sessionId: "7c0dbe70-8c47-4fc0-aa62-52427133c612",
};

const catalogEpisode = {
  artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/example/600x600bb.jpg",
  collectionId: "1450522865",
  description: "平安時代の暮らしを、資料から読み解きます。",
  durationMs: 2492000,
  genre: "歴史",
  releaseDate: "2026-07-19T21:00:00Z",
  show: "歴史を面白く学ぶラジオ",
  title: "平安京の一日",
  topics: ["歴史"],
  trackId: "1000777464059",
  url: "https://podcasts.apple.com/jp/podcast/example/id1450522865?i=1000777464059",
};

describe("worker", () => {
  beforeEach(() => {
    bind.mockClear();
    prepare.mockClear();
    batch.mockClear();
    assetsFetch.mockClear();
    assetsFetch.mockResolvedValue(
      Response.json({
        episodes: [catalogEpisode],
        generatedAt: "2026-08-02T00:00:00.000Z",
      }),
    );
    remoteFetch.mockClear();
    remoteFetch.mockResolvedValue(
      Response.json({
        episodes: [
          catalogEpisode,
          ...Array.from({ length: 99 }, (_, index) => ({
            ...catalogEpisode,
            description: "子育ての工夫を紹介します。",
            title: `子育て便り ${index + 1}`,
            topics: ["子育て"],
            trackId: `child-${index + 1}`,
          })),
        ],
        generatedAt: "2026-08-02T00:00:00.000Z",
      }),
    );
    vi.stubGlobal("fetch", remoteFetch);
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
    expect(html).toContain("公開カタログ");
    expect(html).toContain("Appleへ直接送信しません");
    expect(html).toContain("検索語");
    expect(html).toContain("localStorage");
    expect(html).toContain("35日間");
  });

  it("returns matching Japanese podcast episodes from the local catalog", async () => {
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
    expect(remoteFetch).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/yhay81/mimi-deck/main/public/episodes.json",
      expect.objectContaining({ cf: { cacheEverything: true, cacheTtl: 3600 } }),
    );
    expect(assetsFetch).not.toHaveBeenCalled();
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
