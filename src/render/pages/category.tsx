import type { Category, StoryRecord } from "../../db/types";
import { EmptyState, StoryTeaser } from "../components";

export function CategoryPage({ category, stories }: { category: Category; stories: StoryRecord[] }) {
  return (
    <section class="archive-page section-wrap">
      <header class="page-header">
        <p class="eyebrow">分類 archive</p>
        <h1>{category}</h1>
        <p class="page-header__lede">按分類瀏覽已發布的人工智能新聞。</p>
      </header>
      {stories.length > 0 ? stories.map((story) => <StoryTeaser story={story} key={story.id} />) : <EmptyState message="這個分類暫時沒有文章。" />}
    </section>
  );
}
