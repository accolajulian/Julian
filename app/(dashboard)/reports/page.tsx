"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  Phone,
  Calendar,
  Users,
  DollarSign,
  Download,
  Lock,
  ArrowRight,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";

// ─── Demo data ────────────────────────────────────────────────────────────────

const LEADS_OVER_TIME = Array.from({ length: 30 }, (_, i) => {
  const date = new Date(2026, 3, i + 7); // April 7 – May 6 2026
  return {
    date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    leads: Math.floor(Math.random() * 12 + 3),
  };
});

const CALL_OUTCOMES = [
  { name: "Interested", value: 87, color: "#00ff88" },
  { name: "Not Interested", value: 142, color: "#ef4444" },
  { name: "No Answer", value: 214, color: "#6b7280" },
  { name: "Voicemail", value: 98, color: "#4fc3f7" },
  { name: "Callback", value: 31, color: "#f59e0b" },
];

const BOOKINGS_PER_WEEK = [
  { week: "Mar 10", bookings: 4 },
  { week: "Mar 17", bookings: 7 },
  { week: "Mar 24", bookings: 5 },
  { week: "Mar 31", bookings: 9 },
  { week: "Apr 7", bookings: 11 },
  { week: "Apr 14", bookings: 8 },
  { week: "Apr 21", bookings: 13 },
  { week: "Apr 28", bookings: 10 },
];

const TOP_INDUSTRIES = [
  { industry: "HVAC", bookingRate: 68 },
  { industry: "Plumbing", bookingRate: 54 },
  { industry: "Roofing", bookingRate: 47 },
  { industry: "Electrical", bookingRate: 41 },
  { industry: "Landscaping", bookingRate: 35 },
];

const TOP_LOCATIONS = [
  { county: "Maricopa, AZ", leads: 143 },
  { county: "Harris, TX", leads: 117 },
  { county: "Clark, NV", leads: 89 },
  { county: "Tarrant, TX", leads: 74 },
  { county: "Pima, AZ", leads: 62 },
];

const KEY_METRICS = {
  leadsPulled: 572,
  callsMade: 487,
  contactRate: 36.2,
  bookingRate: 15.4,
  costPerBooking: 497 / 10, // $397 / bookings this month
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "#1a1d2e",
    border: "1px solid #2a2d3e",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "12px",
  },
  itemStyle: { color: "#fff" },
  labelStyle: { color: "#6b7280" },
};

// ─── Upgrade Wall ─────────────────────────────────────────────────────────────

const PLAN_FEATURES = [
  { plan: "Starter", price: "$197/mo", features: ["50 leads/month", "Basic dashboard", "1 target", "1 user seat"], available: false },
  { plan: "Growth", price: "$397/mo", features: ["150 leads/month", "Full analytics", "3 targets", "3 user seats", "Custom scripts"], available: true },
  { plan: "Pro", price: "$697/mo", features: ["Unlimited leads", "Full analytics", "Unlimited targets", "Unlimited seats", "API access"], available: true },
];

function UpgradeWall() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#00ff88]/10 border border-[#00ff88]/20 mb-4">
          <Lock className="w-7 h-7 text-[#00ff88]" />
        </div>
        <h1 className="text-2xl font-black text-white">Analytics — Growth &amp; Pro Only</h1>
        <p className="text-[#6b7280] mt-2 max-w-md mx-auto text-sm">
          Upgrade to unlock full analytics: charts, booking trends, call outcomes, and per-industry
          performance data.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-5">
        {PLAN_FEATURES.map((p) => (
          <div
            key={p.plan}
            className={cn(
              "relative bg-[#1a1d2e] border rounded-2xl p-5 flex flex-col",
              p.available ? "border-[#00ff88]/40" : "border-[#2a2d3e] opacity-70"
            )}
          >
            {p.available && (
              <span className="absolute -top-2.5 left-4 bg-[#00ff88] text-[#0f1117] text-xs font-black px-3 py-0.5 rounded-full">
                Unlocks Reports
              </span>
            )}
            <p className="font-bold text-white text-lg">{p.plan}</p>
            <p className="text-[#00ff88] font-semibold mt-0.5 mb-4">{p.price}</p>
            <ul className="space-y-1.5 flex-1 mb-5">
              {p.features.map((f) => (
                <li key={f} className="text-xs text-[#6b7280] flex items-center gap-2">
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      p.available ? "bg-[#00ff88]" : "bg-[#2a2d3e]"
                    )}
                  />
                  {f}
                </li>
              ))}
            </ul>
            {p.available ? (
              <a
                href="/settings?tab=billing"
                className="flex items-center justify-center gap-2 bg-[#00ff88] text-[#0f1117] font-bold text-sm py-2.5 rounded-xl hover:bg-[#00cc70] transition-colors"
              >
                Upgrade to {p.plan} <ArrowRight className="w-4 h-4" />
              </a>
            ) : (
              <div className="text-center text-xs text-[#6b7280] border border-[#2a2d3e] rounded-xl py-2.5">
                Current Plan
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  unit,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-4 flex flex-col gap-3">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: `${color}18`, border: `1px solid ${color}30` }}
      >
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-black text-white">
          {unit === "$" && <span className="text-lg text-[#6b7280]">$</span>}
          {value}
          {unit && unit !== "$" && <span className="text-sm text-[#6b7280] ml-0.5">{unit}</span>}
        </p>
        <p className="text-xs text-[#6b7280] mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ─── Chart Wrapper ────────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-5">{title}</h3>
      {children}
    </div>
  );
}

// ─── Date Range ───────────────────────────────────────────────────────────────

type Range = "7D" | "30D" | "90D" | "Custom";

function DateRangeSelector({
  selected,
  onSelect,
}: {
  selected: Range;
  onSelect: (r: Range) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["7D", "30D", "90D", "Custom"] as Range[]).map((r) => (
        <button
          key={r}
          onClick={() => onSelect(r)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
            selected === r
              ? "bg-[#00ff88] text-[#0f1117]"
              : "bg-[#1a1d2e] border border-[#2a2d3e] text-[#6b7280] hover:text-white hover:border-[#6b7280]"
          )}
        >
          {r}
        </button>
      ))}
      {selected === "Custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#00ff88]/50"
          />
          <span className="text-[#6b7280] text-xs">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#00ff88]/50"
          />
        </div>
      )}
    </div>
  );
}

// ─── Reports Page ─────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { org } = useOrg();
  const plan = org?.plan ?? "starter";
  const [range, setRange] = useState<Range>("30D");

  if (plan === "starter") {
    return <UpgradeWall />;
  }

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto print:p-0 print:max-w-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 print:mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">Reports &amp; Analytics</h1>
          <p className="text-sm text-[#6b7280] mt-1">Performance data for your LeadEmm campaigns.</p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangeSelector selected={range} onSelect={setRange} />
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 border border-[#2a2d3e] text-[#6b7280] hover:text-white hover:border-[#6b7280] px-4 py-2 rounded-xl text-sm transition-colors print:hidden"
          >
            <Download className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <MetricCard
          label="Leads Pulled"
          value={KEY_METRICS.leadsPulled}
          icon={Users}
          color="#4fc3f7"
        />
        <MetricCard
          label="Calls Made"
          value={KEY_METRICS.callsMade}
          icon={Phone}
          color="#00ff88"
        />
        <MetricCard
          label="Contact Rate"
          value={KEY_METRICS.contactRate}
          unit="%"
          icon={TrendingUp}
          color="#f59e0b"
        />
        <MetricCard
          label="Booking Rate"
          value={KEY_METRICS.bookingRate}
          unit="%"
          icon={Calendar}
          color="#00ff88"
        />
        <MetricCard
          label="Cost Per Booking"
          value={KEY_METRICS.costPerBooking.toFixed(0)}
          unit="$"
          icon={DollarSign}
          color="#a78bfa"
        />
      </div>

      {/* Charts grid */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Leads Over Time */}
        <ChartCard title="Leads Over Time (30 Days)">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={LEADS_OVER_TIME} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="date"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval={4}
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip {...CHART_TOOLTIP_STYLE} />
              <Line
                type="monotone"
                dataKey="leads"
                stroke="#00ff88"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#00ff88" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Call Outcomes Pie */}
        <ChartCard title="Call Outcomes">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={CALL_OUTCOMES}
                cx="45%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
              >
                {CALL_OUTCOMES.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                {...CHART_TOOLTIP_STYLE}
                formatter={(value) => [`${value} calls`, ""]}
              />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => (
                  <span style={{ color: "#6b7280", fontSize: "11px" }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Bookings Per Week */}
        <ChartCard title="Bookings Per Week (Last 8 Weeks)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={BOOKINGS_PER_WEEK}
              margin={{ top: 0, right: 10, left: -20, bottom: 0 }}
            >
              <XAxis
                dataKey="week"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip {...CHART_TOOLTIP_STYLE} />
              <Bar dataKey="bookings" fill="#00ff88" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Top Industries */}
        <ChartCard title="Top Industries by Booking Rate">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={TOP_INDUSTRIES}
              layout="vertical"
              margin={{ top: 0, right: 30, left: 10, bottom: 0 }}
            >
              <XAxis
                type="number"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                unit="%"
              />
              <YAxis
                type="category"
                dataKey="industry"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={80}
              />
              <Tooltip
                {...CHART_TOOLTIP_STYLE}
                formatter={(value) => [`${value}%`, "Booking Rate"]}
              />
              <Bar dataKey="bookingRate" fill="#4fc3f7" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Top Locations */}
      <ChartCard title="Top Locations by Leads Pulled">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={TOP_LOCATIONS}
            layout="vertical"
            margin={{ top: 0, right: 30, left: 10, bottom: 0 }}
          >
            <XAxis
              type="number"
              tick={{ fill: "#6b7280", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="county"
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={110}
            />
            <Tooltip
              {...CHART_TOOLTIP_STYLE}
              formatter={(value) => [`${value} leads`, "Leads Pulled"]}
            />
            <Bar dataKey="leads" fill="#a78bfa" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Print-only summary */}
      <div className="hidden print:block mt-8 text-xs text-gray-500">
        <p>
          LeadEmm — Analytics Report — Generated{" "}
          {new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>
    </div>
  );
}
