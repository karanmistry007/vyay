/**
 * The words of the daily recap notification.
 *
 * Kept pure and free of browser APIs so the copy can be checked by test-analytics.mjs
 * like any other figure. A notification is read on a lock screen in two seconds, so
 * the title carries the one number that matters and the body carries the rest.
 */
import { fmt, iso, parseISO, MON } from "./money.js";

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
