export function titleFingerprint(title: string): string {
  return title
    .normalize("NFKC")
    .toLocaleLowerCase("zh-HK")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
