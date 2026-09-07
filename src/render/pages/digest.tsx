import type { Category, DigestRecord, StoryRecord } from "../../db/types";
import { AiDisclosure, DigestCalendar, DigestSectionHeading, EmptyState, formatDateTime, formatDigestDate, safeHref, storyHref } from "../components";

function sectionSummaries(digest: DigestRecord, stories: StoryRecord[]): Map<Category, string> {
  const summaries = new Map<Category, string>();
  // Older partial digests contain concatenated headlines, not an editorial overview.
  if (digest.status !== "published") return summaries;
  try {
    const sections: unknown = JSON.parse(digest.sections_json);
    if (!Array.isArray(sections)) return summaries;
    const byId = new Map(stories.map((story) => [story.id, story]));
    for (const section of sections) {
      if (!section || typeof section !== "object" || typeof section.summaryZhHk !== "string" || !Array.isArray(section.storyIds)) continue;
      if (section.storyIds.length === 0 || !section.storyIds.every((id: number) => byId.get(id)?.category === section.category)) continue;
      summaries.set(section.category, section.summaryZhHk);
    }
  } catch {
    // The linked articles remain readable even when the stored overview is malformed.
  }
  return summaries;
}

export function DigestPage({
  digest,
  stories,
  calendarYear,
  calendarMonth,
  availableDates,
  calendarExpanded = false,
}: {
  digest: DigestRecord;
  stories: StoryRecord[];
  calendarYear: number;
  calendarMonth: number;
  availableDates: Set<string>;
  calendarExpanded?: boolean;
}) {
  const uniqueStories = [...new Map(stories.map((story) => [story.id, story])).values()];
  const groups = new Map<Category, StoryRecord[]>();
  for (const story of uniqueStories) {
    const group = groups.get(story.category) ?? [];
    group.push(story);
    groups.set(story.category, group);
  }
  const summaries = sectionSummaries(digest, uniqueStories);
  const calendar = () => DigestCalendar({ year: calendarYear, month: calendarMonth, availableDates, selectedDate: digest.digest_date });

  return (
    <article class="digest-page section-wrap">
      <div class="digest-page__intro">
        <header class="page-header">
          <h1>每日 AI 新聞摘要</h1>
          <p class="digest-page__meta"><time dateTime={digest.digest_date}>{formatDigestDate(digest.digest_date)}</time><span>{uniqueStories.length} 篇新聞</span></p>
          {digest.status === "partial" ? <p class="digest-page__notice">本期僅提供逐篇摘要，未提供完整總覽。</p> : null}
          <AiDisclosure />
        </header>
        <div class="digest-calendar-desktop">{calendar()}</div>
        <details class="digest-date-picker" open={calendarExpanded}>
          <summary>選擇日期</summary>
          {calendar()}
        </details>
      </div>
      {digest.status === "published" ? (
        <section class="digest-overview" aria-labelledby="digest-overview-title">
          <h2 id="digest-overview-title">{digest.headline_zh_hk}</h2>
          <p>{digest.intro_zh_hk}</p>
        </section>
      ) : null}
      <div class="digest-page__stories">
        {[...groups.entries()].map(([category, group]) => (
          <section class="digest-section" key={category}>
            {groups.size > 1 ? <DigestSectionHeading category={category} summary={summaries.get(category)} /> : (
              <>
                <div class="section-heading"><h2>本期新聞</h2></div>
                {summaries.get(category) ? <p class="section-heading__summary">{summaries.get(category)}</p> : null}
              </>
            )}
            {group.map((story) => (
              <article class="digest-story" key={story.id}>
                <h3><a href={storyHref(story)}>{story.headline_zh_hk}</a></h3>
                <p class="digest-story__summary">{story.summary_zh_hk}</p>
                <footer class="digest-story__meta">
                  <span>{story.source_name}</span>
                  <time dateTime={story.source_published_at ?? story.published_at ?? undefined}>{formatDateTime(story.source_published_at ?? story.published_at)}</time>
                  <a class="text-link" href={safeHref(story.source_url)} target="_blank" rel="noopener noreferrer">閱讀原文 <span aria-hidden="true">↗</span></a>
                </footer>
              </article>
            ))}
          </section>
        ))}
      </div>
      {uniqueStories.length === 0 ? <EmptyState message="這一天沒有可顯示的已發布文章。" /> : null}
    </article>
  );
}
