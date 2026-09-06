import type { Category, StoryRecord } from "../db/types";

export function safeHref(value: string, fallback = "#"): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

export function formatDateTime(value: string | null): string {
  if (!value) return "日期未提供";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "日期未提供";
  return new Intl.DateTimeFormat("zh-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(date);
}

export function formatDigestDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("zh-HK", {
    dateStyle: "full",
    timeZone: "Asia/Hong_Kong",
  }).format(date);
}

export function storyFacts(story: StoryRecord): string[] {
  try {
    const facts = JSON.parse(story.key_facts_json) as unknown;
    return Array.isArray(facts) ? facts.filter((fact): fact is string => typeof fact === "string") : [];
  } catch {
    return [];
  }
}

export function storyEntities(story: StoryRecord): string[] {
  try {
    const entities = JSON.parse(story.named_entities_json) as unknown;
    return Array.isArray(entities) ? entities.filter((entity): entity is string => typeof entity === "string") : [];
  } catch {
    return [];
  }
}

export function storyHref(story: Pick<StoryRecord, "slug">): string {
  return `/story/${encodeURIComponent(story.slug)}`;
}

export function categoryHref(category: Category): string {
  return `/category/${encodeURIComponent(category)}`;
}

export function entityHref(entity: string): string {
  return `/tag/${encodeURIComponent(entity)}`;
}

export function StoryMeta({ story }: { story: StoryRecord }) {
  return (
    <div class="story-meta">
      <span class="story-meta__source">{story.source_name}</span>
      <span class="story-meta__category">{story.category}</span>
      <time dateTime={story.source_published_at ?? story.published_at ?? undefined}>
        {formatDateTime(story.source_published_at ?? story.published_at)}
      </time>
    </div>
  );
}

export function StoryTeaser({ story, featured = false }: { story: StoryRecord; featured?: boolean }) {
  return (
    <article class={featured ? "story-teaser story-teaser--featured" : "story-teaser"}>
      <StoryMeta story={story} />
      <h2><a href={storyHref(story)}>{story.headline_zh_hk}</a></h2>
      <p>{story.summary_zh_hk}</p>
      <a class="text-link" href={safeHref(story.source_url)} target="_blank" rel="noopener noreferrer">
        閱讀原文 <span aria-hidden="true">↗</span>
      </a>
    </article>
  );
}

export function DigestSectionHeading({ category, summary }: { category: Category; summary?: string }) {
  return (
    <div class="section-heading">
      <div>
        <p class="eyebrow">分類</p>
        <h2><a href={categoryHref(category)}>{category}</a></h2>
      </div>
      {summary ? <p class="section-heading__summary">{summary}</p> : null}
    </div>
  );
}

export function EntityTags({ entities }: { entities: string[] }) {
  if (entities.length === 0) return null;
  return (
    <ul class="entity-tags">
      {entities.map((entity) => (
        <li key={entity}>
          <a class="entity-tag" href={entityHref(entity)}>{entity}</a>
        </li>
      ))}
    </ul>
  );
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroBased = (month - 1) + delta;
  const shiftedYear = year + Math.floor(zeroBased / 12);
  const shiftedMonth = ((zeroBased % 12) + 12) % 12 + 1;
  return { year: shiftedYear, month: shiftedMonth };
}

export function DigestCalendar({
  year,
  month,
  availableDates,
  selectedDate,
}: {
  year: number;
  month: number;
  availableDates: Set<string>;
  selectedDate: string;
}) {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  const cells: Array<{ day: number; date: string } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, date: `${year}-${pad2(month)}-${pad2(day)}` });
  }

  return (
    <aside class="digest-calendar" aria-label="每日摘要日曆">
      <div class="digest-calendar__header">
        <a class="digest-calendar__nav" href={`?calendarMonth=${prev.year}-${pad2(prev.month)}`} aria-label="上一個月">‹</a>
        <p class="digest-calendar__title">{year}年{month}月</p>
        <a class="digest-calendar__nav" href={`?calendarMonth=${next.year}-${pad2(next.month)}`} aria-label="下一個月">›</a>
      </div>
      <div class="digest-calendar__weekdays">
        {WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}
      </div>
      <div class="digest-calendar__grid">
        {cells.map((cell, index) => {
          if (cell === null) return <span class="digest-calendar__cell digest-calendar__cell--empty" key={`empty-${index}`} />;
          if (!availableDates.has(cell.date)) {
            return <span class="digest-calendar__cell" key={cell.date}>{cell.day}</span>;
          }
          return (
            <a
              class={cell.date === selectedDate ? "digest-calendar__cell is-selected" : "digest-calendar__cell"}
              href={`/digest/${cell.date}`}
              key={cell.date}
            >
              {cell.day}
            </a>
          );
        })}
      </div>
    </aside>
  );
}

export function AiDisclosure() {
  return <p class="ai-disclosure">內容由 AI 整理，原文請以來源為準。</p>;
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div class="empty-state">
      <p class="eyebrow">暫時沒有內容</p>
      <p>{message}</p>
    </div>
  );
}
