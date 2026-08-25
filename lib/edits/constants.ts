export const EDITS_PALETTE = [
  { name: "amber", hex: "#F2A70B" },
  { name: "coral", hex: "#F2540B" },
  { name: "rose", hex: "#E8406B" },
  { name: "violet", hex: "#8B5CF6" },
  { name: "sky", hex: "#3FA9F5" },
  { name: "teal", hex: "#2DD4BF" },
  { name: "lime", hex: "#A3D633" },
  { name: "slate", hex: "#94A3B8" },
];

export const EDITS_BG = "#141318";
export const EDITS_SURFACE = "#1D1C23";
export const EDITS_SURFACE2 = "#26242C";
export const EDITS_LINE = "#332F3B";
export const EDITS_TEXT = "#EDEAE3";
export const EDITS_MUTED = "#9A95A3";
export const EDITS_ACCENT = "#F2540B";
export const EDITS_ACCENT2 = "#2DD4BF";
export const EDITS_WARN = "#EF4444";
export const EDITS_SHOT = "#4B5563";

export function fmt(t: number) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export function fmtBig(t: number) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(t % 60)
    .toString()
    .padStart(2, "0");
  const cs = Math.floor((t % 1) * 100)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}.${cs}`;
}

export function relTime(ts: string | number | null | undefined) {
  if (!ts) return "";
  const time = typeof ts === "string" ? new Date(ts).getTime() : ts;
  const diff = Date.now() - time;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
