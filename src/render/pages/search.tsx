import type { StoryRecord } from "../../db/types";
import { EmptyState, StoryTeaser } from "../components";

export function SearchPage({ query, stories }: { query: string; stories: StoryRecord[] }) {
  return (
    <section class="archive-page section-wrap">
      <header class="page-header">
        <p class="eyebrow">文章搜尋</p>
        <h1>搜尋新聞</h1>
        <form class="search-form search-form--large" method="get" action="/search">
          <label class="visually-hidden" for="search-query">搜尋關鍵字</label>
          <input id="search-query" name="q" type="search" value={query} placeholder="輸入關鍵字，例如模型、開源" />
          <button type="submit">搜尋</button>
        </form>
        {query ? <p class="search-result-note">「{query}」共有 {stories.length} 篇結果</p> : null}
      </header>
      {stories.length > 0 ? stories.map((story) => <StoryTeaser story={story} key={story.id} />) : <EmptyState message={query ? "未找到符合條件的文章" : "請輸入關鍵字開始搜尋。"} />}
    </section>
  );
}
