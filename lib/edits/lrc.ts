export type ParsedLyricLine = { text: string; time: number | null };

const LRC_LINE_RE = /^\s*(\[\d{1,2}:\d{2}(?:\.\d{1,3})?\])+\s*(.*)$/;
const LRC_TAG_RE = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

// Detects whether pasted text is LRC-format (has at least one [mm:ss.xx] tag).
export function isLrc(raw: string): boolean {
  return raw.split("\n").some((line) => LRC_LINE_RE.test(line) && LRC_TAG_RE.test(line));
}

// Parses LRC text into timed lines. A line can carry multiple timestamp tags
// (repeats of the same lyric at different points in the song) — each becomes
// its own line, sorted by time.
export function parseLrc(raw: string): ParsedLyricLine[] {
  const lines: ParsedLyricLine[] = [];
  for (const rawLine of raw.split("\n")) {
    const match = rawLine.match(LRC_LINE_RE);
    if (!match) continue;
    const text = match[2].trim();
    const tags = [...rawLine.matchAll(LRC_TAG_RE)];
    if (tags.length === 0) continue;
    for (const tag of tags) {
      const min = parseInt(tag[1], 10);
      const sec = parseInt(tag[2], 10);
      const frac = tag[3] ? parseFloat(`0.${tag[3]}`) : 0;
      lines.push({ text, time: min * 60 + sec + frac });
    }
  }
  return lines.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
}

// Splits plain (non-LRC) pasted lyrics into untimed lines for tap-to-sync.
export function parsePlainLyrics(raw: string): ParsedLyricLine[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((text) => ({ text, time: null }));
}
