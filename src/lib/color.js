/** Colour helpers. Kept free of JSX so they can be unit tested directly. */

/**
 * A translucent wash of a colour, for the square behind an icon.
 *
 * Icon tiles used to build this by appending an alpha suffix to the colour, which
 * works for a stored hex but silently produces nonsense for a theme variable —
 * "var(--in)" + "1c" is not a colour, so income and transfer rows rendered with
 * no tile at all. Hex keeps the fast path; anything else goes through color-mix.
 */
export function tint(color, pct = 11) {
  if (!color) return "var(--icon-neutral)";
  const hex = /^#([0-9a-fA-F]{6})$/.exec(color);
  if (hex) return color + Math.round((pct / 100) * 255).toString(16).padStart(2, "0");
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}
