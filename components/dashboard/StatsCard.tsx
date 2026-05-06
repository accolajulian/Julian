import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Sparkline ────────────────────────────────────────────────────────────────

interface SparklineProps {
  data: number[];
  color: string;
}

function Sparkline({ data, color }: SparklineProps) {
  if (!data.length) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const W = 80;
  const H = 28;
  const step = W / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * step;
    const y = H - ((v - min) / range) * H;
    return `${x},${y}`;
  });

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      fill="none"
      className="opacity-70"
    >
      <polyline
        points={points.join(" ")}
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface StatsCardProps {
  title: string;
  value: string | number;
  change: number;
  changeLabel?: string;
  icon: React.ElementType;
  color: "blue" | "green" | "purple" | "gold";
  sparklineData?: number[];
}

// ─── Color maps ───────────────────────────────────────────────────────────────

const colorMap = {
  blue: {
    bg: "bg-[rgba(79,195,247,0.12)]",
    text: "text-[#4fc3f7]",
    glow: "shadow-[0_0_12px_rgba(79,195,247,0.15)]",
    sparkline: "#4fc3f7",
  },
  green: {
    bg: "bg-[rgba(0,255,136,0.12)]",
    text: "text-[#00ff88]",
    glow: "shadow-[0_0_12px_rgba(0,255,136,0.15)]",
    sparkline: "#00ff88",
  },
  purple: {
    bg: "bg-[rgba(167,139,250,0.12)]",
    text: "text-purple-400",
    glow: "shadow-[0_0_12px_rgba(167,139,250,0.15)]",
    sparkline: "#a78bfa",
  },
  gold: {
    bg: "bg-[rgba(251,191,36,0.12)]",
    text: "text-yellow-400",
    glow: "shadow-[0_0_12px_rgba(251,191,36,0.15)]",
    sparkline: "#fbbf24",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function StatsCard({
  title,
  value,
  change,
  changeLabel = "vs yesterday",
  icon: Icon,
  color,
  sparklineData,
}: StatsCardProps) {
  const c = colorMap[color];
  const isPositive = change >= 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-[#2a2d3e] bg-[#1a1d2e] p-5 flex flex-col gap-3 transition-all duration-200 hover:border-[#3a3d4e] hover:bg-[#1f2340]",
        c.glow
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0", c.bg)}>
          <Icon className={cn("h-4 w-4", c.text)} />
        </div>
        {sparklineData && sparklineData.length > 1 && (
          <Sparkline data={sparklineData} color={c.sparkline} />
        )}
      </div>

      {/* Value */}
      <div>
        <p className="text-2xl font-bold text-white tabular-nums leading-none">
          {value}
        </p>
        <p className="text-xs text-[#6b7280] mt-1">{title}</p>
      </div>

      {/* Change indicator */}
      <div className="flex items-center gap-1">
        {isPositive ? (
          <TrendingUp className="h-3 w-3 text-[#00ff88]" />
        ) : (
          <TrendingDown className="h-3 w-3 text-red-400" />
        )}
        <span
          className={cn(
            "text-[11px] font-semibold",
            isPositive ? "text-[#00ff88]" : "text-red-400"
          )}
        >
          {isPositive ? "+" : ""}
          {change}%
        </span>
        <span className="text-[11px] text-[#6b7280]">{changeLabel}</span>
      </div>
    </div>
  );
}
