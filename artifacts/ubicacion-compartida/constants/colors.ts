/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#123438',
    tint: '#146b68',

    // Core surfaces
    background: '#f4f2e9',
    foreground: '#123438',

    // Cards / elevated surfaces
    card: '#ffffff',
    cardForeground: '#123438',

    // Primary action color (buttons, links, active states)
    primary: '#146b68',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#e5ede6',
    secondaryForeground: '#123438',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#ebe9df',
    mutedForeground: '#647572',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#dcebe4',
    accentForeground: '#123438',

    // Destructive actions (delete, error states)
    destructive: '#ef4444',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#d9dfd7',
    input: '#d9dfd7',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;
