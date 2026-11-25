/**
 * The words of the daily recap notification.
 *
 * Kept pure and free of browser APIs so the copy can be checked by test-analytics.mjs
 * like any other figure. A notification is read on a lock screen in two seconds, so
 * the title carries the one number that matters and the body carries the rest.
 */
import { fmt, iso, parseISO, MON, round2 } from "./money.js";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The calendar day before `date`, in local time. Month and year ends roll over. */
export function dayBefore(date) {
  const d = parseISO(date);
  return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * For a day the app never saw. The worker shows this when the page has not run since
 * before that day began, which can only mean nothing was logged on it.
 */
export const NUDGE_FALLBACK = {
  title: "Nothing logged yesterday",
  body: "Not a single spend or income was recorded. Forgot a few? Add them now while the details are still fresh.",
};

/**
 * Title and body for one day's recap.
 *
 * `kind` tells the caller which of three situations this is: a day with entries
 * ("summary"), a day with none anywhere ("nudge"), or a day where this book was empty
 * but another book was not ("elsewhere"), which must not read as a telling-off.
 *
 * With Hide amounts on, no figure appears at all: a notification shows on a locked
 * phone, which is exactly the screen that setting exists to protect.
 */
export function digestMessage(day, { currency = "INR", privacy = false, elsewhere = 0, bookName = "" } = {}) {
  const d = parseISO(day.date);
  const weekday = WEEKDAYS[d.getDay()];
  const dateLabel = `${d.getDate()} ${MON[d.getMonth()]}`;
  const money = (n) => fmt(n, { currency });

  if (!day.entries && elsewhere > 0) {
    return {
      kind: "elsewhere",
      title: `A quiet ${weekday}${bookName ? ` in ${bookName}` : ""}`,
      body: `Nothing here on ${dateLabel}, but ${plural(elsewhere, "entry", "entries")} in your other books. Switch books to review them.`,
    };
  }

  if (!day.entries) {
    return {
      kind: "nudge",
      title: `Nothing logged for ${weekday}`,
      body: `Not a single spend or income on ${dateLabel}. Forgot a few? Add them now while the details are still fresh.`,
    };
  }

  const count = plural(day.entries, "entry", "entries");

  if (privacy) {
    return {
      kind: "summary",
      title: `Your ${weekday} recap is ready`,
      body: `${count} recorded on ${dateLabel}. Amounts stay hidden while Hide amounts is on. Tap to review.`,
    };
  }

  let title;
  if (day.spent > 0) title = `${weekday}: ${money(day.spent)} spent`;
  else if (day.earned > 0) title = `${weekday}: ${money(day.earned)} came in`;
  else if (day.moved > 0) title = `${weekday}: ${money(day.moved)} moved between accounts`;
  else title = `${weekday}'s books are up to date`;

  // The title already said the lead figure, so the body only adds what it left out.
  const parts = [count];
  if (day.spent > 0 && day.earned > 0) parts.push(`${money(day.earned)} in`);
  if ((day.spent > 0 || day.earned > 0) && day.moved > 0) parts.push(`${money(day.moved)} moved`);
  if (day.spent > 0 && day.top) parts.push(`biggest spend ${day.top.name}, ${money(day.top.amount)}`);
  if (!day.spent && !day.earned && day.moved > 0) parts.push("no spending recorded");

  return { kind: "summary", title, body: `${parts.join(" · ")}. Tap to review your day.` };
}

/**
 * Title and body for the payment reminder, or null when nothing is due.
 *
 * `today` and `tomorrow` are lists of { name, amount, currency, auto }. Each item carries
 * its own currency because the reminder covers every book, and two books can keep
 * different currencies. Today leads, because a payment due now matters more than one
 * due tomorrow. Auto-paid items are still listed: the money leaves either way, and the
 * reminder is the prompt to log it.
 *
 * With Hide amounts or App lock on, only names appear, as with the recap.
 */
export function dueMessage({ today = [], tomorrow = [] }, { privacy = false } = {}) {
  if (!today.length && !tomorrow.length) return null;
  const money = (r) => fmt(r.amount, { currency: r.currency || "INR" });
  const line = (r) => `${r.name}${privacy ? "" : ` ${money(r)}`}${r.auto ? " (auto-pays)" : ""}`;
  const list = (items) => items.map(line).join(", ");

  const lead = today.length ? today : tomorrow;
  const when = today.length ? "today" : "tomorrow";
  let title;
  if (lead.length === 1) title = `${lead[0].name} is due ${when}`;
  else {
    // Only add a total when every item shares a currency; ₹ plus $ is not a number.
    const sameCurrency = lead.every((r) => (r.currency || "INR") === (lead[0].currency || "INR"));
    const total = sameCurrency && !privacy ? ` · ${fmt(round2(lead.reduce((a, r) => a + (Number(r.amount) || 0), 0)), { currency: lead[0].currency || "INR" })}` : "";
    title = `${lead.length} payments due ${when}${total}`;
  }

  const parts = [];
  if (today.length) parts.push(`Today: ${list(today)}.`);
  if (tomorrow.length) parts.push(`Tomorrow: ${list(tomorrow)}.`);
  parts.push("Tap to see your recurring payments.");
  return { title, body: parts.join(" ") };
}
