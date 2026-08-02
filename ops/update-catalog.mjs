import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const topics = [
  "歴史",
  "子育て",
  "科学",
  "映画",
  "働き方",
  "本",
  "旅",
  "社会",
  "ニュース",
  "健康",
  "テクノロジー",
  "文化",
  "宇宙",
  "転職",
  "平安時代",
];
const japanesePattern = /[\u3040-\u30ff\u3400-\u9fff]/;
const outputPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "episodes.json",
);

function stringValue(value, maximum = 240) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function cleanDescription(value) {
  return stringValue(value, 1200)
    .replaceAll(/<[^>]*>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function safeUrl(value, allowedHost) {
  const raw = stringValue(value, 2048);
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && allowedHost(url.hostname) ? url.toString() : "";
  } catch {
    return "";
  }
}

function mapEpisode(item, topic) {
  const title = stringValue(item.trackName, 180);
  const show = stringValue(item.collectionName, 140);
  const description = cleanDescription(item.description ?? item.shortDescription);
  const trackId =
    typeof item.trackId === "number" || typeof item.trackId === "string"
      ? String(item.trackId).slice(0, 32)
      : "";
  const artwork = safeUrl(item.artworkUrl600 ?? item.artworkUrl160, (host) =>
    host.endsWith(".mzstatic.com"),
  );
  const url = safeUrl(item.trackViewUrl, (host) => host === "podcasts.apple.com");

  if (
    !title ||
    !show ||
    !trackId ||
    !artwork ||
    !url ||
    !japanesePattern.test(`${title} ${show} ${description}`)
  ) {
    return null;
  }

  return {
    artwork,
    collectionId:
      typeof item.collectionId === "number" || typeof item.collectionId === "string"
        ? String(item.collectionId).slice(0, 32)
        : "",
    description: description || "Apple Podcastsでエピソードの詳しい内容を確認できます。",
    durationMs:
      typeof item.trackTimeMillis === "number" && Number.isFinite(item.trackTimeMillis)
        ? Math.max(0, Math.min(item.trackTimeMillis, 86_400_000))
        : 0,
    genre: stringValue(item.primaryGenreName, 40),
    releaseDate: stringValue(item.releaseDate, 40),
    show,
    title,
    topics: [topic],
    trackId,
    url,
  };
}

const episodesById = new Map();
for (const topic of topics) {
  const parameters = new URLSearchParams({
    attribute: "descriptionTerm",
    country: "JP",
    entity: "podcastEpisode",
    explicit: "No",
    lang: "ja_jp",
    limit: "50",
    media: "podcast",
    term: topic,
  });
  const response = await fetch(`https://itunes.apple.com/search?${parameters.toString()}`, {
    headers: {
      accept: "application/json",
      "user-agent": "MimiDeckCatalog/0.1 (+https://mimi-deck.yhay81.com)",
    },
  });
  if (!response.ok) {
    throw new Error(`Apple search failed for ${topic}: HTTP ${response.status}`);
  }

  const payload = await response.json();
  for (const item of Array.isArray(payload.results) ? payload.results : []) {
    const episode = mapEpisode(item, topic);
    if (!episode) {
      continue;
    }
    const existing = episodesById.get(episode.trackId);
    if (existing) {
      existing.topics = [...new Set([...existing.topics, topic])].sort((left, right) =>
        left.localeCompare(right, "ja"),
      );
    } else {
      episodesById.set(episode.trackId, episode);
    }
  }
}

const episodes = [...episodesById.values()]
  .sort((left, right) => right.releaseDate.localeCompare(left.releaseDate))
  .slice(0, 750);
if (episodes.length < 100) {
  throw new Error(`Catalog is unexpectedly small: ${episodes.length} episodes`);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), topics, episodes }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`Wrote ${episodes.length} episodes to ${outputPath}\n`);
