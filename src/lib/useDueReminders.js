/**
 * The payment reminder: a notification just after midnight for the recurring payments
 * due today and tomorrow, so a bill is seen the day before it leaves the account and
 * again on the day itself. It rides on the same delivery as the daily recap (see
 * notify.js): a timer across midnight, a check on opening or refocusing the app, and
 * Periodic Background Sync with the app closed.
 *
 * It covers every book, not just the active one. The recap is about what was logged in
 * the book in front of you; a rent reminder that went quiet because another book was
 * open is the reminder failing at its only job.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { recurringDue } from "./analytics.js";
import { dueMessage } from "./digest.js";
import { iso, isoToday, parseISO } from "./money.js";
import { publishDues, lastDueSent, markDueSent, showDues, msUntilMidnight } from "./notify.js";

/* A week ahead, so a phone that sleeps through a few days with the app closed still has the words. */
const HORIZON = 7;

const addDays = (date, n) => {
  const d = parseISO(date);
  return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};

/* The recap's toast holds the single toast slot for about five seconds; wait it out rather than replace it. */
const AFTER_RECAP_TOAST = 5600;

/* Only screens a notification may open; anything else in the URL is ignored. */
const OPENABLE = ["recurring"];

export function useDueReminders(s, { openScreen, toast }) {
  const ready = s.status === "ready" && !!s.book;
  const enabled = s.settings.dueReminders !== false;
  const privacy = !!s.settings.privacy || !!s.settings.lock;

  const items = useMemo(() => {
    const currencyOf = Object.fromEntries(s.state.books.map((b) => [b.id, b.currency]));
    return s.state.recurring.map((r) => ({
      name: r.name, day: r.day, amount: r.amount, auto: !!r.auto,
      currency: currencyOf[r.book] || s.currency,
    }));
  }, [s.state.recurring, s.state.books, s.currency]);

  const compose = useCallback((date) => dueMessage({
    today: recurringDue(items, date),
    tomorrow: recurringDue(items, addDays(date, 1)),
  }, { privacy }), [items, privacy]);

  /* Keep the worker's copy current, so a reminder sent with the app closed says what the app would. */
  useEffect(() => {
    if (!ready) return;
    const today = isoToday();
    const days = {};
    for (let i = 0; i < HORIZON; i++) {
      const date = addDays(today, i);
      const message = compose(date);
      if (message) days[date] = message;
    }
    publishDues({ enabled, days });
  }, [ready, enabled, compose]);

  /* At most once a day, guarded against the open and visibility checks racing each other. */
  const busy = useRef(false);
  const deliver = useCallback(async () => {
    if (!ready || !enabled || busy.current) return;
    const today = isoToday();
    busy.current = true;
    try {
      if ((await lastDueSent()) >= today) return;
      const message = compose(today);
      // Mark the day even when nothing is due, so a later edit does not fire a late "due today".
      await markDueSent(today);
      if (!message) return;
      const shown = await showDues(message);
      if (!shown) {
        setTimeout(() => toast(message.title, { label: "View", fn: () => openScreen("recurring") }), AFTER_RECAP_TOAST);
      }
    } finally {
      busy.current = false;
    }
  }, [ready, enabled, compose, toast, openScreen]);

  const latest = useRef(deliver);
  latest.current = deliver;

  useEffect(() => { latest.current(); }, [ready, enabled]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") latest.current(); };
    document.addEventListener("visibilitychange", onVisible);
    let timer;
    const arm = () => { timer = setTimeout(() => { latest.current(); arm(); }, msUntilMidnight()); };
    arm();
    return () => { document.removeEventListener("visibilitychange", onVisible); clearTimeout(timer); };
  }, []);

  /* A tap on the reminder: the worker either messages a running app or opens one at ?open=. */
  const pending = useRef(
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("open") : null
  );

  useEffect(() => {
    if (!ready || !pending.current) return;
    const screen = pending.current;
    pending.current = null;
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.hash);
    if (OPENABLE.includes(screen)) openScreen(screen);
  }, [ready, openScreen]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const onMessage = (e) => {
      if (e.data && e.data.type === "VYAY_OPEN_SCREEN" && OPENABLE.includes(e.data.screen)) openScreen(e.data.screen);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [openScreen]);
}
