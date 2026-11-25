/**
 * Runs the daily recap from inside the app: keeps the worker's copy of the message
 * current, posts yesterday's recap once the date turns, and routes a tap on it to the
 * day it describes. See notify.js for why there is no server in this picture.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { daySummary } from "./analytics.js";
import { digestMessage, dayBefore, NUDGE_FALLBACK } from "./digest.js";
import { iso, isoToday, parseISO } from "./money.js";
import {
  publishRecap, lastSent, markSent, showRecap, scheduleBackgroundRecap, msUntilMidnight,
} from "./notify.js";

/*
 * A date from a link or a message is checked for being a real day, not just the right
 * shape: "2026-02-30" passes a pattern, and an entry saved on it would sit in February in
 * the reports and in March on the calendar.
 */
const isRealDate = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && iso(parseISO(d)) === d;

/*
 * Without this, the first morning after installing would greet someone with
 * "Nothing logged for Sunday" about a day before they had the app. The recap starts
 * from the day the first book was made, or the oldest entry if a backup reaches further.
 */
function recapSince(books, txns) {
  const dates = books.filter((b) => b.createdAt).map((b) => iso(new Date(b.createdAt)));
  const oldest = txns.reduce((min, t) => (!min || t.date < min ? t.date : min), null);
  if (oldest) dates.push(oldest);
  return dates.sort()[0] || isoToday();
}

export function useDailyRecap(s, { openDay, toast }) {
  const ready = s.status === "ready" && !!s.book;
  const enabled = s.settings.dailyDigest !== false;
  const since = useMemo(() => recapSince(s.state.books, s.state.txns), [s.state.books, s.state.txns]);

  const compose = useCallback((date) => {
    const day = daySummary(s.ledger, s.txns, date, { catById: s.catById });
    // Other books are counted so an empty book on a busy day is not mistaken for a forgotten one.
    const elsewhere = s.state.txns.filter((t) => t.date === date && t.book !== s.activeBook).length;
    const message = digestMessage(day, {
      // A PIN-locked app should not spell out its figures on the phone's lock screen either.
      currency: s.currency, privacy: !!s.settings.privacy || !!s.settings.lock, elsewhere,
      bookName: s.state.books.length > 1 && s.book ? s.book.name : "",
    });
    return { date, title: message.title, body: message.body };
  }, [s.ledger, s.txns, s.catById, s.state.txns, s.state.books, s.activeBook, s.currency, s.settings.privacy, s.settings.lock, s.book]);

  /* Keep the worker's copy current, so a recap sent with the app closed says what the app would. */
  useEffect(() => {
    if (!ready) return;
    const today = isoToday();
    const yesterday = dayBefore(today);
    publishRecap({
      enabled, since,
      days: { [yesterday]: compose(yesterday), [today]: compose(today) },
      fallback: NUDGE_FALLBACK,
    });
  }, [ready, enabled, since, compose]);

  useEffect(() => {
    if (ready) scheduleBackgroundRecap(enabled);
  }, [ready, enabled]);

  /*
   * Deliver at most once per day. The guard ref matters: opening the app fires the
   * ready effect and a visibility change together, and both would otherwise read the
   * marker before either wrote it and post the recap twice.
   */
  const busy = useRef(false);
  const deliver = useCallback(async () => {
    if (!ready || !enabled || busy.current) return;
    const target = dayBefore(isoToday());
    if (target < since) return;
    busy.current = true;
    try {
      if ((await lastSent()) >= target) return;
      await markSent(target);
      const message = compose(target);
      const shown = await showRecap(message);
      // No permission, or no worker: say it inside the app rather than not at all.
      if (!shown) toast(message.title, { label: "Review", fn: () => openDay(target) });
    } finally {
      busy.current = false;
    }
  }, [ready, enabled, since, compose, toast, openDay]);

  /* The listeners below live for the whole session, so they call whatever deliver is current. */
  const latest = useRef(deliver);
  latest.current = deliver;

  // Once on opening, and again when the setting is switched back on.
  useEffect(() => { latest.current(); }, [ready, enabled]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") latest.current(); };
    document.addEventListener("visibilitychange", onVisible);

    // Open across midnight: post the recap as the day turns, then wait for the next one.
    let timer;
    const arm = () => { timer = setTimeout(() => { latest.current(); arm(); }, msUntilMidnight()); };
    arm();

    return () => { document.removeEventListener("visibilitychange", onVisible); clearTimeout(timer); };
  }, []);

  /* A tap on the notification: the worker either messages a running app or opens one at ?day=. */
  const pendingDay = useRef(
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("day") : null
  );

  useEffect(() => {
    if (!ready || !pendingDay.current) return;
    const date = pendingDay.current;
    pendingDay.current = null;
    // Drop the query so a reload does not reopen the day on top of wherever the user went.
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.hash);
    if (isRealDate(date)) openDay(date);
  }, [ready, openDay]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const onMessage = (e) => {
      if (e.data && e.data.type === "VYAY_OPEN_DAY" && isRealDate(e.data.date)) openDay(e.data.date);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [openDay]);
}
