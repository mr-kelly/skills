// Copy into the generated `scripts/check.mjs` assertions array.
//
// `source` is the concatenated browser code (include `app/js/runtime.js` in the
// list that builds it); `serverSource` is `server.js`.
//
// These exist because prose alone did not hold. Sixty-five generated Apps had
// independently reinvented the same loopback-hostname test, and one App's check
// script had gone as far as REQUIRING it. A rule that is only written down gets
// re-derived; a rule that fails the build does not.
export const runtimeDetectionAssertions = (source, serverSource) => [
  {
    ok: !/location\s*\.\s*hostname|window\.self\s*!==\s*window\.top/.test(source),
    message: "Runtime must not be inferred from the hostname or from iframe nesting",
  },
  {
    ok: source.includes("__airapp/runtime"),
    message: "Browser code must probe the injected runtime at __airapp/runtime",
  },
  {
    // Relative on purpose: under the Local Node engine the App is served from a
    // sub-path of busabase's origin, where a leading slash resolves against the
    // origin root instead and 404s.
    ok: !/["'`]\/__airapp\/runtime/.test(source),
    message: "Runtime probe must be relative (__airapp/runtime), without a leading slash",
  },
  {
    ok: serverSource.includes("process.env.BUSABASE_AIRAPP_RUNTIME") && serverSource.includes('"/__airapp/runtime"'),
    message: "Server must expose the injected runtime at /__airapp/runtime",
  },
];
