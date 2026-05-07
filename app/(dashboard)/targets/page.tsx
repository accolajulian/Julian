"use client";

import { useState } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  Zap,
  Droplets,
  Wrench,
  Car,
  Bolt,
  Home,
  Bug,
  Sparkles,
  Layers,
  Fence,
  AlertTriangle,
  X,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanType } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  "HVAC",
  "Landscaping",
  "Plumbing",
  "Auto Repair",
  "Electrician",
  "Roofing",
  "Pest Control",
  "Cleaning",
  "Concrete",
  "Fencing",
] as const;

type Industry = (typeof INDUSTRIES)[number];

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
];

const PLAN_LIMITS: Record<PlanType, number | null> = {
  starter: 1,
  growth: 3,
  pro: null,
};

function industryIcon(industry: Industry) {
  const cls = "w-5 h-5";
  switch (industry) {
    case "HVAC": return <Zap className={cls} />;
    case "Landscaping": return <Sparkles className={cls} />;
    case "Plumbing": return <Droplets className={cls} />;
    case "Auto Repair": return <Car className={cls} />;
    case "Electrician": return <Bolt className={cls} />;
    case "Roofing": return <Home className={cls} />;
    case "Pest Control": return <Bug className={cls} />;
    case "Cleaning": return <Sparkles className={cls} />;
    case "Concrete": return <Layers className={cls} />;
    case "Fencing": return <Fence className={cls} />;
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TargetItem {
  id: string;
  industry: Industry;
  county: string;
  state: string;
  isActive: boolean;
  leadsCount: number;
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_TARGETS: TargetItem[] = [
  { id: "t1", industry: "HVAC", county: "Mecklenburg County", state: "North Carolina", isActive: true, leadsCount: 84 },
  { id: "t2", industry: "Plumbing", county: "Hillsborough County", state: "Florida", isActive: true, leadsCount: 112 },
];

// ─── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteModal({
  target,
  onDelete,
  onClose,
}: {
  target: TargetItem;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  async function handleConfirm() {
    setLoading(true);
    await fetch(`/api/targets/${target.id}`, { method: "DELETE" }).catch(() => {});
    onDelete(target.id);
    setLoading(false);
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Delete Target</h3>
            <p className="text-xs text-[#6b7280]">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-[#9ca3af] mb-6">
          Delete <span className="font-semibold text-white">{target.industry} in {target.county}, {target.state}</span>? All associated lead pulling will stop.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-[#2a2d3e] text-sm text-[#9ca3af] hover:text-white transition-colors">
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={loading} className="flex-1 py-2.5 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-sm font-semibold transition-colors disabled:opacity-60">
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Target card ──────────────────────────────────────────────────────────────

function TargetCard({
  target,
  onToggle,
  onEdit,
  onDeleteRequest,
}: {
  target: TargetItem;
  onToggle: (id: string) => void;
  onEdit: (t: TargetItem) => void;
  onDeleteRequest: (t: TargetItem) => void;
}) {
  return (
    <div className={cn(
      "flex items-center gap-4 p-4 rounded-xl border transition-all",
      target.isActive
        ? "bg-[#1a1d2e] border-[#2a2d3e] hover:border-[#00ff88]/30"
        : "bg-[#0f1117] border-[#2a2d3e] opacity-60"
    )}>
      {/* Icon */}
      <div className={cn(
        "flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center",
        target.isActive ? "bg-[#00ff88]/10 text-[#00ff88]" : "bg-[#2a2d3e] text-[#6b7280]"
      )}>
        {industryIcon(target.industry)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">
          {target.industry} in {target.county}, {target.state}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[#4fc3f7]/10 text-[#4fc3f7] border border-[#4fc3f7]/20">
            {target.leadsCount} leads
          </span>
          {target.isActive ? (
            <span className="flex items-center gap-1 text-xs text-[#00ff88]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
              Active
            </span>
          ) : (
            <span className="text-xs text-[#6b7280]">Paused</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Toggle switch */}
        <button
          onClick={() => onToggle(target.id)}
          className={cn(
            "relative w-10 h-5.5 rounded-full transition-colors focus:outline-none",
            target.isActive ? "bg-[#00ff88]" : "bg-[#2a2d3e]"
          )}
          role="switch"
          aria-checked={target.isActive}
          title={target.isActive ? "Pause target" : "Activate target"}
        >
          <span className={cn(
            "absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform",
            target.isActive ? "translate-x-5" : "translate-x-0.5"
          )} />
        </button>

        <button
          onClick={() => onEdit(target)}
          className="p-1.5 rounded-lg hover:bg-[#2a2d3e] text-[#6b7280] hover:text-white transition-colors"
          title="Edit"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDeleteRequest(target)}
          className="p-1.5 rounded-lg hover:bg-red-500/10 text-[#6b7280] hover:text-red-400 transition-colors"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Add / edit form ──────────────────────────────────────────────────────────

interface TargetFormValues {
  industry: Industry;
  county: string;
  state: string;
}

function TargetForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: TargetFormValues;
  onSubmit: (values: TargetFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [industry, setIndustry] = useState<Industry>(initial?.industry ?? "HVAC");
  const [county, setCounty] = useState(initial?.county ?? "");
  const [state, setState] = useState(initial?.state ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!county.trim()) { setError("County is required."); return; }
    if (!state) { setError("State is required."); return; }
    setLoading(true);
    await onSubmit({ industry, county: county.trim(), state });
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-[#9ca3af] mb-1.5">Industry</label>
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value as Industry)}
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#00ff88]"
        >
          {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-[#9ca3af] mb-1.5">County</label>
        <input
          type="text"
          value={county}
          onChange={(e) => setCounty(e.target.value)}
          placeholder="e.g. Mecklenburg County"
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#00ff88]"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[#9ca3af] mb-1.5">State</label>
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#00ff88]"
        >
          <option value="">Select a state…</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-3 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-[#2a2d3e] text-sm text-[#9ca3af] hover:text-white transition-colors">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2.5 rounded-lg bg-[#00ff88] text-[#0f1117] text-sm font-semibold hover:bg-[#00ff88]/90 transition-colors disabled:opacity-60"
        >
          {loading ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditModal({
  target,
  onSave,
  onClose,
}: {
  target: TargetItem;
  onSave: (id: string, values: TargetFormValues) => void;
  onClose: () => void;
}) {
  async function handleSubmit(values: TargetFormValues) {
    await fetch(`/api/targets/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }).catch(() => {});
    onSave(target.id, values);
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-white">Edit Target</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#2a2d3e] text-[#6b7280]"><X className="w-4 h-4" /></button>
        </div>
        <TargetForm initial={target} onSubmit={handleSubmit} onCancel={onClose} submitLabel="Save Changes" />
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function TargetsPage() {
  // Demo plan — in production pull from OrgContext
  const plan = "growth" as PlanType;
  const limit = PLAN_LIMITS[plan];

  const [targets, setTargets] = useState<TargetItem[]>(DEMO_TARGETS);
  const [editTarget, setEditTarget] = useState<TargetItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TargetItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const atLimit = limit !== null && targets.length >= limit;

  function handleToggle(id: string) {
    setTargets((prev) => prev.map((t) => t.id === id ? { ...t, isActive: !t.isActive } : t));
  }

  function handleDelete(id: string) {
    setTargets((prev) => prev.filter((t) => t.id !== id));
  }

  function handleEditSave(id: string, values: TargetFormValues) {
    setTargets((prev) => prev.map((t) => t.id === id ? { ...t, ...values } : t));
    showSuccess("Target updated.");
  }

  async function handleAddTarget(values: TargetFormValues) {
    const newTarget: TargetItem = {
      id: `t${Date.now()}`,
      ...values,
      isActive: true,
      leadsCount: 0,
    };
    await fetch("/api/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }).catch(() => {});
    setTargets((prev) => [...prev, newTarget]);
    setShowForm(false);
    showSuccess("Target added! LeadEmm will start pulling leads shortly.");
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 4000);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Targets</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            {limit !== null
              ? `${targets.length} / ${limit} targets used — ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan`
              : `${targets.length} targets — Pro (unlimited)`}
          </p>
        </div>
        {!atLimit && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#00ff88] text-[#0f1117] font-semibold text-sm hover:bg-[#00ff88]/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Target
          </button>
        )}
      </div>

      {/* Success toast */}
      {successMsg && (
        <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88] text-sm">
          <CheckCircle className="w-4 h-4 flex-shrink-0" /> {successMsg}
        </div>
      )}

      {/* Plan limit banner */}
      {atLimit && (
        <div className="flex items-start gap-3 mb-6 px-4 py-4 rounded-xl bg-[#fbbf24]/10 border border-[#fbbf24]/30">
          <AlertTriangle className="w-5 h-5 text-[#fbbf24] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[#fbbf24]">
              You've reached your target limit.
            </p>
            <p className="text-xs text-[#9ca3af] mt-0.5">
              {plan === "starter"
                ? "Starter plan allows 1 target. Upgrade to Growth (3 targets) or Pro (unlimited)."
                : "Growth plan allows 3 targets. Upgrade to Pro for unlimited targets."}
            </p>
            <a
              href="/settings/billing"
              className="inline-block mt-2 text-xs font-semibold text-[#fbbf24] hover:text-white underline transition-colors"
            >
              Upgrade to add more →
            </a>
          </div>
        </div>
      )}

      {/* Add form (inline) */}
      {showForm && (
        <div className="mb-6 p-5 rounded-xl bg-[#1a1d2e] border border-[#00ff88]/30">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white">New Target</h2>
            <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-[#2a2d3e] text-[#6b7280]">
              <X className="w-4 h-4" />
            </button>
          </div>
          <TargetForm onSubmit={handleAddTarget} onCancel={() => setShowForm(false)} submitLabel="Add Target" />
        </div>
      )}

      {/* Targets list */}
      {targets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 rounded-xl border border-dashed border-[#2a2d3e]">
          <div className="w-14 h-14 rounded-2xl bg-[#1a1d2e] border border-[#2a2d3e] flex items-center justify-center">
            <Zap className="w-7 h-7 text-[#00ff88] opacity-60" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-white">No targets yet.</p>
            <p className="text-sm text-[#6b7280] mt-1">Add your first target to start pulling leads.</p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#00ff88] text-[#0f1117] font-semibold text-sm"
            >
              <Plus className="w-4 h-4" /> Add First Target
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {targets.map((t) => (
            <TargetCard
              key={t.id}
              target={t}
              onToggle={handleToggle}
              onEdit={setEditTarget}
              onDeleteRequest={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {editTarget && (
        <EditModal target={editTarget} onSave={handleEditSave} onClose={() => setEditTarget(null)} />
      )}
      {deleteTarget && (
        <DeleteModal target={deleteTarget} onDelete={handleDelete} onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
