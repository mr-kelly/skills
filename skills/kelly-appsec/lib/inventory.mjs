import { parseOpenApi, validateInventory } from "./domain.mjs";

export const importInventory = async (
  store,
  { projectId, document, sourceRevision = "", sourceLocation = "openapi.json" },
) => {
  const project = await store.get("projects", projectId);
  const inventory =
    document.openapi || document.swagger
      ? parseOpenApi(document, { sourceRevision, sourceLocation })
      : validateInventory(document);
  if (inventory.sourceRevision !== project.fields["source-revision"]) throw new Error("IMPORT_REVISION_MISMATCH");
  const endpoints = new Map();
  for (const endpoint of inventory.endpoints) {
    const recordKey = `${projectId}:${inventory.sourceRevision}:${endpoint.key}`;
    const record = await store.create(
      "endpoints",
      {
        title: `${endpoint.method} ${endpoint.path}`,
        "record-key": recordKey,
        "project-reference": projectId,
        "source-revision": inventory.sourceRevision,
        method: endpoint.method,
        path: endpoint.path,
        "operation-id": endpoint.operationId,
        "business-flow": endpoint.flow,
        "source-location": endpoint.location,
        discovery: document.openapi || document.swagger ? "documented" : "manual",
        project: projectId,
      },
      recordKey,
    );
    endpoints.set(endpoint.key, record);
  }
  const rules = [];
  for (const rule of inventory.rules) {
    const endpoint = endpoints.get(rule.endpointKey);
    const recordKey = `${projectId}:${inventory.sourceRevision}:${rule.key}`;
    rules.push(
      await store.create(
        "rules",
        {
          title: `${rule.identity} · ${endpoint.fields.title} · ${rule.expectation === "allow" ? "应允许" : "应拒绝"}`,
          "record-key": recordKey,
          "project-reference": projectId,
          "endpoint-reference": endpoint.id,
          "source-revision": inventory.sourceRevision,
          identity: rule.identity,
          expectation: rule.expectation,
          "expected-statuses": rule.expectedStatuses,
          assertions: rule.assertions,
          "forbidden-assertions": rule.forbiddenAssertions,
          "object-id": rule.objectId,
          "request-body": rule.requestBody,
          "baseline-rule-key": rule.baselineRuleKey,
          "policy-note": rule.policyNote,
          confirmed: rule.confirmed,
          mutating: rule.mutating,
          project: projectId,
          endpoint: endpoint.id,
        },
        recordKey,
      ),
    );
  }
  return { endpoints: [...endpoints.values()], rules, sourceRevision: inventory.sourceRevision };
};
