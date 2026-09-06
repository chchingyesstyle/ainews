import type { StoryRecord } from "../../db/types";
import { EmptyState, StoryTeaser } from "../components";

export function TagPage({ name, stories }: { name: string; stories: StoryRecord[] }) {
  return (
    <section class="archive-page section-wrap">
      <header class="page-header">
        <p class="eyebrow">主題標籤</p>
        <h1>{name}</h1>
        <p class="page-header__lede">提及「{name}」的已發布人工智能新聞。</p>
      </header>
      {stories.length > 0 ? stories.map((story) => <StoryTeaser story={story} key={story.id} />) : <EmptyState message="這個主題暫時沒有文章。" />}
    </section>
  );
}
