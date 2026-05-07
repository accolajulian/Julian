"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import * as Tabs from "@radix-ui/react-tabs";
import * as Switch from "@radix-ui/react-switch";
import * as Dialog from "@radix-ui/react-dialog";
import * as Progress from "@radix-ui/react-progress";
import {
  User,
  Zap,
  Bell,
  Users,
  CreditCard,
  Save,
  Check,
  X,
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Copy,
  Lock,
  TrendingUp,
  Star,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";
import { PLAN_LIMITS } from "@/lib/stripe";
import type { PlanType } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}

function StatusBadge({ status }: { status: "connected" | "disconnected" | "error" }) {
  const map = {
    connected: "bg-[#00ff88]/15 text-[#00ff88] border-[#00ff88]/30",
    disconnected: "bg-white/5 text-[#6b7280] border-white/10",
    error: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  const label = { connected: "Connected", disconnected: "Not Connected", error: "Error" };
  return (
    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", map[status])}>
      {label[status]}
    </span>
  );
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

interface ProfileFormData {
  name: string;
  owner_name: string;
  notification_email: string;
  phone: string;
  average_job_value: number;
  timezone: string;
  calling_hours_start: string;
  calling_hours_end: string;
}

function ProfileTab() {
  const { org } = useOrg();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const { register, handleSubmit, reset } = useForm<ProfileFormData>({
    defaultValues: {
      name: org?.name ?? "",
      owner_name: "",
      notification_email: org?.settings?.notification_email ?? "",
      phone: "",
      average_job_value: 3500,
      timezone: org?.settings?.timezone ?? "America/Chicago",
      calling_hours_start: org?.settings?.calling_hours_start ?? "08:00",
      calling_hours_end: org?.settings?.calling_hours_end ?? "20:00",
    },
  });

  useEffect(() => {
    if (org) {
      reset({
        name: org.name,
        owner_name: "",
        notification_email: org.settings?.notification_email ?? "",
        phone: "",
        average_job_value: 3500,
        timezone: org.settings?.timezone ?? "America/Chicago",
        calling_hours_start: org.settings?.calling_hours_start ?? "08:00",
        calling_hours_end: org.settings?.calling_hours_end ?? "20:00",
      });
    }
  }, [org, reset]);

  const onSubmit = async (data: ProfileFormData) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          settings: {
            timezone: data.timezone,
            calling_hours_start: data.calling_hours_start,
            calling_hours_end: data.calling_hours_end,
            notification_email: data.notification_email || null,
          },
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "Save failed");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const timezones = [
    "America/Chicago",
    "America/New_York",
    "America/Denver",
    "America/Los_Angeles",
    "America/Phoenix",
    "America/Anchorage",
    "Pacific/Honolulu",
  ];

  const hours = Array.from({ length: 24 }, (_, i) => {
    const hh = String(i).padStart(2, "0");
    const label = i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`;
    return { value: `${hh}:00`, label };
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Business Profile</h2>
        <p className="text-sm text-[#6b7280]">Your organization details and working hours.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#6b7280]">Business Name</label>
          <input
            {...register("name")}
            className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#00ff88]/50"
            placeholder="LeadEmm LLC"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#6b7280]">Owner Name</label>
          <input
            {...register("owner_name")}
            className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#00ff88]/50"
            placeholder="Julian Accola"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#6b7280]">Notification Email</label>
          <input
            {...register("notification_email")}
            type="email"
            className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#00ff88]/50"
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#6b7280]">Phone Number</label>
          <input
            {...register("phone")}
            type="tel"
            className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#00ff88]/50"
            placeholder="(555) 000-0000"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#6b7280]">Average Job Value ($)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280] text-sm">$</span>
            <input
              {...register("average_job_value", { valueAsNumber: true })}
              type="number"
              min={0}
              className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg pl-7 pr-3 py-2 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#00ff88]/50"
              placeholder="3500"
            />
          </div>
          <p className="text-xs text-[#6b7280]">Used to calculate estimated revenue on the dashboard.</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#6b7280]">Timezone</label>
          <select
            {...register("timezone")}
            className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff88]/50"
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz}>{tz.replace("America/", "").replace("Pacific/", "")}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="border-t border-[#2a2d3e] pt-5">
        <h3 className="text-sm font-semibold text-white mb-3">Working Hours</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#6b7280]">Start Time</label>
            <select
              {...register("calling_hours_start")}
              className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff88]/50"
            >
              {hours.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#6b7280]">End Time</label>
            <select
              {...register("calling_hours_end")}
              className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff88]/50"
            >
              {hours.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-2 bg-[#00ff88] text-[#0f1117] font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-[#00cc70] transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
      </button>
    </form>
  );
}

// ─── Integration Card ─────────────────────────────────────────────────────────

interface IntegrationCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  status: "connected" | "disconnected" | "error";
  fields: Array<{ key: string; label: string; type?: string; placeholder?: string; readOnly?: boolean; value?: string }>;
  onTest: (values: Record<string, string>) => Promise<void>;
  onDisconnect?: () => void;
  webhookUrl?: string;
  oauthConnect?: () => void;
  isGoogle?: boolean;
}

function IntegrationCard({
  title,
  description,
  icon,
  status,
  fields,
  onTest,
  onDisconnect,
  webhookUrl,
  oauthConnect,
  isGoogle,
}: IntegrationCardProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await onTest(values);
      setTestResult({ ok: true, message: "Connection successful!" });
    } catch (e) {
      setTestResult({ ok: false, message: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const copyWebhook = () => {
    if (webhookUrl) {
      navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#0f1117] border border-[#2a2d3e] flex items-center justify-center text-[#00ff88]">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white text-sm">{title}</h3>
              <StatusBadge status={status} />
            </div>
            <p className="text-xs text-[#6b7280] mt-0.5">{description}</p>
          </div>
        </div>
        {status === "connected" && onDisconnect && (
          <button
            onClick={onDisconnect}
            className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Disconnect
          </button>
        )}
      </div>

      {webhookUrl && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#6b7280]">Webhook URL (configure in Atlas)</label>
          <div className="flex items-center gap-2 bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2">
            <code className="text-xs text-[#4fc3f7] flex-1 truncate">{webhookUrl}</code>
            <button onClick={copyWebhook} className="text-[#6b7280] hover:text-white transition-colors">
              {copied ? <Check className="w-3.5 h-3.5 text-[#00ff88]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}

      {isGoogle ? (
        <button
          onClick={oauthConnect}
          className="flex items-center gap-2 bg-white text-gray-800 font-medium px-4 py-2 rounded-lg text-sm hover:bg-gray-100 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {status === "connected" ? "Reconnect Google Calendar" : "Connect Google Calendar"}
        </button>
      ) : (
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <label className="text-xs font-medium text-[#6b7280]">{f.label}</label>
              {f.readOnly ? (
                <div className="bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2">
                  <code className="text-xs text-[#4fc3f7]">{f.value ?? ""}</code>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type={f.type === "password" && !show[f.key] ? "password" : "text"}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#00ff88]/50 pr-10"
                  />
                  {f.type === "password" && (
                    <button
                      type="button"
                      onClick={() => setShow((s) => ({ ...s, [f.key]: !s[f.key] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-white"
                    >
                      {show[f.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {testResult && (
        <div className={cn(
          "flex items-center gap-2 text-xs px-3 py-2 rounded-lg",
          testResult.ok ? "bg-[#00ff88]/10 text-[#00ff88]" : "bg-red-500/10 text-red-400"
        )}>
          {testResult.ok ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {testResult.message}
        </div>
      )}

      {!isGoogle && (
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-2 border border-[#2a2d3e] text-[#6b7280] hover:text-white hover:border-[#00ff88]/30 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          Test Connection
        </button>
      )}
    </div>
  );
}

// ─── Integrations Tab ─────────────────────────────────────────────────────────

function IntegrationsTab() {
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = `${appUrl}/api/webhooks/atlas`;

  const testIntegration = async (service: string, values: Record<string, string>) => {
    const body: Record<string, string> = { service, ...values };
    const res = await fetch("/api/settings/test-integration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message ?? "Connection failed");
  };

  const handleGoogleOAuth = () => {
    window.location.href = "/api/auth/google-calendar";
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Integrations</h2>
        <p className="text-sm text-[#6b7280]">Connect your tools to power the LeadEmm workflow.</p>
      </div>

      <IntegrationCard
        title="Apollo.io"
        description="Pull verified business leads with contact info."
        icon={<Zap className="w-5 h-5" />}
        status="disconnected"
        fields={[
          { key: "apiKey", label: "API Key", type: "password", placeholder: "apollo_api_key_…" },
        ]}
        onTest={(v) => testIntegration("apollo", { apiKey: v.apiKey })}
      />

      <IntegrationCard
        title="Atlas AI"
        description="AI voice agent that handles all outbound calls."
        icon={<Star className="w-5 h-5" />}
        status="disconnected"
        fields={[
          { key: "apiKey", label: "API Key", type: "password", placeholder: "atlas_sk_…" },
        ]}
        onTest={(v) => testIntegration("atlas", { apiKey: v.apiKey })}
        webhookUrl={webhookUrl}
      />

      <IntegrationCard
        title="Google Calendar"
        description="Auto-create calendar events when a booking is confirmed."
        icon={
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="18" rx="2" stroke="#4fc3f7" strokeWidth="2"/>
            <path d="M16 2v4M8 2v4M3 10h18" stroke="#4fc3f7" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        }
        status="disconnected"
        fields={[]}
        onTest={async () => {}}
        isGoogle
        oauthConnect={handleGoogleOAuth}
      />

      <IntegrationCard
        title="Twilio"
        description="Phone numbers and call infrastructure for outbound dialing."
        icon={<Lock className="w-5 h-5" />}
        status="disconnected"
        fields={[
          { key: "accountSid", label: "Account SID", type: "password", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
          { key: "authToken", label: "Auth Token", type: "password", placeholder: "your_auth_token" },
          { key: "phoneNumber", label: "Phone Number", type: "text", placeholder: "+15550001234" },
        ]}
        onTest={(v) => testIntegration("twilio", { accountSid: v.accountSid, authToken: v.authToken, phoneNumber: v.phoneNumber })}
      />

      <IntegrationCard
        title="Resend"
        description="Transactional emails for booking confirmations and summaries."
        icon={<Bell className="w-5 h-5" />}
        status="disconnected"
        fields={[
          { key: "apiKey", label: "API Key", type: "password", placeholder: "re_xxxxxxxxxxxxxxxxxxxxxxxx" },
        ]}
        onTest={(v) => testIntegration("resend", { apiKey: v.apiKey })}
      />
    </div>
  );
}

// ─── Notifications Tab ────────────────────────────────────────────────────────

interface NotifFormData {
  email_on_booking: boolean;
  sms_on_booking: boolean;
  daily_summary_enabled: boolean;
  daily_summary_time: string;
  weekly_report_enabled: boolean;
  payment_reminders: boolean;
}

function NotificationsTab() {
  const [form, setForm] = useState<NotifFormData>({
    email_on_booking: true,
    sms_on_booking: false,
    daily_summary_enabled: true,
    daily_summary_time: "08:00",
    weekly_report_enabled: false,
    payment_reminders: true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const toggle = (key: keyof NotifFormData) => {
    if (typeof form[key] === "boolean") {
      setForm((f) => ({ ...f, [key]: !f[key] }));
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "Save failed");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const items: Array<{ key: keyof NotifFormData; label: string; description: string; showTime?: boolean }> = [
    { key: "email_on_booking", label: "Email on new booking", description: "Receive an email when a lead books a consultation." },
    { key: "sms_on_booking", label: "SMS on new booking", description: "Get a text message when a booking is confirmed." },
    { key: "daily_summary_enabled", label: "Daily summary email", description: "Receive a daily rundown of calls, leads, and bookings.", showTime: true },
    { key: "weekly_report_enabled", label: "Weekly report email", description: "Weekly performance summary every Monday morning." },
    { key: "payment_reminders", label: "Payment reminders", description: "Get notified before your billing renewal date." },
  ];

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Notifications</h2>
        <p className="text-sm text-[#6b7280]">Control how and when you hear from LeadEmm.</p>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.key} className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{item.label}</p>
              <p className="text-xs text-[#6b7280] mt-0.5">{item.description}</p>
              {item.showTime && form.daily_summary_enabled && (
                <div className="mt-2">
                  <select
                    value={form.daily_summary_time}
                    onChange={(e) => setForm((f) => ({ ...f, daily_summary_time: e.target.value }))}
                    className="bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00ff88]/50"
                  >
                    {["06:00", "07:00", "08:00", "09:00", "10:00", "17:00", "18:00", "20:00"].map((t) => {
                      const [h] = t.split(":").map(Number);
                      const label = h === 0 ? "12:00 AM" : h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM" : `${h - 12}:00 PM`;
                      return <option key={t} value={t}>{label}</option>;
                    })}
                  </select>
                </div>
              )}
            </div>
            <Switch.Root
              checked={form[item.key] as boolean}
              onCheckedChange={() => toggle(item.key)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none flex-shrink-0",
                (form[item.key] as boolean) ? "bg-[#00ff88]" : "bg-[#2a2d3e]"
              )}
            >
              <Switch.Thumb className="block h-4 w-4 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6 data-[state=unchecked]:translate-x-1" />
            </Switch.Root>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 bg-[#00ff88] text-[#0f1117] font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-[#00cc70] transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saving ? "Saving…" : saved ? "Saved!" : "Save Preferences"}
      </button>
    </div>
  );
}

// ─── Team Tab ─────────────────────────────────────────────────────────────────

function TeamTab({ plan }: { plan: PlanType }) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviteError, setInviteError] = useState("");

  if (plan === "starter") {
    return (
      <div className="max-w-xl">
        <div className="bg-[#1a1d2e] border border-[#00ff88]/20 rounded-xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-[#00ff88]/15 flex items-center justify-center mx-auto">
            <Users className="w-6 h-6 text-[#00ff88]" />
          </div>
          <h3 className="text-lg font-semibold text-white">Team Management</h3>
          <p className="text-sm text-[#6b7280]">
            Upgrade to Growth or Pro to invite team members and collaborate on LeadEmm.
          </p>
          <a
            href="/settings?tab=billing"
            className="inline-flex items-center gap-2 bg-[#00ff88] text-[#0f1117] font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-[#00cc70] transition-colors"
          >
            <TrendingUp className="w-4 h-4" /> Upgrade Plan
          </a>
        </div>
      </div>
    );
  }

  const seatLimit = PLAN_LIMITS[plan].seats;
  const demoMembers = [
    { id: "1", name: "Julian Accola", email: "julian@jacbuilds.com", role: "owner" as const },
    { id: "2", name: "Alex Smith", email: "alex@jacbuilds.com", role: "admin" as const },
  ];

  const sendInvite = async () => {
    if (!inviteEmail) return;
    setInviting(true);
    setInviteMsg("");
    setInviteError("");
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: "member" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Invite failed");
      setInviteMsg(data.message);
      setInviteEmail("");
    } catch (e) {
      setInviteError((e as Error).message);
    } finally {
      setInviting(false);
    }
  };

  const roleColors: Record<string, string> = {
    owner: "bg-[#00ff88]/15 text-[#00ff88] border-[#00ff88]/30",
    admin: "bg-[#4fc3f7]/15 text-[#4fc3f7] border-[#4fc3f7]/30",
    member: "bg-white/5 text-[#6b7280] border-white/10",
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Team</h2>
        <p className="text-sm text-[#6b7280]">
          {seatLimit === Infinity ? "Unlimited seats on your Pro plan." : `${demoMembers.length} / ${seatLimit} seats used.`}
        </p>
      </div>

      <div className="space-y-2">
        {demoMembers.map((member) => (
          <div key={member.id} className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl px-5 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#00ff88]/20 flex items-center justify-center text-[#00ff88] font-semibold text-sm">
                {member.name.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-medium text-white">{member.name}</p>
                <p className="text-xs text-[#6b7280]">{member.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border capitalize", roleColors[member.role])}>
                {member.role}
              </span>
              {member.role !== "owner" && (
                <button className="text-xs text-red-400 hover:text-red-300 transition-colors">
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-[#2a2d3e] pt-5">
        <h3 className="text-sm font-semibold text-white mb-3">Invite Team Member</h3>
        <div className="flex gap-3">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendInvite()}
            placeholder="teammate@company.com"
            className="flex-1 bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:border-[#00ff88]/50"
          />
          <button
            onClick={sendInvite}
            disabled={inviting || !inviteEmail}
            className="flex items-center gap-2 bg-[#00ff88] text-[#0f1117] font-semibold px-4 py-2 rounded-lg text-sm hover:bg-[#00cc70] transition-colors disabled:opacity-50"
          >
            {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Send Invite
          </button>
        </div>
        {inviteMsg && <p className="text-xs text-[#00ff88] mt-2">{inviteMsg}</p>}
        {inviteError && <p className="text-xs text-red-400 mt-2">{inviteError}</p>}
      </div>
    </div>
  );
}

// ─── Billing Tab ──────────────────────────────────────────────────────────────

function BillingTab({ plan }: { plan: PlanType }) {
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelMsg, setCancelMsg] = useState("");

  const planInfo = PLAN_LIMITS[plan];
  const usedLeads = 37;
  const leadsLimit = planInfo.leads === Infinity ? null : planInfo.leads;
  const leadsPercent = leadsLimit ? Math.round((usedLeads / leadsLimit) * 100) : 0;

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal");
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      // no-op
    } finally {
      setPortalLoading(false);
    }
  };

  const cancelSub = async () => {
    setCancelling(true);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setCancelMsg(data.message);
      }
    } catch {
      // no-op
    } finally {
      setCancelling(false);
    }
  };

  const demoInvoices = [
    { id: "inv_001", date: "May 1, 2026", amount: planInfo.priceUsdCents / 100, status: "paid" },
    { id: "inv_002", date: "Apr 1, 2026", amount: planInfo.priceUsdCents / 100, status: "paid" },
    { id: "inv_003", date: "Mar 1, 2026", amount: planInfo.priceUsdCents / 100, status: "paid" },
  ];

  const otherPlans: PlanType[] = (["starter", "growth", "pro"] as PlanType[]).filter((p) => p !== plan);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Billing</h2>
        <p className="text-sm text-[#6b7280]">Manage your subscription and payment details.</p>
      </div>

      {/* Current plan */}
      <div className="bg-[#1a1d2e] border border-[#00ff88]/30 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-[#6b7280] uppercase tracking-wider mb-1">Current Plan</p>
            <h3 className="text-xl font-bold text-white">{planInfo.label}</h3>
            <p className="text-2xl font-bold text-[#00ff88] mt-1">
              ${(planInfo.priceUsdCents / 100).toLocaleString()}
              <span className="text-sm text-[#6b7280] font-normal">/month</span>
            </p>
            <p className="text-xs text-[#6b7280] mt-1">Next renewal: June 1, 2026</p>
          </div>
          <button
            onClick={openPortal}
            disabled={portalLoading}
            className="flex items-center gap-2 border border-[#2a2d3e] text-white px-4 py-2 rounded-lg text-sm hover:border-[#00ff88]/30 transition-colors disabled:opacity-50"
          >
            {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            Manage Payment
          </button>
        </div>

        {/* Usage meters */}
        <div className="mt-5 space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-[#6b7280]">Leads this month</span>
              <span className="text-white">{usedLeads} / {leadsLimit ?? "∞"}</span>
            </div>
            {leadsLimit && (
              <Progress.Root className="h-2 bg-[#2a2d3e] rounded-full overflow-hidden" value={leadsPercent}>
                <Progress.Indicator
                  className="h-full bg-[#00ff88] rounded-full transition-all"
                  style={{ width: `${leadsPercent}%` }}
                />
              </Progress.Root>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-[#6b7280]">Active targets</span>
              <span className="text-white">1 / {planInfo.targets === Infinity ? "∞" : planInfo.targets}</span>
            </div>
            {planInfo.targets !== Infinity && (
              <Progress.Root className="h-2 bg-[#2a2d3e] rounded-full overflow-hidden" value={Math.round(1 / planInfo.targets * 100)}>
                <Progress.Indicator
                  className="h-full bg-[#4fc3f7] rounded-full transition-all"
                  style={{ width: `${Math.round(1 / planInfo.targets * 100)}%` }}
                />
              </Progress.Root>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-[#6b7280]">Team seats</span>
              <span className="text-white">2 / {planInfo.seats === Infinity ? "∞" : planInfo.seats}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade options */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Other Plans</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {otherPlans.map((p) => {
            const info = PLAN_LIMITS[p];
            return (
              <div key={p} className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-4 hover:border-[#00ff88]/20 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-white text-sm">{info.label}</p>
                    <p className="text-[#00ff88] font-bold mt-0.5">${(info.priceUsdCents / 100).toLocaleString()}<span className="text-xs text-[#6b7280] font-normal">/mo</span></p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1 text-xs text-[#6b7280]">
                  <li>• {info.leads === Infinity ? "Unlimited" : info.leads} leads/month</li>
                  <li>• {info.targets === Infinity ? "Unlimited" : info.targets} target{info.targets !== 1 ? "s" : ""}</li>
                  <li>• {info.seats === Infinity ? "Unlimited" : info.seats} seat{info.seats !== 1 ? "s" : ""}</li>
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Invoice history */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Invoice History</h3>
        <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a2d3e]">
                <th className="text-left text-xs text-[#6b7280] font-medium px-5 py-3">Date</th>
                <th className="text-left text-xs text-[#6b7280] font-medium px-5 py-3">Amount</th>
                <th className="text-left text-xs text-[#6b7280] font-medium px-5 py-3">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {demoInvoices.map((inv) => (
                <tr key={inv.id} className="border-b border-[#2a2d3e]/50 last:border-0">
                  <td className="px-5 py-3 text-white text-xs">{inv.date}</td>
                  <td className="px-5 py-3 text-white text-xs">${inv.amount.toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs bg-[#00ff88]/15 text-[#00ff88] border border-[#00ff88]/30 px-2 py-0.5 rounded-full capitalize">
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button className="text-[#4fc3f7] hover:text-white transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cancel */}
      <div className="border-t border-[#2a2d3e] pt-5">
        {cancelMsg ? (
          <p className="text-sm text-[#6b7280] bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl px-5 py-4">{cancelMsg}</p>
        ) : (
          <Dialog.Root open={cancelOpen} onOpenChange={setCancelOpen}>
            <Dialog.Trigger asChild>
              <button className="text-sm text-red-400 hover:text-red-300 transition-colors">
                Cancel subscription
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
              <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#1a1d2e] border border-[#2a2d3e] rounded-2xl p-6 w-full max-w-sm z-50 space-y-4">
                <Dialog.Title className="text-lg font-bold text-white">Cancel Subscription?</Dialog.Title>
                <Dialog.Description className="text-sm text-[#6b7280]">
                  Your subscription will be cancelled at the end of the current billing period. You'll retain full access until then.
                </Dialog.Description>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={cancelSub}
                    disabled={cancelling}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-500 text-white font-semibold px-4 py-2.5 rounded-lg text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Yes, Cancel
                  </button>
                  <Dialog.Close asChild>
                    <button className="flex-1 border border-[#2a2d3e] text-white font-medium px-4 py-2.5 rounded-lg text-sm hover:border-[#00ff88]/30 transition-colors">
                      Keep Plan
                    </button>
                  </Dialog.Close>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}
      </div>
    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────

export default function SettingsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const { org } = useOrg();
  const plan: PlanType = org?.plan ?? "starter";
  const defaultTab = searchParams?.tab ?? "profile";

  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "integrations", label: "Integrations", icon: Zap },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "team", label: "Team", icon: Users },
    { id: "billing", label: "Billing", icon: CreditCard },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-[#6b7280] mt-1">Manage your LeadEmm configuration.</p>
      </div>

      <Tabs.Root defaultValue={defaultTab}>
        <Tabs.List className="flex gap-1 bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-1 mb-8 overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <Tabs.Trigger
              key={id}
              value={id}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[#6b7280] transition-all whitespace-nowrap data-[state=active]:bg-[#0f1117] data-[state=active]:text-white data-[state=active]:shadow-sm hover:text-white"
            >
              <Icon className="w-4 h-4" />
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="profile" className="focus:outline-none">
          <ProfileTab />
        </Tabs.Content>
        <Tabs.Content value="integrations" className="focus:outline-none">
          <IntegrationsTab />
        </Tabs.Content>
        <Tabs.Content value="notifications" className="focus:outline-none">
          <NotificationsTab />
        </Tabs.Content>
        <Tabs.Content value="team" className="focus:outline-none">
          <TeamTab plan={plan} />
        </Tabs.Content>
        <Tabs.Content value="billing" className="focus:outline-none">
          <BillingTab plan={plan} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
