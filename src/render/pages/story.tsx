import type { StoryRecord } from "../../db/types";
import { AiDisclosure, EmptyState, StoryMeta, StoryTeaser, safeHref, storyFacts } from "../components";

export function StoryPage({ story, related }: { story: StoryRecord; related: StoryRecord[] }) {
  const facts = storyFacts(story);
  return (
    <article class="story-page section-wrap">
      <header class="story-page__header">
        <StoryMeta story={story} />
        <h1>{story.headline_zh_hk}</h1>
        <p class="story-page__summary">{story.summary_zh_hk}</p>
      </header>
      <div class="story-page__body">
        {facts.length > 0 ? (
          <section class="key-facts" aria-labelledby="key-facts-title">
            <p class="eyebrow" id="key-facts-title">三項重點</p>
            <ol>{facts.map((fact, index) => <li key={`${story.id}-${index}`}>{fact}</li>)}</ol>
          </section>
        ) : null}
        <div class="source-panel">
          <p class="eyebrow">原文來源</p>
          <p>{story.source_name}</p>
          <a class="source-button" href={safeHref(story.source_url)} target="_blank" rel="noopener noreferrer">
            前往來源網站 <span aria-hidden="true">↗</span>
          </a>
        </div>
        <AiDisclosure />
      </div>
      <section class="related-stories" aria-labelledby="related-title">
        <div class="section-heading"><div><p class="eyebrow">同類文章</p><h2 id="related-title">延伸閱讀</h2></div></div>
        {related.length > 0 ? related.map((item) => <StoryTeaser story={item} key={item.id} />) : <EmptyState message="暫時沒有更多同類文章。" />}
      </section>
    </article>
  );
}
