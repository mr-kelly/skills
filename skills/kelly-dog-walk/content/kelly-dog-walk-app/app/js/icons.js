// Small stroke icons, drawn in currentColor so every colour comes from the stylesheet's tokens.
const svg = (body, label = "") =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${body}</svg>`;

const PATHS = {
  // Verdicts: a tick for dry, a rain cloud, a sun, a clock for off-hours, a dashed ring for pending.
  没淋: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.2 9.5"/>',
  淋雨: '<path d="M7 14.5h9.5a3.5 3.5 0 0 0 .4-7A5.2 5.2 0 0 0 7 8.6a3 3 0 0 0 0 5.9z"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5"/>',
  太热: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  不方便: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
  待判: '<circle cx="12" cy="12" r="9" stroke-dasharray="3.2 3.2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  timeline: '<path d="M6 4v16"/><circle cx="6" cy="7" r="2"/><circle cx="6" cy="17" r="2"/><path d="M10 7h9M10 17h7"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.8"/><path d="M12 17h.01"/>',
  panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  dog: '<path d="M12 13c-2.7 0-5.2 2.4-5.2 4.7 0 1.5 1.3 2.4 2.8 2.1.9-.2 1.6-.6 2.4-.6s1.5.4 2.4.6c1.5.3 2.8-.6 2.8-2.1 0-2.3-2.5-4.7-5.2-4.7z"/><circle cx="5.6" cy="10.4" r="1.7"/><circle cx="9.2" cy="6.2" r="1.8"/><circle cx="14.8" cy="6.2" r="1.8"/><circle cx="18.4" cy="10.4" r="1.7"/>',
  merge:
    '<circle cx="6" cy="6" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="12" r="2.2"/><path d="M6 8.2v7.6M8 6.6c4.2.6 7.5 2.6 8.3 3.7"/>',
  gavel: '<path d="M14.5 4.5l5 5M12 7l5 5M9.5 9.5l5 5M4 20l7-7"/>',
  archive:
    '<rect x="3.5" y="4.5" width="17" height="4" rx="1"/><path d="M5 8.5v10a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-10M10 12.5h4"/>',
  x: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
};

export const icon = (name, label = "") => svg(PATHS[name] || PATHS.待判, label);
