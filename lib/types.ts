// ─── Primitive domain types ───────────────────────────────────────────────────

export type PlanType = "starter" | "growth" | "pro";

export type LeadStatus =
  | "new"
  | "queued"
  | "calling"
  | "called"
  | "interested"
  | "booked"
  | "dead";

export type CallOutcome =
  | "no_answer"
  | "voicemail"
  | "callback_requested"
  | "not_interested"
  | "interested"
  | "booked"
  | "wrong_number"
  | "do_not_call";

export type NotificationType =
  | "booking"
  | "lead_interested"
  | "call_completed"
  | "limit_warning"
  | "system"
  | "billing";

// ─── Core domain interfaces ───────────────────────────────────────────────────

export interface Organization {
  id: string;
  clerk_org_id: string;
  name: string;
  slug: string;
  plan: PlanType;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_setup_fee_paid: boolean;
  leads_used_this_month: number;
  billing_cycle_start: string; // ISO date string
  settings: OrganizationSettings;
  created_at: string;
  updated_at: string;
}

export interface OrganizationSettings {
  timezone: string;
  calling_hours_start: string; // "HH:MM" 24-hour
  calling_hours_end: string;   // "HH:MM" 24-hour
  calling_days: number[];      // 0=Sun … 6=Sat
  max_call_attempts: number;
  retry_delay_hours: number;
  voicemail_enabled: boolean;
  calendar_provider: "google" | "calendly" | null;
  calendar_integration_id: string | null;
  notification_email: string | null;
  sms_notifications: boolean;
}

export interface User {
  id: string;
  clerk_user_id: string;
  organization_id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: "owner" | "admin" | "member";
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Target {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  industry: string | null;
  niche: string | null;
  script_id: string | null;
  is_active: boolean;
  leads_count: number;
  bookings_count: number;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  organization_id: string;
  target_id: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  phone: string;
  company: string | null;
  title: string | null;
  linkedin_url: string | null;
  website: string | null;
  status: LeadStatus;
  call_attempts: number;
  last_called_at: string | null;
  next_call_at: string | null;
  notes: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Call {
  id: string;
  organization_id: string;
  lead_id: string;
  target_id: string | null;
  twilio_call_sid: string | null;
  direction: "outbound" | "inbound";
  status: "initiated" | "ringing" | "in-progress" | "completed" | "failed" | "busy" | "no-answer";
  outcome: CallOutcome | null;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript: string | null;
  ai_summary: string | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  organization_id: string;
  lead_id: string;
  call_id: string | null;
  target_id: string | null;
  calendar_event_id: string | null;
  calendar_provider: "google" | "calendly" | null;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  timezone: string;
  meet_link: string | null;
  status: "confirmed" | "cancelled" | "rescheduled" | "completed" | "no_show";
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  organization_id: string;
  user_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  action_url: string | null;
  is_read: boolean;
  read_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ApiKey {
  id: string;
  organization_id: string;
  name: string;
  key_prefix: string;    // first 8 chars shown in UI (e.g. "jac_live")
  key_hash: string;      // bcrypt / SHA-256 hash — never store plaintext
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_by: string;    // user_id
  created_at: string;
  updated_at: string;
}

// ─── Script / prompt interfaces ───────────────────────────────────────────────

export interface Script {
  id: string;
  organization_id: string;
  target_id: string | null;
  name: string;
  intro: string;
  value_proposition: string;
  objection_handlers: Record<string, string>;
  closing: string;
  voicemail_message: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Dashboard / analytics interfaces ────────────────────────────────────────

export interface DashboardStats {
  total_leads: number;
  leads_this_month: number;
  leads_limit: number;
  calls_today: number;
  calls_this_week: number;
  calls_this_month: number;
  bookings_today: number;
  bookings_this_week: number;
  bookings_this_month: number;
  connection_rate: number;    // 0-1
  booking_rate: number;       // 0-1
  active_targets: number;
  plan: PlanType;
  usage_percentage: number;   // leads_this_month / leads_limit * 100
}

export interface CallMetrics {
  date: string;
  calls: number;
  connected: number;
  interested: number;
  booked: number;
}

// ─── Supabase Database type (used as generic in createClient) ─────────────────

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: Omit<Organization, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Organization, "id" | "created_at">>;
      };
      users: {
        Row: User;
        Insert: Omit<User, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<User, "id" | "created_at">>;
      };
      targets: {
        Row: Target;
        Insert: Omit<Target, "id" | "created_at" | "updated_at" | "leads_count" | "bookings_count">;
        Update: Partial<Omit<Target, "id" | "created_at">>;
      };
      leads: {
        Row: Lead;
        Insert: Omit<Lead, "id" | "created_at" | "updated_at" | "call_attempts">;
        Update: Partial<Omit<Lead, "id" | "created_at">>;
      };
      calls: {
        Row: Call;
        Insert: Omit<Call, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Call, "id" | "created_at">>;
      };
      bookings: {
        Row: Booking;
        Insert: Omit<Booking, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Booking, "id" | "created_at">>;
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, "id" | "created_at">;
        Update: Partial<Omit<Notification, "id" | "created_at">>;
      };
      api_keys: {
        Row: ApiKey;
        Insert: Omit<ApiKey, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<ApiKey, "id" | "created_at">>;
      };
      scripts: {
        Row: Script;
        Insert: Omit<Script, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Script, "id" | "created_at">>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      lead_status: LeadStatus;
      call_outcome: CallOutcome;
      plan_type: PlanType;
    };
  };
}
