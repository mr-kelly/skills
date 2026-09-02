export const appConfig = {
  appId: "kelly-followups",
  appName: "Kelly Followups",
  deployment: "cloud",
  locale: "auto",
  readOnly: false,
  spaceId: "",
  schemaVersion: 1,
  folder: {
    name: "Kelly Followups",
    description: "会后跟进：谁、跟进什么事、什么时候该完成",
    slug: "kelly-followups",
  },
  airApp: { name: "Kelly Followups", slug: "kelly-followups-app", resourceKey: "kelly-followups-app" },
  bases: [
    {
      key: "followups",
      name: "跟进事项",
      slug: "kelly-followups-followups",
      description: "会后记的跟进：谁、跟进什么事、什么时候该完成",
      readLimit: 100,
      fields: [
        { slug: "record-id", name: "记录 ID", type: "text", required: true },
        { slug: "meeting", name: "来自哪个会", type: "text", required: false },
        { slug: "person", name: "跟进谁", type: "text", required: true },
        { slug: "action", name: "跟进什么事", type: "longtext", required: true },
        { slug: "due", name: "什么时候该完成", type: "text", required: false },
        { slug: "status", name: "状态", type: "text", required: false },
        { slug: "created-at", name: "创建时间", type: "text", required: false },
      ],
    },
  ],
  permissions: {
    readProcedures: ["nodes.list", "nodes.get", "bases.get", "records.list", "records.count"],
    setupProcedures: ["nodes.createChangeRequest", "nodes.updateMetadata"],
    writeProcedures: ["records.changeRequest", "bases.createChangeRequest"],
  },
};
