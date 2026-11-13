/**
 * Coordinates the device back button with the app's own navigation.
 *
 * Two kinds of thing can be "open":
 *  - screens and tabs, which own a real history entry each (managed by App)
 *  - sheets, which own none — they just intercept one back press and the
 *    listener immediately re-pushes, so history depth never drifts.
 *
 * Keeping sheets out of the history stack means a sheet that unmounts without
 * being closed by the user can never leave a dead entry behind.
 */
const sheets = [];

export function registerSheet(close) {
  const token = { close };
  sheets.push(token);
  return token;
}

export function unregisterSheet(token) {
  const i = sheets.indexOf(token);
  if (i >= 0) sheets.splice(i, 1);
}

export const topSheet = () => sheets[sheets.length - 1] || null;
export const anySheetOpen = () => sheets.length > 0;
