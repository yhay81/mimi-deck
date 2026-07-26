import { product } from "../config/product";
import { Layout } from "./layout";

const topics = ["歴史", "子育て", "科学", "映画", "働き方", "本", "旅"];

export function HomePage() {
  return (
    <Layout>
      <section class="deck-shell">
        <header class="deck-heading">
          <div>
            <p class="eyebrow">JAPANESE PODCASTS</p>
            <h1>テーマから、聴く回を探す。</h1>
          </div>
          <p>番組名ではなく、いま気になる話題を入れてください。</p>
        </header>

        <form class="search-bar" id="search">
          <label>
            <span class="visually-hidden">テーマ</span>
            <span aria-hidden="true" class="search-mark">
              ⌕
            </span>
            <input
              autocomplete="off"
              id="topic"
              maxLength={40}
              placeholder="例：宇宙、転職、平安時代"
              required
              type="search"
              value="歴史"
            />
          </label>
          <button type="submit">エピソードを探す</button>
        </form>

        <div class="topic-row" aria-label="テーマの例">
          {topics.map((topic) => (
            <button data-topic={topic} type="button">
              {topic}
            </button>
          ))}
        </div>

        <div class="deck-workspace">
          <section aria-labelledby="result-title" class="result-panel">
            <header class="panel-heading">
              <div>
                <p class="panel-kicker">SEARCH RESULTS</p>
                <h2 id="result-title">「歴史」のエピソード</h2>
              </div>
              <div class="result-tools">
                <output aria-live="polite" id="result-count">
                  検索中…
                </output>
                <label>
                  <span class="visually-hidden">並び順</span>
                  <select id="sort-results">
                    <option value="relevance">関連順</option>
                    <option value="recent">新着順</option>
                    <option value="short">短い順</option>
                  </select>
                </label>
              </div>
            </header>

            <p aria-live="polite" class="search-status" id="search-status"></p>
            <div aria-busy="true" class="episode-grid" id="episode-grid">
              {[0, 1, 2, 3].map(() => (
                <article aria-hidden="true" class="episode-card loading-card">
                  <span class="loading-art"></span>
                  <span class="loading-line wide"></span>
                  <span class="loading-line"></span>
                  <span class="loading-line short"></span>
                </article>
              ))}
            </div>
          </section>

          <aside aria-labelledby="queue-title" class="queue-panel">
            <header class="queue-heading">
              <div>
                <p class="panel-kicker">LISTEN LATER</p>
                <h2 id="queue-title">今度聴く</h2>
              </div>
              <output id="queue-count">0 / 20</output>
            </header>
            <div class="queue-list" id="queue-list">
              <div class="queue-empty">
                <span aria-hidden="true">＋</span>
                <p>気になる回をカードから追加</p>
                <small>この端末だけに保存します</small>
              </div>
            </div>
          </aside>
        </div>

        <template id="episode-template">
          <article class="episode-card">
            <div class="episode-cover">
              <img alt="" height="160" loading="lazy" width="160" />
              <span class="duration"></span>
            </div>
            <div class="episode-body">
              <p class="show-name"></p>
              <h3></h3>
              <p class="episode-description"></p>
              <div class="episode-meta">
                <time></time>
                <span class="genre"></span>
              </div>
              <div class="episode-actions">
                <button class="save-button" type="button">
                  ＋ 今度聴く
                </button>
                <a class="listen-link" rel="noreferrer">
                  Appleで聴く ↗
                </a>
              </div>
            </div>
          </article>
        </template>
      </section>
    </Layout>
  );
}

export function PrivacyPage() {
  return (
    <Layout title={`プライバシー | ${product.name}`}>
      <article class="prose">
        <p class="eyebrow">PRIVACY</p>
        <h1>検索語は、検索のためだけに送ります。</h1>
        <p>
          入力したテーマは検索時にAppleのiTunes Search APIへ送信します。Mimi
          Deckのデータベースには検索語、番組名、エピソード名を保存しません。
        </p>
        <h2>この端末に保存するもの</h2>
        <p>
          「今度聴く」へ追加した公開エピソード情報と匿名セッションIDをブラウザのlocalStorageへ保存します。
          ブラウザのサイトデータを消すと削除できます。
        </p>
        <h2>サーバーに保存するもの</h2>
        <p>
          匿名セッションID、訪問・検索・保存・Appleへの移動・別日再訪という操作、日付を35日間保存します。
          氏名、メールアドレス、検索語、保存したカードの内容、IPアドレスはデータベースへ保存しません。
        </p>
      </article>
    </Layout>
  );
}
