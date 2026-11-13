/**
 * Brings records from any earlier build up to what the current code expects.
 *
 * Every step is additive and idempotent: nothing is renamed, nothing is dropped, and
 * running it twice changes nothing. That keeps restoring an older backup safe.
 *
 * Field history
 *   v1  the original shape
 *   v2  people gained `peopleEntries` (hand-recorded outstanding amounts)
 *   v3  transactions gained `tags`; categories gained `quick` and `order`
 *   v4  transactions gained `payer`, `mySettled` and `includeMe` so a bill can be
 *       recorded as paid by somebody else on behalf of the group
 *   v5  settling a debt now records the money actually changing hands: a settlement
 *       transaction carries `settles`, and the share it cleared carries `clearedBy`.
 *       Shares settled before this existed have no `clearedBy` at all, which is how
 *       the repair tool finds them — so this migration deliberately leaves it unset.
 *   v6  settlements are categorised and linked: `settles` carries the person, the
 *       direction and the exact bills it clears. Older settlements written by v5
 *       are given an empty link list rather than being rewritten.
 */
export const SCHEMA_VERSION = 6;

/**
 * Amounts are money, so they are kept to the paisa. Splitting 350 three ways
 * leaves 116.66666666666667 behind; rounding on the way in cleans up anything
 * stored before this and keeps later totals exact.
 */
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

function migrateTxn(t) {
  // Spread first: rebuilding a share field by field silently drops anything added
  // later, and losing `clearedBy` would make the settlement patch run forever.
  const shares = Array.isArray(t.shares) && t.shares.length
    ? t.shares.map((sh) => ({ ...sh, person: sh.person, amount: num(sh.amount), settled: !!sh.settled }))
    : null;

  return {
    ...t,
    amount: num(t.amount),
    tags: Array.isArray(t.tags) ? t.tags : [],
    status: t.status || "Cleared",
    exclude: !!t.exclude,
    splits: Array.isArray(t.splits) && t.splits.length
      ? t.splits.map((sp) => ({ ...sp, cat: sp.cat || null, amount: num(sp.amount), note: sp.note || "" }))
      : null,
    shares,
    // v4: anything recorded before this existed was paid by you, from your own account.
    payer: t.payer || null,
    mySettled: !!t.mySettled,
    includeMe: t.includeMe === undefined ? true : !!t.includeMe,
    // v5/v6: null unless this transaction *is* a settlement payment. When it is,
    // make sure the link list exists so callers never have to guard for it.
    settles: t.settles
      ? { person: t.settles.person, direction: t.settles.direction, links: t.settles.links || [] }
      : null,
  };
}

export function migrateState(state) {
  return {
    ...state,
    txns: (state.txns || []).map(migrateTxn),
    categories: (state.categories || []).map((c) => ({ ...c, quick: !!c.quick })),
    accounts: (state.accounts || []).map((a) => ({ ...a, opening: num(a.opening) })),
    peopleEntries: (state.peopleEntries || []).map((e) => ({ ...e, amount: num(e.amount) })),
    tags: state.tags || [],
    meta: { ...(state.meta || {}), schema: SCHEMA_VERSION },
  };
}

/** True when anything actually had to change, so we know whether to write back. */
export function needsMigration(state) {
  const at = state.meta && state.meta.schema;
  return at !== SCHEMA_VERSION;
}
