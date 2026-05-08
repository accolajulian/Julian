"use client";

import { useEffect, useRef } from "react";
import type { Activity } from "@/components/dashboard/ActivityFeed";

export interface CallCompletedEvent {
  callId: string;
  leadId: string;
  outcome: string;
  durationSeconds: number;
  score: number;
}

export interface LeadPulledEvent {
  count: number;
  targetId: string;
}

export interface BookingCreatedEvent {
  bookingId: string;
  leadId: string;
  leadName: string;
  scheduledAt: string;
  meetLink: string | null;
}

interface Options {
  orgId: string | null;
  onActivity: (event: Activity) => void;
  onCallCompleted: (data: CallCompletedEvent) => void;
  onLeadPulled: (data: LeadPulledEvent) => void;
  onBookingCreated: (data: BookingCreatedEvent) => void;
}

// Refs hold the latest callbacks so the socket listener never becomes stale
// without needing to reconnect.
export function useRealtimeDashboard({
  orgId,
  onActivity,
  onCallCompleted,
  onLeadPulled,
  onBookingCreated,
}: Options) {
  const cbActivity = useRef(onActivity);
  const cbCall = useRef(onCallCompleted);
  const cbLead = useRef(onLeadPulled);
  const cbBooking = useRef(onBookingCreated);

  useEffect(() => { cbActivity.current = onActivity; }, [onActivity]);
  useEffect(() => { cbCall.current = onCallCompleted; }, [onCallCompleted]);
  useEffect(() => { cbLead.current = onLeadPulled; }, [onLeadPulled]);
  useEffect(() => { cbBooking.current = onBookingCreated; }, [onBookingCreated]);

  useEffect(() => {
    if (!orgId) return;

    let socket: import("socket.io-client").Socket | null = null;

    import("socket.io-client").then(({ io }) => {
      socket = io({ path: "/api/socket", reconnectionAttempts: 5 });

      socket.on("connect", () => {
        socket!.emit("join_org", orgId);
      });

      socket.on("call_completed", (data: CallCompletedEvent) => {
        cbCall.current(data);

        const outcomeLabel: Record<string, string> = {
          interested: "expressed interest",
          booked: "booked a consultation",
          not_interested: "not interested",
          voicemail: "voicemail left",
          no_answer: "no answer",
          callback_requested: "requested a callback",
        };
        const label = outcomeLabel[data.outcome] ?? data.outcome;
        const duration =
          data.durationSeconds > 0
            ? ` · ${Math.floor(data.durationSeconds / 60)}m ${data.durationSeconds % 60}s`
            : "";

        cbActivity.current({
          id: `call-${data.callId}`,
          type: "call",
          message: `Call completed — ${label}${duration}`,
          timestamp: new Date().toISOString(),
          isNew: true,
        });
      });

      socket.on("leads_added", (data: LeadPulledEvent) => {
        cbLead.current(data);
        cbActivity.current({
          id: `lead-${Date.now()}`,
          type: "lead",
          message: `Pulled ${data.count} new lead${data.count !== 1 ? "s" : ""}`,
          timestamp: new Date().toISOString(),
          isNew: true,
        });
      });

      socket.on("booking_created", (data: BookingCreatedEvent) => {
        cbBooking.current(data);
        cbActivity.current({
          id: `booking-${data.bookingId}`,
          type: "booking",
          message: `${data.leadName} booked a consultation`,
          timestamp: new Date().toISOString(),
          isNew: true,
        });
      });
    });

    return () => {
      socket?.disconnect();
    };
  }, [orgId]);
}
