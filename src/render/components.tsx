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
