// Kelly MV's Busabase resource map. One workspace = exactly one MV project
// (song + concept + cast + storyboard) — the retired local-file app's
// "library of many projects with a project switcher" was vestigial (never
// exercised by the UI schema doc, never demonstrated) and is dropped here,
// same as every other converted skill models one workspace per AirApp
// instance. `readLimit` stays <= 100 everywhere per the migration recipe.
//
// Binary media (uploaded MP3, character reference images, shot images/
// videos) are NOT stored as Base fields — they are real Busabase Drive Asset
// uploads via busabase-sdk's `assets` client (createUploadUrl -> PUT bytes ->
// confirm), and only the returned `assetId` is stored as a text field on the
// owning record. See js/mv-client.js for the upload/read helpers and
// references/ui-schema.md for the field <-> asset mapping.
export const appConfig = {
  appId: "kelly-mv",
  appName: "Kelly MV",
  deployment: "cloud",
  locale: "auto",
  readOnly: false,
  spaceId: "",
  schemaVersion: 1,
  folder: {
    name: "Kelly MV",
    description: "Music-video workspace: song, concept, cast reference cards, and storyboard shots",
    slug: "kelly-mv",
  },
  airApp: { name: "Kelly MV", slug: "kelly-mv-app", resourceKey: "kelly-mv-app" },
  bases: [
    {
      key: "project",
      name: "Project",
      slug: "kelly-mv-project",
      description: "Single-row MV project meta: song metadata + concept (treatment)",
      readLimit: 5,
      fields: [
        { slug: "project-id", name: "Project ID", type: "text", required: true },
        { slug: "song-title", name: "Song title", type: "text", required: false },
        { slug: "song-artist", name: "Song artist", type: "text", required: false },
        { slug: "song-audio-asset-id", name: "Song audio asset ID", type: "text", required: false },
        { slug: "song-duration-seconds", name: "Song duration seconds", type: "number", required: false },
        { slug: "song-source", name: "Song source", type: "text", required: false },
        { slug: "song-uploaded-at", name: "Song uploaded at", type: "text", required: false },
        { slug: "treatment-summary", name: "Treatment summary", type: "longtext", required: false },
        { slug: "treatment-look", name: "Treatment look", type: "longtext", required: false },
        { slug: "treatment-aspect-ratio", name: "Treatment aspect ratio", type: "text", required: false },
        { slug: "updated-at", name: "Updated at", type: "text", required: false },
      ],
    },
    {
      key: "settings",
      name: "Settings",
      slug: "kelly-mv-settings",
      description: "One row (record-id: config): image/song/video generation backend settings",
      readLimit: 5,
      fields: [
        { slug: "record-id", name: "Record ID", type: "text", required: true },
        { slug: "image-base-url", name: "Image base URL", type: "text", required: false },
        { slug: "image-model", name: "Image model", type: "text", required: false },
        { slug: "image-size", name: "Image size", type: "text", required: false },
        { slug: "song-draft-backend", name: "Song draft backend", type: "text", required: false },
        { slug: "video-draft-backend", name: "Video draft backend", type: "text", required: false },
        { slug: "video-width", name: "Video width", type: "number", required: false },
        { slug: "video-height", name: "Video height", type: "number", required: false },
        { slug: "video-fps", name: "Video fps", type: "number", required: false },
        { slug: "video-max-frames", name: "Video max frames", type: "number", required: false },
      ],
    },
    {
      key: "cast",
      name: "Cast",
      slug: "kelly-mv-cast",
      description: "On-screen characters with three-view visual notes and a reference-card image",
      readLimit: 100,
      fields: [
        { slug: "character-id", name: "Character ID", type: "text", required: true },
        { slug: "name", name: "Name", type: "text", required: false },
        { slug: "role", name: "Role", type: "text", required: false },
        { slug: "status", name: "Status", type: "text", required: false },
        { slug: "actor-profile", name: "Actor profile", type: "longtext", required: false },
        { slug: "visual-front", name: "Visual front", type: "longtext", required: false },
        { slug: "visual-side", name: "Visual side", type: "longtext", required: false },
        { slug: "visual-back", name: "Visual back", type: "longtext", required: false },
        { slug: "wardrobe", name: "Wardrobe", type: "longtext", required: false },
        { slug: "anchors-json", name: "Anchors JSON", type: "longtext", required: false },
        { slug: "forbidden-drift-json", name: "Forbidden drift JSON", type: "longtext", required: false },
        { slug: "reference-card-status", name: "Reference card status", type: "text", required: false },
        { slug: "reference-card-prompt", name: "Reference card prompt", type: "longtext", required: false },
        { slug: "reference-card-asset-id", name: "Reference card asset ID", type: "text", required: false },
        { slug: "reference-card-generated-at", name: "Reference card generated at", type: "text", required: false },
        {
          slug: "reference-card-generation-json",
          name: "Reference card generation JSON",
          type: "longtext",
          required: false,
        },
        { slug: "deleted", name: "Deleted", type: "text", required: false },
      ],
    },
    {
      key: "shots",
      name: "Shots",
      slug: "kelly-mv-shots",
      description: "Ordered storyboard shots, each with a scene description and image + video candidates",
      readLimit: 100,
      fields: [
        { slug: "shot-id", name: "Shot ID", type: "text", required: true },
        { slug: "position", name: "Position", type: "number", required: false },
        { slug: "title", name: "Title", type: "text", required: false },
        { slug: "status", name: "Status", type: "text", required: false },
        { slug: "description", name: "Description", type: "longtext", required: false },
        { slug: "negative-prompt", name: "Negative prompt", type: "longtext", required: false },
        { slug: "video-prompt", name: "Video prompt", type: "longtext", required: false },
        { slug: "duration-seconds", name: "Duration seconds", type: "number", required: false },
        { slug: "characters-json", name: "Characters JSON", type: "longtext", required: false },
        { slug: "image-asset-id", name: "Image asset ID", type: "text", required: false },
        { slug: "image-status", name: "Image status", type: "text", required: false },
        { slug: "image-generated-at", name: "Image generated at", type: "text", required: false },
        { slug: "image-generation-json", name: "Image generation JSON", type: "longtext", required: false },
        { slug: "image-candidates-json", name: "Image candidates JSON", type: "longtext", required: false },
        { slug: "video-asset-id", name: "Video asset ID", type: "text", required: false },
        { slug: "video-status", name: "Video status", type: "text", required: false },
        { slug: "video-generated-at", name: "Video generated at", type: "text", required: false },
        { slug: "video-generation-json", name: "Video generation JSON", type: "longtext", required: false },
        { slug: "video-candidates-json", name: "Video candidates JSON", type: "longtext", required: false },
        { slug: "deleted", name: "Deleted", type: "text", required: false },
      ],
    },
  ],
  permissions: {
    readProcedures: ["nodes.list", "nodes.get", "bases.get", "records.list"],
    setupProcedures: ["nodes.createChangeRequest", "nodes.updateMetadata"],
    writeProcedures: ["records.changeRequest", "bases.createChangeRequest"],
  },
};
