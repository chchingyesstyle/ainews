import type { DigestRecord, StoryRecord } from "../../db/types";
import { AiDisclosure, DigestCalendar, DigestSectionHeading, EmptyState, StoryTeaser, formatDigestDate } from "../components";

export function DigestPage({
  digest,
  stories,
  calendarYear,
  calendarMonth,
  availableDates,
}: {
  digest: DigestRecord;
  stories: StoryRecord[];
  calendarYear: number;
  calendarMonth: number;
  availableDates: Set<string>;
}) {
  let sections: Array<{ category: DigestRecord["status"] extends never ? never : string; summaryZhHk?: string; storyIds?: number[] }> = [];
  try {
    const parsed = JSON.parse(digest.sections_json) as unknown;
    if (Array.isArray(parsed)) sections = parsed as typeof sections;
  } catch {
    sections = [];
  }
  const byId = new Map(stories.map((story) => [story.id, story]));

  return (
    <article class="digest-page section-wrap">
      <header class="page-header">
        <p class="eyebrow">每日摘要 · {formatDigestDate(digest.digest_date)}</p>
        <h1>{digest.headline_zh_hk}</h1>
        <p class="page-header__lede">{digest.intro_zh_hk}</p>
        <AiDisclosure />
      </header>
      <DigestCalendar year={calendarYear} month={calendarMonth} availableDates={availableDates} selectedDate={digest.digest_date} />
      {sections.length > 0 ? sections.map((section) => {
        const sectionStories = (section.storyIds ?? []).flatMap((id) => {
          const story = byId.get(id);
          return story ? [story] : [];
        });
        return (
          <section class="digest-section" key={section.category}>
            <DigestSectionHeading category={section.category as StoryRecord["category"]} summary={section.summaryZhHk} />
            {sectionStories.map((story) => <StoryTeaser story={story} key={story.id} />)}
          </section>
        );
      }) : stories.map((story) => <StoryTeaser story={story} key={story.id} />)}
      {stories.length === 0 ? <EmptyState message="這一天沒有可顯示的已發布文章。" /> : null}
    </article>
  );
}
