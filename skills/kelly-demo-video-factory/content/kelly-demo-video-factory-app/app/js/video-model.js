// Pure read-side domain logic for Kelly Demo Video Factory: normalize
// Busabase record fields into plain video/shot rows, join shots to their
// video client-side (the inverse `shots` relation on a video record is only
// backfilled per-record by scripts/propose_video.mjs --merge, not computed
// live — see config.js's comment), and roll up per-video recording progress.
// Ported from the retired app/server/hono.ts's loadWorkspace()/shotCounts()
// (server-side JSON API) onto plain browser-side functions — same field
// names, same rollup shape, same "pending" default for a shot with no
// recording-status value yet.

export function normalizeVideoRow(row = {}) {
  return {
    id: row.__recordId || row.id || "",
    title: row.title || "",
    series: row.series || "",
    purpose: row.purpose || "",
    hook: row.hook || "",
    pain_point: row.pain_point || "",
    concept: row.concept || "",
    status: row.status || "idea",
    verified_claims: row.verified_claims || "",
    hyperframe_path: row.hyperframe_path || "",
    final_video_url: row.final_video_url || "",
    owner: row.owner || "",
  };
}

export function normalizeShotRow(row = {}) {
  return {
    id: row.__recordId || row.id || "",
    video: row.video || "",
    shot_number: Number(row.shot_number) || 0,
    timecode: row.timecode || "",
    scene: row.scene || "",
    code_reference: row.code_reference || "—",
    script_line: row.script_line || "",
    note: row.note || "",
    recording_status: row.recording_status || "pending",
  };
}

/** Every shot whose `video` field points at videoId, sorted by shot_number. */
export function shotsForVideo(shots, videoId) {
  return shots.filter((shot) => shot.video === videoId).sort((a, b) => a.shot_number - b.shot_number);
}

/** { total, byStatus: {pending: n, recorded: n, needs_reshoot: n} } for one video. */
export function shotCounts(shots, videoId) {
  const mine = shotsForVideo(shots, videoId);
  const byStatus = {};
  for (const shot of mine) {
    byStatus[shot.recording_status] = (byStatus[shot.recording_status] ?? 0) + 1;
  }
  return { total: mine.length, byStatus };
}

/** Videos joined with their shot-recording rollup, ready for the list view. */
export function withShotRollup(videos, shots) {
  return videos.map((video) => ({ ...video, shots: shotCounts(shots, video.id) }));
}

export function buildState(videos, shots, { demo = false } = {}) {
  return {
    app: "kelly-demo-video-factory",
    demo,
    videoCount: videos.length,
    videos: withShotRollup(videos, shots),
    shots,
  };
}
