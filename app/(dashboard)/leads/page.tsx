"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  Search,
  Filter,
  Download,
  Phone,
  ChevronLeft,
  ChevronRight,
  X,
  ChevronDown,
  ChevronUp,
  PhoneCall,
  Clock,
  FileText,
  Building2,
  User,
  Mail,
  MapPin,
  Tag,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lead, LeadStatus, Call } from "@/lib/types";

// ─── Demo data ────────────────────────────────────────────────────────────────

interface DemoLead extends Lead {
  business_name: string;
  owner_name: string;
  industry: string;
  town: string;
  calls: DemoCall[];
  booking?: { date: string; time: string; meet_link: string };
}

interface DemoCall {
  id: string;
  date: string;
  outcome: string;
  duration: string;
  notes: string;
}

const DEMO_LEADS: DemoLead[] = [
  {
    id: "l1",
    organization_id: "demo",
    target_id: null,
    first_name: "Mike",
    last_name: "Torres",
    full_name: "Mike Torres",
    email: "mike@sunriseplumbing.com",
    phone: "(813) 555-0101",
    company: "Sunrise Plumbing",
    business_name: "Sunrise Plumbing",
    owner_name: "Mike Torres",
    industry: "Plumbing",
    town: "Tampa",
    title: "Owner",
    linkedin_url: null,
    website: "sunriseplumbing.com",
    status: "booked",
    call_attempts: 2,
    last_called_at: "2026-05-05T14:30:00Z",
    next_call_at: null,
    notes: "Very interested in lead generation. Booked for Tuesday.",
    custom_fields: {},
    created_at: "2026-05-01T10:00:00Z",
    updated_at: "2026-05-05T14:30:00Z",
    calls: [
      {
        id: "c1a",
        date: "2026-05-03T10:15:00Z",
        outcome: "Voicemail",
        duration: "0:32",
        notes: "Left voicemail about AI calling demo.",
      },
      {
        id: "c1b",
        date: "2026-05-05T14:30:00Z",
        outcome: "Booked",
        duration: "3:47",
        notes: "Very engaged. Scheduled consultation for May 7.",
      },
    ],
    booking: {
      date: "May 7, 2026",
      time: "10:00 AM EST",
      meet_link: "https://meet.google.com/abc-defg-hij",
    },
  },
  {
    id: "l2",
    organization_id: "demo",
    target_id: null,
    first_name: "Sarah",
    last_name: "Chen",
    full_name: "Sarah Chen",
    email: "sarah@blueridgehvac.com",
    phone: "(828) 555-0133",
    company: "Blue Ridge HVAC",
    business_name: "Blue Ridge HVAC",
    owner_name: "Sarah Chen",
    industry: "HVAC",
    town: "Asheville",
    title: "Owner",
    linkedin_url: null,
    website: null,
    status: "interested",
    call_attempts: 1,
    last_called_at: "2026-05-04T11:00:00Z",
    next_call_at: "2026-05-06T11:00:00Z",
    notes: "Wants to learn more. Requested callback.",
    custom_fields: {},
    created_at: "2026-05-02T09:00:00Z",
    updated_at: "2026-05-04T11:00:00Z",
    calls: [
      {
        id: "c2a",
        date: "2026-05-04T11:00:00Z",
        outcome: "Interested",
        duration: "2:15",
        notes: "Asked good questions. Wants callback tomorrow.",
      },
    ],
  },
  {
    id: "l3",
    organization_id: "demo",
    target_id: null,
    first_name: "James",
    last_name: "Walker",
    full_name: "James Walker",
    email: null,
    phone: "(704) 555-0112",
    company: "Pinnacle Roofing",
    business_name: "Pinnacle Roofing",
    owner_name: "James Walker",
    industry: "Roofing",
    town: "Charlotte",
    title: "Owner",
    linkedin_url: null,
    website: "pinnacleroof.com",
    status: "called",
    call_attempts: 3,
    last_called_at: "2026-05-05T09:45:00Z",
    next_call_at: "2026-05-08T09:00:00Z",
    notes: "Busy season. Try again next week.",
    custom_fields: {},
    created_at: "2026-04-28T10:00:00Z",
    updated_at: "2026-05-05T09:45:00Z",
    calls: [
      {
        id: "c3a",
        date: "2026-04-29T10:00:00Z",
        outcome: "No Answer",
        duration: "0:00",
        notes: "No answer.",
      },
      {
        id: "c3b",
        date: "2026-05-01T10:00:00Z",
        outcome: "Voicemail",
        duration: "0:28",
        notes: "Left voicemail.",
      },
      {
        id: "c3c",
        date: "2026-05-05T09:45:00Z",
        outcome: "Not Interested",
        duration: "1:02",
        notes: "Too busy right now. Retry in 2 weeks.",
      },
    ],
  },
  {
    id: "l4",
    organization_id: "demo",
    target_id: null,
    first_name: "Lisa",
    last_name: "Moreno",
    full_name: "Lisa Moreno",
    email: "lisa@apexelectric.com",
    phone: "(813) 555-0188",
    company: "Apex Electric",
    business_name: "Apex Electric",
    owner_name: "Lisa Moreno",
    industry: "Electrician",
    town: "Tampa",
    title: "Owner",
    linkedin_url: null,
    website: null,
    status: "calling",
    call_attempts: 1,
    last_called_at: "2026-05-06T08:30:00Z",
    next_call_at: null,
    notes: null,
    custom_fields: {},
    created_at: "2026-05-05T10:00:00Z",
    updated_at: "2026-05-06T08:30:00Z",
    calls: [
      {
        id: "c4a",
        date: "2026-05-06T08:30:00Z",
        outcome: "In Progress",
        duration: "—",
        notes: "Call in progress.",
      },
    ],
  },
  {
    id: "l5",
    organization_id: "demo",
    target_id: null,
    first_name: "Tom",
    last_name: "Bradley",
    full_name: "Tom Bradley",
    email: "tom@mountainairheating.com",
    phone: "(865) 555-0178",
    company: "Mountain Air Heating",
    business_name: "Mountain Air Heating",
    owner_name: "Tom Bradley",
    industry: "HVAC",
    town: "Knoxville",
    title: "Owner",
    linkedin_url: null,
    website: null,
    status: "queued",
    call_attempts: 0,
    last_called_at: null,
    next_call_at: "2026-05-06T14:00:00Z",
    notes: null,
    custom_fields: {},
    created_at: "2026-05-05T15:00:00Z",
    updated_at: "2026-05-05T15:00:00Z",
    calls: [],
  },
  {
    id: "l6",
    organization_id: "demo",
    target_id: null,
    first_name: "Diana",
    last_name: "Park",
    full_name: "Diana Park",
    email: "diana@greenlawncare.com",
    phone: "(615) 555-0121",
    company: "Green Lawn Care",
    business_name: "Green Lawn Care",
    owner_name: "Diana Park",
    industry: "Landscaping",
    town: "Nashville",
    title: "Owner",
    linkedin_url: null,
    website: "greenlawncare.net",
    status: "new",
    call_attempts: 0,
    last_called_at: null,
    next_call_at: null,
    notes: null,
    custom_fields: {},
    created_at: "2026-05-06T07:00:00Z",
    updated_at: "2026-05-06T07:00:00Z",
    calls: [],
  },
  {
    id: "l7",
    organization_id: "demo",
    target_id: null,
    first_name: "Carlos",
    last_name: "Rivera",
    full_name: "Carlos Rivera",
    email: null,
    phone: "(305) 555-0167",
    company: "Miami Pest Pros",
    business_name: "Miami Pest Pros",
    owner_name: "Carlos Rivera",
    industry: "Pest Control",
    town: "Miami",
    title: "Owner",
    linkedin_url: null,
    website: null,
    status: "dead",
    call_attempts: 4,
    last_called_at: "2026-05-04T16:00:00Z",
    next_call_at: null,
    notes: "Requested do not call.",
    custom_fields: {},
    created_at: "2026-04-25T10:00:00Z",
    updated_at: "2026-05-04T16:00:00Z",
    calls: [
      {
        id: "c7a",
        date: "2026-05-04T16:00:00Z",
        outcome: "Do Not Call",
        duration: "0:45",
        notes: "Owner requested removal from list.",
      },
    ],
  },
  {
    id: "l8",
    organization_id: "demo",
    target_id: null,
    first_name: "Amanda",
    last_name: "Foster",
    full_name: "Amanda Foster",
    email: "amanda@sparkclean.com",
    phone: "(919) 555-0199",
    company: "Spark Clean Co.",
    business_name: "Spark Clean Co.",
    owner_name: "Amanda Foster",
    industry: "Cleaning",
    town: "Raleigh",
    title: "Owner",
    linkedin_url: null,
    website: null,
    status: "new",
    call_attempts: 0,
    last_called_at: null,
    next_call_at: null,
    notes: null,
    custom_fields: {},
    created_at: "2026-05-06T06:30:00Z",
    updated_at: "2026-05-06T06:30:00Z",
    calls: [],
  },
  {
    id: "l9",
    organization_id: "demo",
    target_id: null,
    first_name: "Robert",
    last_name: "Jensen",
    full_name: "Robert Jensen",
    email: "rob@solidstateconcrete.com",
    phone: "(402) 555-0143",
    company: "Solid State Concrete",
    business_name: "Solid State Concrete",
    owner_name: "Robert Jensen",
    industry: "Concrete",
    town: "Omaha",
    title: "Owner",
    linkedin_url: null,
    website: null,
    status: "queued",
    call_attempts: 0,
    last_called_at: null,
    next_call_at: "2026-05-06T15:30:00Z",
    notes: null,
    custom_fields: {},
    created_at: "2026-05-05T12:00:00Z",
    updated_at: "2026-05-05T12:00:00Z",
    calls: [],
  },
  {
    id: "l10",
    organization_id: "demo",
    target_id: null,
    first_name: "Kevin",
    last_name: "Marsh",
    full_name: "Kevin Marsh",
    email: "kevin@irongatefencing.com",
    phone: "(512) 555-0156",
    company: "Iron Gate Fencing",
    business_name: "Iron Gate Fencing",
    owner_name: "Kevin Marsh",
    industry: "Fencing",
    town: "Austin",
    title: "Owner",
    linkedin_url: null,
    website: null,
    status: "interested",
    call_attempts: 2,
    last_called_at: "2026-05-05T13:00:00Z",
    next_call_at: "2026-05-07T13:00:00Z",
    notes: "Wants pricing info. High potential.",
    custom_fields: {},
    created_at: "2026-05-03T10:00:00Z",
    updated_at: "2026-05-05T13:00:00Z",
    calls: [
      {
        id: "c10a",
        date: "2026-05-04T13:00:00Z",
        outcome: "Voicemail",
        duration: "0:35",
        notes: "Left voicemail.",
      },
      {
        id: "c10b",
        date: "2026-05-05T13:00:00Z",
        outcome: "Interested",
        duration: "4:12",
        notes: "Loved the concept. Wants to see pricing.",
      },
    ],
  },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  "All Industries",
  "HVAC",
  "Plumbing",
  "Electrician",
  "Roofing",
  "Landscaping",
  "Pest Control",
  "Cleaning",
  "Concrete",
  "Fencing",
  "Auto Repair",
];

const STATUSES: LeadStatus[] = [
  "new",
  "queued",
  "calling",
  "called",
  "interested",
  "booked",
  "dead",
];

const PAGE_SIZE = 20;

// ─── Status badge ──────────────────────────────────────────────────────────────

function statusConfig(status: LeadStatus) {
  switch (status) {
    case "new":
      return { label: "New", classes: "bg-blue-500/20 text-blue-400 border-blue-500/30" };
    case "queued":
      return { label: "Queued", classes: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" };
    case "calling":
      return { label: "Calling", classes: "bg-orange-500/20 text-orange-400 border-orange-500/30" };
    case "called":
      return { label: "Called", classes: "bg-gray-500/20 text-gray-400 border-gray-500/30" };
    case "interested":
      return { label: "Interested", classes: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" };
    case "booked":
      return { label: "Booked", classes: "bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/30" };
    case "dead":
      return { label: "Dead", classes: "bg-red-500/20 text-red-400 border-red-500/30" };
  }
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const { label, classes } = statusConfig(status);
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", classes)}>
      {label}
    </span>
  );
}

// ─── Format helpers ────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Call history accordion ───────────────────────────────────────────────────

function CallHistory({ calls }: { calls: DemoCall[] }) {
  const [open, setOpen] = useState(true);
  if (calls.length === 0) {
    return (
      <div className="rounded-lg bg-[#0f1117] border border-[#2a2d3e] p-4 text-sm text-[#6b7280]">
        No call history yet.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-[#2a2d3e] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full px-4 py-3 bg-[#0f1117] text-sm font-medium text-white"
      >
        <span>Call History ({calls.length})</span>
        {open ? <ChevronUp className="w-4 h-4 text-[#6b7280]" /> : <ChevronDown className="w-4 h-4 text-[#6b7280]" />}
      </button>
      {open && (
        <div className="divide-y divide-[#2a2d3e]">
          {calls.map((call) => (
            <div key={call.id} className="px-4 py-3 bg-[#1a1d2e]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-[#4fc3f7]">{call.outcome}</span>
                <span className="text-xs text-[#6b7280]">{fmtDate(call.date)}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-[#6b7280] mb-1">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {call.duration}</span>
              </div>
              {call.notes && <p className="text-xs text-[#9ca3af]">{call.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Lead detail panel ─────────────────────────────────────────────────────────

function LeadDetailPanel({
  lead,
  onClose,
  onStatusChange,
}: {
  lead: DemoLead;
  onClose: () => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
}) {
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [calling, setCalling] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  async function handleCallNow() {
    setCalling(true);
    // POST /api/automation/trigger-calls
    await fetch("/api/automation/trigger-calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: lead.id }),
    }).catch(() => {});
    setTimeout(() => setCalling(false), 2000);
  }

  function handleSaveNote() {
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-[#2a2d3e]">
        <div>
          <h2 className="text-lg font-bold text-white">{lead.business_name}</h2>
          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs bg-[#4fc3f7]/10 text-[#4fc3f7] border border-[#4fc3f7]/20">
            <Tag className="w-3 h-3" /> {lead.industry}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[#2a2d3e] text-[#6b7280] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Contact info */}
        <div className="grid grid-cols-1 gap-2">
          <div className="flex items-center gap-2 text-sm text-[#9ca3af]">
            <User className="w-4 h-4 text-[#6b7280] flex-shrink-0" />
            {lead.owner_name}
          </div>
          <div className="flex items-center gap-2 text-sm text-[#9ca3af]">
            <Phone className="w-4 h-4 text-[#6b7280] flex-shrink-0" />
            {lead.phone}
          </div>
          {lead.email && (
            <div className="flex items-center gap-2 text-sm text-[#9ca3af]">
              <Mail className="w-4 h-4 text-[#6b7280] flex-shrink-0" />
              {lead.email}
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-[#9ca3af]">
            <MapPin className="w-4 h-4 text-[#6b7280] flex-shrink-0" />
            {lead.town}
          </div>
          <div className="flex items-center gap-2 text-sm text-[#9ca3af]">
            <Calendar className="w-4 h-4 text-[#6b7280] flex-shrink-0" />
            Added {fmtShortDate(lead.created_at)}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[#6b7280]">Status:</span>
            <StatusBadge status={lead.status} />
          </div>
        </div>

        {/* Status override */}
        <div>
          <label className="block text-xs font-medium text-[#6b7280] mb-1.5">Override Status</label>
          <select
            value={lead.status}
            onChange={(e) => onStatusChange(lead.id, e.target.value as LeadStatus)}
            className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff88]"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Booking details */}
        {lead.status === "booked" && lead.booking && (
          <div className="rounded-lg border border-[#00ff88]/30 bg-[#00ff88]/5 p-4">
            <p className="text-xs font-semibold text-[#00ff88] mb-2">BOOKING CONFIRMED</p>
            <p className="text-sm text-white">{lead.booking.date} at {lead.booking.time}</p>
            <a
              href={lead.booking.meet_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-xs text-[#4fc3f7] hover:text-white transition-colors"
            >
              <PhoneCall className="w-3.5 h-3.5" /> Join Google Meet
            </a>
          </div>
        )}

        {/* Call history */}
        <CallHistory calls={lead.calls} />

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-[#6b7280] mb-1.5 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" /> Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Add notes about this lead..."
            className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#00ff88] resize-none"
          />
          <button
            onClick={handleSaveNote}
            className="mt-1.5 text-xs text-[#00ff88] hover:text-white transition-colors"
          >
            {noteSaved ? "Saved!" : "Save note"}
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="p-5 border-t border-[#2a2d3e]">
        <button
          onClick={handleCallNow}
          disabled={calling}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-all",
            calling
              ? "bg-orange-500/20 text-orange-400 cursor-not-allowed"
              : "bg-[#00ff88] text-[#0f1117] hover:bg-[#00ff88]/90 active:scale-95"
          )}
        >
          <PhoneCall className="w-4 h-4" />
          {calling ? "Initiating Call…" : "Call Now"}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus[]>([]);
  const [industryFilter, setIndustryFilter] = useState("All Industries");
  const [townFilter, setTownFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLead, setSelectedLead] = useState<DemoLead | null>(null);
  const [leads, setLeads] = useState<DemoLead[]>(DEMO_LEADS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  // Filter logic
  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        lead.business_name.toLowerCase().includes(q) ||
        lead.owner_name.toLowerCase().includes(q) ||
        lead.phone.includes(q) ||
        (lead.email?.toLowerCase().includes(q) ?? false) ||
        lead.town.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter.length === 0 || statusFilter.includes(lead.status);

      const matchesIndustry =
        industryFilter === "All Industries" || lead.industry === industryFilter;

      const matchesTown =
        !townFilter || lead.town.toLowerCase().includes(townFilter.toLowerCase());

      const matchesDateFrom =
        !dateFrom || new Date(lead.created_at) >= new Date(dateFrom);

      const matchesDateTo =
        !dateTo || new Date(lead.created_at) <= new Date(dateTo + "T23:59:59");

      return matchesSearch && matchesStatus && matchesIndustry && matchesTown && matchesDateFrom && matchesDateTo;
    });
  }, [leads, search, statusFilter, industryFilter, townFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleStatusFilter(s: LeadStatus) {
    setStatusFilter((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
    setPage(1);
  }

  function handleStatusChange(id: string, status: LeadStatus) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    if (selectedLead?.id === id) {
      setSelectedLead((prev) => (prev ? { ...prev, status } : null));
    }
  }

  function exportCsv() {
    const headers = ["Business Name", "Owner", "Industry", "Town", "Phone", "Email", "Status", "Last Called", "Call Attempts"];
    const rows = filtered.map((l) => [
      l.business_name,
      l.owner_name,
      l.industry,
      l.town,
      l.phone,
      l.email ?? "",
      l.status,
      l.last_called_at ? new Date(l.last_called_at).toLocaleString() : "",
      String(l.call_attempts),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full bg-[#0f1117]">
      {/* ── Filters panel ── */}
      <aside
        className={cn(
          "flex-shrink-0 border-r border-[#2a2d3e] bg-[#1a1d2e] overflow-y-auto transition-all duration-300",
          filtersOpen ? "w-60" : "w-0 md:w-60"
        )}
      >
        <div className="p-4 min-w-[240px]">
          <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-4">Filters</p>

          {/* Status multi-select */}
          <div className="mb-5">
            <label className="text-xs font-medium text-[#9ca3af] mb-2 block">Status</label>
            <div className="space-y-1.5">
              {STATUSES.map((s) => {
                const { label, classes } = statusConfig(s);
                return (
                  <label key={s} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={statusFilter.includes(s)}
                      onChange={() => toggleStatusFilter(s)}
                      className="accent-[#00ff88] w-3.5 h-3.5"
                    />
                    <span className={cn("text-xs px-2 py-0.5 rounded-full border", classes)}>{label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Industry */}
          <div className="mb-5">
            <label className="text-xs font-medium text-[#9ca3af] mb-2 block">Industry</label>
            <select
              value={industryFilter}
              onChange={(e) => { setIndustryFilter(e.target.value); setPage(1); }}
              className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#00ff88]"
            >
              {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
            </select>
          </div>

          {/* Town */}
          <div className="mb-5">
            <label className="text-xs font-medium text-[#9ca3af] mb-2 block">Town</label>
            <input
              type="text"
              value={townFilter}
              onChange={(e) => { setTownFilter(e.target.value); setPage(1); }}
              placeholder="Filter by town..."
              className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-2 py-1.5 text-xs text-white placeholder-[#6b7280] focus:outline-none focus:border-[#00ff88]"
            />
          </div>

          {/* Date range */}
          <div className="mb-5">
            <label className="text-xs font-medium text-[#9ca3af] mb-2 block">Date Added</label>
            <div className="space-y-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#00ff88]"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#00ff88]"
              />
            </div>
          </div>

          <button
            onClick={() => {
              setStatusFilter([]);
              setIndustryFilter("All Industries");
              setTownFilter("");
              setDateFrom("");
              setDateTo("");
              setPage(1);
            }}
            className="text-xs text-[#6b7280] hover:text-white transition-colors"
          >
            Clear all filters
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#2a2d3e]">
          {/* Mobile filter toggle */}
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className="md:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2d3e] text-sm text-[#9ca3af] hover:text-white transition-colors"
          >
            <Filter className="w-4 h-4" />
          </button>

          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7280]" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search leads..."
              className="w-full bg-[#1a1d2e] border border-[#2a2d3e] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#00ff88]"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-[#6b7280]">{filtered.length} leads</span>
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1a1d2e] border border-[#2a2d3e] text-sm text-[#9ca3af] hover:text-white hover:border-[#00ff88]/50 transition-colors"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[#1a1d2e] border-b border-[#2a2d3e]">
              <tr>
                {["Business Name", "Owner", "Industry", "Town", "Phone", "Email", "Status", "Last Called", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2d3e]">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-[#6b7280]">
                    No leads match your filters.
                  </td>
                </tr>
              ) : (
                paginated.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className={cn(
                      "cursor-pointer transition-colors",
                      selectedLead?.id === lead.id
                        ? "bg-[#00ff88]/5 border-l-2 border-l-[#00ff88]"
                        : "hover:bg-[#1a1d2e]"
                    )}
                  >
                    <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-[#6b7280] flex-shrink-0" />
                        {lead.business_name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#9ca3af] whitespace-nowrap">{lead.owner_name}</td>
                    <td className="px-4 py-3 text-[#9ca3af] whitespace-nowrap">{lead.industry}</td>
                    <td className="px-4 py-3 text-[#9ca3af] whitespace-nowrap">{lead.town}</td>
                    <td className="px-4 py-3 text-[#9ca3af] whitespace-nowrap font-mono text-xs">{lead.phone}</td>
                    <td className="px-4 py-3 text-[#9ca3af] whitespace-nowrap">
                      {lead.email ?? <span className="text-[#6b7280]">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={lead.status} />
                    </td>
                    <td className="px-4 py-3 text-[#9ca3af] whitespace-nowrap text-xs">
                      {fmtDate(lead.last_called_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLead(lead);
                        }}
                        className="p-1.5 rounded-lg hover:bg-[#00ff88]/10 text-[#6b7280] hover:text-[#00ff88] transition-colors"
                        title="View details"
                      >
                        <PhoneCall className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#2a2d3e] bg-[#1a1d2e]">
          <span className="text-xs text-[#6b7280]">
            Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-[#2a2d3e] text-[#6b7280] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .map((p, idx, arr) => (
                <React.Fragment key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span className="px-1 text-[#6b7280] text-xs">…</span>
                  )}
                  <button
                    onClick={() => setPage(p)}
                    className={cn(
                      "w-7 h-7 rounded-lg text-xs font-medium transition-colors",
                      p === page
                        ? "bg-[#00ff88] text-[#0f1117]"
                        : "hover:bg-[#2a2d3e] text-[#9ca3af]"
                    )}
                  >
                    {p}
                  </button>
                </React.Fragment>
              ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg hover:bg-[#2a2d3e] text-[#6b7280] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Lead detail panel ── */}
      <aside
        className={cn(
          "flex-shrink-0 border-l border-[#2a2d3e] bg-[#1a1d2e] overflow-hidden transition-all duration-300",
          selectedLead ? "w-80 xl:w-96" : "w-0"
        )}
      >
        {selectedLead && (
          <LeadDetailPanel
            lead={selectedLead}
            onClose={() => setSelectedLead(null)}
            onStatusChange={handleStatusChange}
          />
        )}
      </aside>
    </div>
  );
}
