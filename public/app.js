(() => {
  "use strict";

  const form = document.querySelector("#search");
  const input = document.querySelector("#topic");
  const grid = document.querySelector("#episode-grid");
  const template = document.querySelector("#episode-template");
  const resultTitle = document.querySelector("#result-title");
  const resultCount = document.querySelector("#result-count");
  const status = document.querySelector("#search-status");
  const sort = document.querySelector("#sort-results");
  const queueList = document.querySelector("#queue-list");
  const queueCount = document.querySelector("#queue-count");

  if (
    !(form instanceof HTMLFormElement) ||
    !(input instanceof HTMLInputElement) ||
    !(grid instanceof HTMLElement) ||
    !(template instanceof HTMLTemplateElement)
  ) {
    return;
  }

  const queueKey = "mimi-deck:queue:v1";
  const sessionKey = "mimi-deck:session:v1";
  const visitKey = "mimi-deck:last-visit:v1";
  const today = new Date().toISOString().slice(0, 10);
  let episodes = [];
  let queue = [];
  let searchController;

  const makeSessionId = () =>
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replaceAll(/[xy]/g, (character) => {
          const random = Math.floor(Math.random() * 16);
          const value = character === "x" ? random : (random & 0x3) | 0x8;
          return value.toString(16);
        });

  let sessionId = "";
  let lastVisit = "";
  try {
    sessionId = localStorage.getItem(sessionKey) ?? "";
    if (!sessionId) {
      sessionId = makeSessionId();
      localStorage.setItem(sessionKey, sessionId);
    }
    lastVisit = localStorage.getItem(visitKey) ?? "";
    localStorage.setItem(visitKey, today);
  } catch {
    sessionId = makeSessionId();
  }

  const track = (name) => {
    void fetch("/api/events", {
      body: JSON.stringify({ name, sessionId }),
      headers: { "content-type": "application/json" },
      keepalive: true,
      method: "POST",
    }).catch(() => undefined);
  };

  const cleanEpisode = (episode) => {
    if (!episode || typeof episode !== "object") {
      return null;
    }
    const value = (key, maximum) =>
      typeof episode[key] === "string" ? episode[key].slice(0, maximum) : "";
    const trackId = value("trackId", 32);
    const title = value("title", 180);
    const show = value("show", 140);
    const url = value("url", 2048);
    const artwork = value("artwork", 2048);
    if (!trackId || !title || !show || !url.startsWith("https://podcasts.apple.com/")) {
      return null;
    }
    return {
      artwork: artwork.startsWith("https://") ? artwork : "",
      collectionId: value("collectionId", 32),
      description: value("description", 240),
      durationMs:
        typeof episode.durationMs === "number" && Number.isFinite(episode.durationMs)
          ? Math.max(0, Math.min(episode.durationMs, 86_400_000))
          : 0,
      genre: value("genre", 40),
      releaseDate: value("releaseDate", 40),
      show,
      title,
      trackId,
      url,
    };
  };

  try {
    const stored = JSON.parse(localStorage.getItem(queueKey) ?? "[]");
    queue = Array.isArray(stored) ? stored.map(cleanEpisode).filter(Boolean).slice(0, 20) : [];
  } catch {
    queue = [];
  }

  const persistQueue = () => {
    try {
      localStorage.setItem(queueKey, JSON.stringify(queue));
    } catch {
      // The current view still works when browser storage is unavailable.
    }
  };

  const formatDuration = (milliseconds) => {
    if (!milliseconds) {
      return "時間不明";
    }
    const minutes = Math.max(1, Math.round(milliseconds / 60_000));
    return minutes >= 60
      ? `${Math.floor(minutes / 60)}時間${minutes % 60 ? `${minutes % 60}分` : ""}`
      : `${minutes}分`;
  };

  const formatDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.valueOf())
      ? "公開日不明"
      : new Intl.DateTimeFormat("ja-JP", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(date);
  };

  const isSaved = (trackId) => queue.some((episode) => episode.trackId === trackId);

  const setSavedButton = (button, saved) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.textContent = saved ? "✓ 追加済み" : "＋ 今度聴く";
    button.dataset.saved = String(saved);
    button.setAttribute("aria-pressed", String(saved));
  };

  const makeQueueItem = (episode) => {
    const article = document.createElement("article");
    article.className = "queue-item";

    const image = document.createElement("img");
    image.alt = "";
    image.height = 56;
    image.loading = "lazy";
    image.src = episode.artwork;
    image.width = 56;

    const copy = document.createElement("div");
    const show = document.createElement("small");
    show.textContent = episode.show;
    const title = document.createElement("strong");
    title.textContent = episode.title;
    copy.append(show, title);

    const actions = document.createElement("div");
    const link = document.createElement("a");
    link.href = episode.url;
    link.rel = "noreferrer";
    link.textContent = "聴く ↗";
    link.addEventListener("click", () => track("opened"));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", `${episode.title}を今度聴くから削除`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      queue = queue.filter((item) => item.trackId !== episode.trackId);
      persistQueue();
      renderQueue();
      renderEpisodes();
    });
    actions.append(link, remove);
    article.append(image, copy, actions);
    return article;
  };

  const renderQueue = () => {
    if (!(queueList instanceof HTMLElement)) {
      return;
    }
    queueList.replaceChildren();
    if (queue.length === 0) {
      const empty = document.createElement("div");
      empty.className = "queue-empty";
      const mark = document.createElement("span");
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = "＋";
      const text = document.createElement("p");
      text.textContent = "気になる回をカードから追加";
      const detail = document.createElement("small");
      detail.textContent = "この端末だけに保存します";
      empty.append(mark, text, detail);
      queueList.append(empty);
    } else {
      queue.forEach((episode) => queueList.append(makeQueueItem(episode)));
    }
    if (queueCount instanceof HTMLOutputElement) {
      queueCount.textContent = `${queue.length} / 20`;
    }
  };

  const sortedEpisodes = () => {
    const value = sort instanceof HTMLSelectElement ? sort.value : "relevance";
    const copied = [...episodes];
    if (value === "recent") {
      copied.sort(
        (left, right) =>
          new Date(right.releaseDate).valueOf() - new Date(left.releaseDate).valueOf(),
      );
    } else if (value === "short") {
      copied.sort(
        (left, right) =>
          (left.durationMs || Number.MAX_SAFE_INTEGER) -
          (right.durationMs || Number.MAX_SAFE_INTEGER),
      );
    }
    return copied;
  };

  const renderEpisodes = () => {
    grid.replaceChildren();
    const sorted = sortedEpisodes();
    sorted.forEach((episode) => {
      const fragment = template.content.cloneNode(true);
      const card = fragment.querySelector(".episode-card");
      const image = fragment.querySelector("img");
      const duration = fragment.querySelector(".duration");
      const show = fragment.querySelector(".show-name");
      const title = fragment.querySelector("h3");
      const description = fragment.querySelector(".episode-description");
      const time = fragment.querySelector("time");
      const genre = fragment.querySelector(".genre");
      const save = fragment.querySelector(".save-button");
      const listen = fragment.querySelector(".listen-link");

      if (
        !(card instanceof HTMLElement) ||
        !(image instanceof HTMLImageElement) ||
        !(duration instanceof HTMLElement) ||
        !(show instanceof HTMLElement) ||
        !(title instanceof HTMLElement) ||
        !(description instanceof HTMLElement) ||
        !(time instanceof HTMLTimeElement) ||
        !(genre instanceof HTMLElement) ||
        !(save instanceof HTMLButtonElement) ||
        !(listen instanceof HTMLAnchorElement)
      ) {
        return;
      }

      image.alt = `${episode.show}のカバー画像`;
      image.src = episode.artwork;
      duration.textContent = formatDuration(episode.durationMs);
      show.textContent = episode.show;
      title.textContent = episode.title;
      description.textContent = episode.description;
      time.dateTime = episode.releaseDate;
      time.textContent = formatDate(episode.releaseDate);
      genre.textContent = episode.genre || "ポッドキャスト";
      setSavedButton(save, isSaved(episode.trackId));
      save.addEventListener("click", () => {
        if (isSaved(episode.trackId)) {
          queue = queue.filter((item) => item.trackId !== episode.trackId);
        } else {
          queue = [episode, ...queue].slice(0, 20);
          track("saved");
        }
        persistQueue();
        renderQueue();
        renderEpisodes();
      });
      listen.href = episode.url;
      listen.addEventListener("click", () => track("opened"));
      grid.append(fragment);
    });

    if (sorted.length === 0) {
      const empty = document.createElement("div");
      empty.className = "result-empty";
      empty.textContent = "別の言葉や、もう少し広いテーマで探してみてください。";
      grid.append(empty);
    }
    grid.setAttribute("aria-busy", "false");
  };

  const search = async (query, countAsSearch = true) => {
    const normalized = query.normalize("NFKC").replaceAll(/\s+/g, " ").trim().slice(0, 40);
    if (!normalized) {
      if (status instanceof HTMLElement) {
        status.textContent = "テーマを入力してください。";
      }
      return;
    }

    searchController?.abort();
    searchController = new AbortController();
    input.value = normalized;
    if (resultTitle instanceof HTMLElement) {
      resultTitle.textContent = `「${normalized}」のエピソード`;
    }
    if (resultCount instanceof HTMLOutputElement) {
      resultCount.textContent = "検索中…";
    }
    if (status instanceof HTMLElement) {
      status.textContent = "";
    }
    grid.setAttribute("aria-busy", "true");
    if (countAsSearch) {
      track("searched");
    }

    try {
      const response = await fetch("/api/search", {
        body: JSON.stringify({ query: normalized }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: searchController.signal,
      });
      if (!response.ok) {
        throw new Error(response.status === 429 ? "rate_limited" : "search_failed");
      }
      const body = await response.json();
      episodes = Array.isArray(body.episodes)
        ? body.episodes.map(cleanEpisode).filter(Boolean).slice(0, 12)
        : [];
      renderEpisodes();
      if (resultCount instanceof HTMLOutputElement) {
        resultCount.textContent = `${episodes.length}件`;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      episodes = [];
      renderEpisodes();
      if (resultCount instanceof HTMLOutputElement) {
        resultCount.textContent = "0件";
      }
      if (status instanceof HTMLElement) {
        status.textContent =
          error instanceof Error && error.message === "rate_limited"
            ? "検索が続いています。1分ほど待ってから試してください。"
            : "いま検索できません。少し待ってからもう一度お試しください。";
      }
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void search(input.value);
  });
  document.querySelectorAll("[data-topic]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button instanceof HTMLButtonElement) {
        void search(button.dataset.topic ?? "");
      }
    });
  });
  if (sort instanceof HTMLSelectElement) {
    sort.addEventListener("change", renderEpisodes);
  }

  renderQueue();
  track("visited");
  if (lastVisit && lastVisit !== today) {
    track("returned");
  }
  void search(input.value, false);
})();
