// Copy into the generated `scripts/check.mjs` assertions array.
//
// The editorial theme only works if `editorial.css` is the one file that
// knows a colour, a font size, a radius, or a duration. Every violation of
// that is silent: the app still renders, still passes every other check, and
// only breaks when someone switches family or opens it in dark mode — which,
// in practice, is a screenshot nobody takes until after handoff. A hardcoded
// `rgba(255,255,255,0.94)` on a sticky header is the canonical case: it wins
// the cascade over the dark block and leaves a white bar with invisible text.
//
// That is the same reason `runtime-detection/` exists as a copied asset: a
// rule that is only written down gets re-derived per app; a rule that fails
// the build does not.
//
// `themeSource` is `app/styles/editorial.css`.
// `otherCss` is every OTHER stylesheet concatenated (app/styles/*.css minus
// editorial.css, plus any demo/setup stylesheet).
// `html` is `app/index.html`.

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

// Raw colour in any form. `currentColor`, `transparent`, `inherit`, and
// `color-mix()` over tokens are fine and are not matched here.
const RAW_COLOUR = /(#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(|\boklch\s*\()/;

// Pull declared values out rather than trying to exclude `var(...)` with a
// lookahead: `font-size:\s*(?!var\()` looks right and is not, because `\s*`
// can match zero characters and let the engine retry one position later, so
// `font-size: var(--text-base)` matches on the leading space. That bug made
// every clean stylesheet fail — caught by running the assertions against a
// known-good file, which is the only reason to write one.
const declValues = (css, prop) =>
  [...css.matchAll(new RegExp(`(?:^|[;{}\\s])${prop}\\s*:\\s*([^;}]+)`, "gi"))].map((m) => m[1].trim());

const stripVars = (value) => value.replace(/var\([^)]*\)/g, " ");
const keyword = /^(inherit|unset|initial|revert)$/i;

// A value is raw when something numeric survives token substitution.
const rawNumeric = (value, unit) => {
  if (keyword.test(value)) return false;
  const rest = stripVars(value);
  const found = rest.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unit}`, "g")) || [];
  return found.some((n) => Number.parseFloat(n) !== 0);
};

const rawLength = (value) => rawNumeric(value, "(?:px|rem|em|pt|vh|vw|ch)");
// `0`, `0px`, and `50%` are geometry, not theme — a sharp corner and a circle
// are not radius choices.
const rawRadius = (value) => value.trim() !== "50%" && rawLength(value);
const rawTime = (value) => rawNumeric(value, "m?s");

const BODY_SIZE_TOKEN = /--text-(xs|sm|base|md)\b/;

const stylesheetHrefs = (html) =>
  [...html.matchAll(/<link\b[^>]*>/gi)]
    .filter((m) => /rel\s*=\s*["']?stylesheet/i.test(m[0]))
    .map((m) => m[0].match(/href\s*=\s*["']([^"']+)["']/i)?.[1] ?? "");

export const editorialAssertions = (themeSource, otherCss, html) => {
  const other = stripComments(otherCss);
  const hrefs = stylesheetHrefs(html);
  const show = (values) => values.slice(0, 3).join(" | ") || "(none)";

  const badSizes = declValues(other, "font-size").filter(rawLength);
  const badRadii = declValues(other, "border-radius").filter(rawRadius);
  const badTimes = [
    ...declValues(other, "transition"),
    ...declValues(other, "transition-duration"),
    ...declValues(other, "animation"),
    ...declValues(other, "animation-duration"),
  ].filter(rawTime);

  const shared = /base-ui\.css$|accent-theme\.css$/;
  const editorialAt = hrefs.findIndex((h) => /editorial\.css$/.test(h));
  const baseUiAt = hrefs.findIndex((h) => /base-ui\.css$/.test(h));
  const firstAppOwnedAt = hrefs.findIndex((h, i) => i !== editorialAt && !shared.test(h));

  return [
    {
      ok: /--canvas\s*:/.test(themeSource) && /\[data-theme="ink-blush"\]/.test(themeSource),
      message: "editorial.css must be the unmodified theme asset (all families intact)",
    },
    {
      // After base-ui.css (whose values it re-states — if base-ui loads later
      // it silently wins back every token, including the dark set), and
      // before every app-owned stylesheet (which must stay free to override
      // the components base-ui defines).
      ok:
        editorialAt >= 0 &&
        (baseUiAt === -1 || baseUiAt < editorialAt) &&
        (firstAppOwnedAt === -1 || firstAppOwnedAt > editorialAt),
      message: `editorial.css must load after base-ui.css and before every app stylesheet — order is: ${hrefs.join(", ") || "(no stylesheet)"}`,
    },
    {
      ok: !RAW_COLOUR.test(other),
      message: `No stylesheet outside editorial.css may contain a raw colour — found: ${show(
        other
          .split(/[{}]/)
          .map((c) => c.trim())
          .filter((c) => RAW_COLOUR.test(c)),
      )}`,
    },
    {
      ok: badSizes.length === 0,
      message: `Every font-size must read a --text-* / --display-size token — found: ${show(badSizes)}`,
    },
    {
      ok: badRadii.length === 0,
      message: `Every border-radius must read a --radius-* token — found: ${show(badRadii)}`,
    },
    {
      ok: badTimes.length === 0,
      message: `Every transition/animation must read --ease / --ease-state / --ease-flash — found: ${show(badTimes)}`,
    },
    {
      // The one way this theme can end up WORSE than the neutral one it
      // replaces: a CJK serif (Songti SC / Noto Serif SC) at body size is
      // materially harder to read than the sans it displaced, and a
      // localized app is exactly where that shows. Serif is a display face
      // here, nothing else.
      ok: other
        .split("}")
        .filter((rule) => /--font-display/.test(rule))
        .every((rule) => !BODY_SIZE_TOKEN.test(rule)),
      message:
        "--font-display must not appear in a rule that sets a body size (--text-xs/sm/base/md); serif is display-only",
    },
    {
      // A family the operator cannot change is a hardcoded family with extra
      // steps. Whichever control the app ships, the attribute has to be
      // driven from somewhere.
      ok: /data-theme/.test(html) || /data-theme/.test(other),
      message: "The app must drive data-theme on <html> so the Style tab can change families",
    },
  ];
};
