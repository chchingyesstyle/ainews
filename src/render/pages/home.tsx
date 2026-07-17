import type { DigestRecord, StoryRecord } from "../../db/types";
import { formatDigestDate } from "../components";
import { AiDisclosure, EmptyState, StoryTeaser, storyHref } from "../components";

export interface HomePageProps {
  digest: DigestRecord | null;
  digestStories: StoryRecord[];
  stories: StoryRecord[];
}

export function HomePage({ digest, digestStories, stories }: HomePageProps) {
  return (
    <>
      <section class="hero section-wrap">
        <div class="hero__copy">
          <p class="eyebrow">全球人工智能動態</p>
          <h1>今日值得知道的<br /><em>AI 新聞</em></h1>
          <p class="hero__lede">把重要發展整理成兩分鐘內讀完的香港繁體中文摘要，保留每一條原文來源。</p>
        </div>
        <div class="hero__aside">
          <p class="hero__aside-label">更新節奏</p>
          <p class="hero__aside-value">每日一更</p>
          <p>中立、事實為本<br />不取代原文報道</p>
        </div>
      </section>

      {digest ? (
        <section class="digest-lead section-wrap" aria-labelledby="digest-title">
          <div class="digest-lead__header">
            <div>
              <p class="eyebrow">每日摘要 · {formatDigestDate(digest.digest_date)}</p>
              <h2 id="digest-title"><a href={`/digest/${digest.digest_date}`}>{digest.headline_zh_hk}</a></h2>
            </div>
            <a class="text-link" href={`/digest/${digest.digest_date}`}>閱讀完整摘要 <span aria-hidden="true">→</span></a>
          </div>
          <p class="digest-lead__intro">{digest.intro_zh_hk}</p>
          <div class="digest-lead__stories">
            {digestStories.slice(0, 5).map((story) => (
              <a class="digest-lead__story" href={storyHref(story)} key={story.id}>
                <span class="digest-lead__story-category">{story.category}</span>
                <strong>{story.headline_zh_hk}</strong>
              </a>
            ))}
          </div>
          <AiDisclosure />
        </section>
      ) : (
        <section class="section-wrap"><EmptyState message="今日摘要尚未發布，請稍後再來。" /></section>
      )}

      <section class="story-stream section-wrap" aria-labelledby="latest-title">
        <div class="section-heading">
          <div><p class="eyebrow">最新動態</p><h2 id="latest-title">逐篇閱讀</h2></div>
          <span class="section-heading__count">{stories.length} 篇</span>
        </div>
        {stories.length > 0 ? stories.map((story) => <StoryTeaser story={story} key={story.id} />) : <EmptyState message="暫時沒有已發布文章。" />}
      </section>
    </>
  );
}
