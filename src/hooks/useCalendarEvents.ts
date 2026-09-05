import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { segments } from "../lib/calendar";
import { calendarEventsURL } from "../lib/calendarRange";
import type { Event, FamilyMember } from "../types";
import { eventMembers, eventMemberLabel } from "../lib/eventMembers";

type CalendarSegment = ReturnType<typeof segments>[number] & {
  member: FamilyMember;
  participants?: FamilyMember[];
};

export function useCalendarEvents(start: Date, end: Date, refresh: number) {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [events, setEvents] = useState<CalendarSegment[]>([]);
  const [loadedRange, setLoadedRange] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const startTime = start.getTime(),
    endTime = end.getTime();
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    Promise.all([
      apiFetch("/api/family").then((r) => r.json()),
      apiFetch(calendarEventsURL(new Date(startTime), new Date(endTime))).then(
        (r) => r.json(),
      ),
    ])
      .then(([members, data]: [FamilyMember[], Event[]]) => {
        if (!current) return;
        setMembers(members);
        setLoadedRange(`${startTime}:${endTime}`);
        setEvents(
          segments(data, new Date(startTime), new Date(endTime)).map(
            (event) => {
              const participants = eventMembers(event, members);
              const primary = participants[0];
              return {
                ...event,
                participants,
                member: primary
                  ? {
                      ...primary,
                      name: eventMemberLabel(event, members),
                      avatar: participants.length > 1 ? null : primary.avatar,
                    }
                  : {
                      id: 0,
                      name: event.source_name || "Family",
                      color: event.color || "bg-stone-100 text-stone-700",
                      avatar: null,
                      stars: 0,
                      phone: null,
                      visible: true,
                    },
              };
            },
          ),
        );
      })
      .catch((cause) => {
        if (current)
          setError(
            cause instanceof Error ? cause.message : "Could not load calendar",
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [startTime, endTime, refresh, attempt]);
  return {
    members,
    events: loadedRange === `${startTime}:${endTime}` ? events : [],
    error,
    loading,
    retry: () => setAttempt((value) => value + 1),
  };
}
