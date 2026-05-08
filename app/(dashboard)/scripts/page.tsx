"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Lock,
  Zap,
  Save,
  RotateCcw,
  Eye,
  CheckCircle,
  X,
  FlaskConical,
  Phone,
  Calendar,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScriptVariantStats } from "@/app/api/scripts/[targetId]/stats/route";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TargetScript {
  id: string;
  industry: string | null;
  location_county: string | null;
  location_state: string | null;
  active: boolean;
  script_a: string | null;
  script_b: string | null;
}

// ─── Upgrade walls ────────────────────────────────────────────────────────────

function UpgradeWall({ forAB = false }: { forAB?: boolean }) {
  if (forAB) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
        <div className="w-12 h-12 rounded-xl bg-[#c8f547]/10 border border-[#c8f547]/30 flex items-center justify-center">
          <FlaskConical className="w-6 h-6 text-[#c8f547]" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white mb-1">A/B Testing is a Pro Feature</h3>
          <p className="text-sm text-[#9ca3af]">
            Run two script variants simultaneously and let data decide which converts better.
          </p>
        </div>
        <a
          href="/settings/billing"
          className="px-5 py-2.5 rounded-xl bg-[#c8f547] text-[#0f1117] font-bold text-sm hover:bg-[#c8f547]/90 transition-colors"
        >
          Upgrade to Pro →
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-32 gap-6 max-w-md mx-auto text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#fbbf24]/10 border border-[#fbbf24]/30 flex items-center justify-center">
        <Lock className="w-8 h-8 text-[#fbbf24]" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Script Editor is a Growth+ Feature</h2>
        <p className="text-sm text-[#9ca3af] leading-relaxed">
          Customize your AI call scripts per target to maximize bookings. Available on Growth and Pro plans.
        </p>
      </div>
      <div className="w-full rounded-xl border border-[#fbbf24]/20 bg-[#fbbf24]/5 p-4 text-left space-y-2">
        {[
          "Custom scripts per target",
          "Live preview with example values",
          "A/B script testing (Pro)",
          "Performance stats per variant",
        ].map((f) => (
          <div key={f} className="flex items-center gap-2 text-sm text-[#d1d5db]">
            <CheckCircle className="w-4 h-4 text-[#fbbf24] flex-shrink-0" /> {f}
          </div>
        ))}
      </div>
      <a
        href="/settings/billing"
        className="px-6 py-3 rounded-xl bg-[#fbbf24] text-[#0f1117] font-bold text-sm hover:bg-[#fbbf24]/90 transition-colors"
      >
        Upgrade to Growth →
      </a>
    </div>
  );
}

// ─── Reset modal ──────────────────────────────────────────────────────────────

function ResetModal({
  onConfirm,
  onClose,
}: {
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-[#fbbf24]/20 flex items-center justify-center">
            <RotateCcw className="w-5 h-5 text-[#fbbf24]" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Clear Script</h3>
            <p className="text-xs text-[#6b7280]">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-[#9ca3af] mb-6">
          This will clear the current script variant. Are you sure?
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-[#2a2d3e] text-sm text-[#9ca3af] hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className="flex-1 py-2.5 rounded-lg bg-[#fbbf24]/80 hover:bg-[#fbbf24] text-[#0f1117] text-sm font-semibold transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── A/B Stats panel ──────────────────────────────────────────────────────────

function ABStatsPanel({ targetId }: { targetId: string }) {
  const [stats, setStats] = useState<{ a: ScriptVariantStats; b: ScriptVariantStats } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/scripts/${targetId}/stats`)
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [targetId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-[#6b7280] animate-spin" />
      </div>
    );
  }

  if (!stats || (stats.a.calls === 0 && stats.b.calls === 0)) {
    return (
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d2e] p-5 text-center">
        <FlaskConical className="w-8 h-8 text-[#6b7280] mx-auto mb-2" />
        <p className="text-sm text-[#6b7280]">No calls tracked yet. Results will appear once calls complete.</p>
      </div>
    );
  }

  const winner = (stats.a.interest_rate > stats.b.interest_rate) ? "a"
    : (stats.b.interest_rate > stats.a.interest_rate) ? "b"
    : null;

  function StatRow({ label, a, b, format = (n: number) => String(n) }: {
    label: string;
    a: number;
    b: number;
    format?: (n: number) => string;
  }) {
    const betterA = a > b;
    const betterB = b > a;
    return (
      <div className="grid grid-cols-3 items-center py-2.5 border-b border-[#2a2d3e] last:border-0">
        <span className="text-xs text-[#6b7280]">{label}</span>
        <span className={cn("text-sm font-semibold text-center", betterA ? "text-[#00ff88]" : "text-white")}>
          {format(a)}
        </span>
        <span className={cn("text-sm font-semibold text-center", betterB ? "text-[#00ff88]" : "text-white")}>
          {format(b)}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d2e] overflow-hidden">
      <div className="grid grid-cols-3 px-4 py-3 bg-[#0f1117] border-b border-[#2a2d3e]">
        <span className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider">Metric</span>
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-xs font-bold text-white">Variant A</span>
          {winner === "a" && <span className="text-[10px] font-bold text-[#00ff88] bg-[#00ff88]/10 px-1.5 py-0.5 rounded-full">Winner</span>}
        </div>
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-xs font-bold text-[#c8f547]">Variant B</span>
          {winner === "b" && <span className="text-[10px] font-bold text-[#00ff88] bg-[#00ff88]/10 px-1.5 py-0.5 rounded-full">Winner</span>}
        </div>
      </div>
      <div className="px-4 divide-y divide-[#2a2d3e]">
        <StatRow label="Total Calls" a={stats.a.calls} b={stats.b.calls} />
        <StatRow label="Interest Rate" a={stats.a.interest_rate} b={stats.b.interest_rate} format={(n) => `${n}%`} />
        <StatRow label="Booking Rate" a={stats.a.booking_rate} b={stats.b.booking_rate} format={(n) => `${n}%`} />
        <StatRow
          label="Avg Call Duration"
          a={stats.a.avg_duration_seconds}
          b={stats.b.avg_duration_seconds}
          format={(n) => `${Math.floor(n / 60)}m ${n % 60}s`}
        />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ScriptsPage() {
  const [plan, setPlan] = useState<string>("starter");
  const [targets, setTargets] = useState<TargetScript[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const [activeVariant, setActiveVariant] = useState<"a" | "b">("a");
  const [edits, setEdits] = useState<Record<string, { a: string; b: string }>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    fetch("/api/scripts")
      .then((r) => r.json())
      .then((d) => {
        setPlan(d.plan ?? "starter");
        const list: TargetScript[] = d.targets ?? [];
        setTargets(list);
        if (list.length > 0) setActiveTargetId(list[0].id);
        const initEdits: Record<string, { a: string; b: string }> = {};
        for (const t of list) {
          initEdits[t.id] = { a: t.script_a ?? "", b: t.script_b ?? "" };
        }
        setEdits(initEdits);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeTarget = targets.find((t) => t.id === activeTargetId) ?? null;
  const currentEdit = activeTargetId ? (edits[activeTargetId] ?? { a: "", b: "" }) : { a: "", b: "" };
  const currentText = activeVariant === "a" ? currentEdit.a : currentEdit.b;
  const isDirty = activeTargetId ? dirty.has(activeTargetId) : false;
  const isSaved = activeTargetId ? (saved.has(activeTargetId) && !isDirty) : false;

  function handleChange(value: string) {
    if (!activeTargetId) return;
    setEdits((prev) => ({
      ...prev,
      [activeTargetId]: { ...prev[activeTargetId], [activeVariant]: value },
    }));
    setDirty((prev) => new Set(prev).add(activeTargetId));
    setSaved((prev) => { const n = new Set(prev); n.delete(activeTargetId); return n; });
  }

  async function handleSave() {
    if (!activeTargetId || !isDirty) return;
    setSaving(true);
    try {
      const payload: Record<string, string | null> = { script_a: currentEdit.a };
      if (plan === "pro") payload.script_b = currentEdit.b || null;

      await fetch(`/api/scripts/${activeTargetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setDirty((prev) => { const n = new Set(prev); n.delete(activeTargetId); return n; });
      setSaved((prev) => new Set(prev).add(activeTargetId));
    } catch {
      // non-fatal — user can retry
    } finally {
      setSaving(false);
    }
  }

  const handleReset = useCallback(() => {
    if (!activeTargetId) return;
    const original = targets.find((t) => t.id === activeTargetId);
    if (!original) return;
    setEdits((prev) => ({
      ...prev,
      [activeTargetId]: { a: original.script_a ?? "", b: original.script_b ?? "" },
    }));
    setDirty((prev) => { const n = new Set(prev); n.delete(activeTargetId); return n; });
    setSaved((prev) => { const n = new Set(prev); n.delete(activeTargetId); return n; });
  }, [activeTargetId, targets]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-[#6b7280] animate-spin" />
      </div>
    );
  }

  if (plan === "starter") return <UpgradeWall />;

  const isPro = plan === "pro";

  const targetLabel = (t: TargetScript) => {
    const loc = [t.location_county, t.location_state].filter(Boolean).join(", ");
    return t.industry ? (loc ? `${t.industry} · ${loc}` : t.industry) : t.id;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[#2a2d3e]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Call Scripts</h1>
            <p className="text-sm text-[#6b7280] mt-0.5">
              Customize the script your AI uses when calling leads.
              {isPro && " A/B testing is active — Atlas randomizes variants 50/50."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isPro && (
              <button
                onClick={() => setShowStats((s) => !s)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                  showStats
                    ? "border-[#c8f547]/30 text-[#c8f547] bg-[#c8f547]/10"
                    : "border-[#2a2d3e] text-[#6b7280] hover:text-white"
                )}
              >
                <TrendingUp className="w-4 h-4" /> {showStats ? "Hide Stats" : "A/B Stats"}
              </button>
            )}
            <button
              onClick={() => setShowPreview((p) => !p)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                showPreview
                  ? "border-[#4fc3f7]/30 text-[#4fc3f7] bg-[#4fc3f7]/10"
                  : "border-[#2a2d3e] text-[#6b7280] hover:text-white"
              )}
            >
              <Eye className="w-4 h-4" /> {showPreview ? "Hide" : "Show"} Preview
            </button>
            <button
              onClick={() => setResetFor(activeTargetId)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2a2d3e] text-sm text-[#6b7280] hover:text-white transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Revert
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                isSaved
                  ? "bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30 cursor-default"
                  : isDirty
                  ? "bg-[#c8f547] text-[#0f1117] hover:bg-[#c8f547]/90"
                  : "bg-[#1a1d2e] border border-[#2a2d3e] text-[#6b7280] cursor-not-allowed"
              )}
            >
              {isSaved ? (
                <><CheckCircle className="w-4 h-4" /> Saved</>
              ) : (
                <><Save className="w-4 h-4" /> {saving ? "Saving…" : "Save Script"}</>
              )}
            </button>
          </div>
        </div>

        {/* Target tabs */}
        <div className="flex gap-1 mt-4 border-b border-[#2a2d3e] -mb-[1px] overflow-x-auto">
          {targets.map((t) => {
            const isActive = activeTargetId === t.id;
            const hasDirty = dirty.has(t.id);
            return (
              <button
                key={t.id}
                onClick={() => { setActiveTargetId(t.id); setActiveVariant("a"); setShowStats(false); }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px whitespace-nowrap flex-shrink-0",
                  isActive
                    ? "border-[#00ff88] text-white"
                    : "border-transparent text-[#6b7280] hover:text-[#9ca3af]"
                )}
              >
                <Zap className="w-3.5 h-3.5" />
                {targetLabel(t)}
                {hasDirty && <span className="w-1.5 h-1.5 rounded-full bg-[#fbbf24]" />}
              </button>
            );
          })}
          {targets.length === 0 && (
            <span className="px-4 py-2.5 text-sm text-[#6b7280]">No targets yet — create one in Targets</span>
          )}
        </div>
      </div>

      {/* A/B Stats panel */}
      {showStats && activeTargetId && isPro && (
        <div className="px-6 py-4 border-b border-[#2a2d3e] bg-[#0f1117]">
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical className="w-4 h-4 text-[#c8f547]" />
            <span className="text-sm font-semibold text-white">A/B Performance</span>
            <span className="text-xs text-[#6b7280]">— last 90 days · {targetLabel(activeTarget!)}</span>
          </div>
          <ABStatsPanel targetId={activeTargetId} />
        </div>
      )}

      {/* Variant tabs (Pro only) */}
      {isPro && activeTargetId && (
        <div className="flex gap-0 px-6 pt-3 border-b border-[#2a2d3e]">
          {(["a", "b"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setActiveVariant(v)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-all -mb-px",
                activeVariant === v
                  ? v === "a"
                    ? "border-[#00ff88] text-white"
                    : "border-[#c8f547] text-[#c8f547]"
                  : "border-transparent text-[#6b7280] hover:text-[#9ca3af]"
              )}
            >
              {v === "b" && <FlaskConical className="w-3.5 h-3.5" />}
              Variant {v.toUpperCase()}
              {v === "b" && !currentEdit.b && (
                <span className="text-[10px] bg-[#c8f547]/10 text-[#c8f547] px-1.5 py-0.5 rounded-full ml-1">empty</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Editor */}
      {!activeTargetId ? (
        <div className="flex-1 flex items-center justify-center text-sm text-[#6b7280]">
          Select a target to edit its script.
        </div>
      ) : isPro && activeVariant === "b" && !currentEdit.b && !dirty.has(activeTargetId) ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <UpgradeWall forAB={false} />
          <div className="w-full max-w-xl">
            <p className="text-xs text-[#6b7280] text-center mb-3">
              Variant B is empty. Start typing below to activate A/B testing — Atlas will serve both variants randomly once you save.
            </p>
            <textarea
              value={currentText}
              onChange={(e) => handleChange(e.target.value)}
              className="w-full h-48 bg-[#0f1117] border border-[#2a2d3e] rounded-xl text-sm text-[#d1d5db] p-4 resize-none focus:outline-none focus:border-[#c8f547]/50 font-mono leading-relaxed"
              placeholder="Write your Variant B script here…"
              spellCheck={false}
            />
          </div>
        </div>
      ) : (
        <div className={cn("flex-1 overflow-hidden", showPreview ? "grid grid-cols-2" : "")}>
          {/* Editor pane */}
          <div className="flex flex-col h-full overflow-hidden border-r border-[#2a2d3e]">
            <div className="flex items-center justify-between px-4 py-2 bg-[#1a1d2e] border-b border-[#2a2d3e]">
              <span className="text-xs font-medium text-[#6b7280]">
                {targetLabel(activeTarget!)} — Variant {activeVariant.toUpperCase()}
                {isPro && activeVariant === "b" && (
                  <span className="ml-2 text-[10px] text-[#c8f547] bg-[#c8f547]/10 px-1.5 py-0.5 rounded-full">A/B Active</span>
                )}
              </span>
              <span className="text-xs text-[#6b7280]">
                {currentText.length} chars · [BUSINESS_NAME] [OWNER_NAME]
              </span>
            </div>
            <textarea
              value={currentText}
              onChange={(e) => handleChange(e.target.value)}
              className="flex-1 w-full bg-[#0f1117] text-sm text-[#d1d5db] p-5 resize-none focus:outline-none font-mono leading-relaxed"
              placeholder={`Write your Variant ${activeVariant.toUpperCase()} script here…`}
              spellCheck={false}
            />
          </div>

          {/* Preview pane */}
          {showPreview && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 bg-[#1a1d2e] border-b border-[#2a2d3e]">
                <Eye className="w-3.5 h-3.5 text-[#4fc3f7]" />
                <span className="text-xs font-medium text-[#4fc3f7]">Live Preview</span>
                <span className="text-xs text-[#6b7280]">— Sunrise Plumbing / Mike Torres</span>
              </div>
              <div className="flex-1 overflow-y-auto p-5 bg-[#0f1117]">
                <pre className="text-sm text-[#d1d5db] whitespace-pre-wrap font-sans leading-relaxed">
                  {currentText
                    .replace(/\[BUSINESS_NAME\]/g, "Sunrise Plumbing")
                    .replace(/\[OWNER_NAME\]/g, "Mike Torres")
                    .replace(/\[AI_NAME\]/g, "Alex")}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reset modal */}
      {resetFor && (
        <ResetModal
          onConfirm={handleReset}
          onClose={() => setResetFor(null)}
        />
      )}
    </div>
  );
}
