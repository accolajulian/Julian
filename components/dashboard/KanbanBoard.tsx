import Link from "next/link";
import { Phone, MapPin, Tag, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lead, LeadStatus } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KanbanLeads {
  new: Lead[];
  queued: Lead[];
  called: Lead[];
  interested: Lead[];
  booked: Lead[];
}

interface KanbanBoardProps {
  leads: KanbanLeads;
}

// ─── Column config ────────────────────────────────────────────────────────────

interface ColumnConfig {
  status: keyof KanbanLeads;
  label: string;
  color: string;
  dotColor: string;
  headerBg: string;
}

const COLUMNS: ColumnConfig[] = [
  {
    status: "new",
    label: "New",
    color: "text-[#6b7280]",
    dotColor: "bg-[#6b7280]",
    headerBg: "bg-[rgba(107,114,128,0.1)]",
  },
  {
    status: "queued",
    label: "Queued",
    color: "text-[#4fc3f7]",
    dotColor: "bg-[#4fc3f7]",
    headerBg: "bg-[rgba(79,195,247,0.08)]",
  },
  {
    status: "called",
    label: "Called",
    color: "text-yellow-400",
    dotColor: "bg-yellow-400",
    headerBg: "bg-[rgba(251,191,36,0.08)]",
  },
  {
    status: "interested",
    label: "Interested",
    color: "text-purple-400",
    dotColor: "bg-purple-400",
    headerBg: "bg-[rgba(167,139,250,0.08)]",
  },
  {
    status: "booked",
    label: "Booked",
    color: "text-[#00ff88]",
    dotColor: "bg-[#00ff88]",
    headerBg: "bg-[rgba(0,255,136,0.08)]",
  },
];

// ─── Lead card ────────────────────────────────────────────────────────────────

function LeadCard({ lead }: { lead: Lead }) {
  return (
    <div className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-3 hover:border-[#3a3d4e] hover:bg-[#13161f] transition-all duration-150 group">
      <p className="text-xs font-semibold text-white truncate">
        {lead.company ?? lead.full_name}
      </p>
      {lead.company && (
        <p className="text-[10px] text-[#6b7280] truncate mt-0.5">{lead.full_name}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {typeof lead.custom_fields?.town === "string" && (
          <span className="flex items-center gap-1 text-[10px] text-[#6b7280]">
            <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
            <span className="truncate max-w-[80px]">
              {lead.custom_fields.town}
            </span>
          </span>
        )}
        {typeof lead.custom_fields?.industry === "string" && (
          <span className="flex items-center gap-1 text-[10px] bg-[rgba(79,195,247,0.1)] text-[#4fc3f7] px-1.5 py-0.5 rounded-full">
            <Tag className="h-2 w-2 flex-shrink-0" />
            <span className="truncate max-w-[60px]">
              {lead.custom_fields.industry}
            </span>
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-[#6b7280] font-mono truncate">
          {lead.phone}
        </span>
        <button className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] text-[#00ff88] hover:text-[#00ff88]/80 transition-all">
          <Phone className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function KanbanBoard({ leads }: KanbanBoardProps) {
  return (
    <div className="grid grid-cols-5 gap-3 min-w-0">
      {COLUMNS.map((col) => {
        const columnLeads = leads[col.status] ?? [];
        const count = columnLeads.length;
        const preview = columnLeads.slice(0, 3);

        return (
          <div key={col.status} className="flex flex-col gap-2 min-w-0">
            {/* Column header */}
            <div
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2",
                col.headerBg
              )}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn("h-2 w-2 rounded-full flex-shrink-0", col.dotColor)}
                />
                <span className={cn("text-xs font-semibold", col.color)}>
                  {col.label}
                </span>
              </div>
              <span className="text-[11px] font-bold text-[#6b7280] bg-[#2a2d3e] px-1.5 py-0.5 rounded-full">
                {count}
              </span>
            </div>

            {/* Lead cards */}
            <div className="flex flex-col gap-2 overflow-y-auto max-h-72 pr-0.5">
              {preview.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#2a2d3e] p-3 text-center">
                  <p className="text-[10px] text-[#6b7280]">No leads</p>
                </div>
              ) : (
                preview.map((lead) => <LeadCard key={lead.id} lead={lead} />)
              )}
            </div>

            {/* View all */}
            {count > 3 && (
              <Link
                href={`/leads?status=${col.status}`}
                className="flex items-center justify-center gap-1 rounded-lg border border-[#2a2d3e] py-2 text-[10px] text-[#6b7280] hover:text-white hover:border-[#3a3d4e] transition-colors"
              >
                View all {count}
                <ArrowRight className="h-2.5 w-2.5" />
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
