const operationKey = (value) => {
  let result = 2166136261;
  for (const c of value) result = Math.imul(result ^ c.charCodeAt(0), 16777619);
  return (result >>> 0).toString(16);
};
export const parseJson = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("INVALID_JSON_FIELD");
  }
};
export const redact = (value) =>
  String(typeof value === "string" ? value : JSON.stringify(value ?? null))
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, "[PRIVATE KEY REDACTED]")
    .replace(/\b((?:set-)?cookie\s*:)\s*[^\r\n]+/gi, "$1 [REDACTED]")
    .replace(
      /(["'][^"']*(?:password|passwd|secret|token|api[_-]?key|authorization|cookie|session|credential)[^"']*["']\s*:\s*)(["'])(.*?)\2/gi,
      '$1"[REDACTED]"',
    )
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=:-]+/gi, "[AUTHORIZATION REDACTED]")
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]*:[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/((?:--user|--password|--token|-u)(?:\s+|=))(?:"[^"]*"|'[^']*'|[^\s]+)/g, "$1[REDACTED]")
    .replace(
      /((?:password|passwd|secret|token|api[_-]?key|authorization|cookie|session|credential)[\w-]*\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s&;]+)/gi,
      "$1[REDACTED]",
    )
    .replace(/([?&][^=&#\s]+)=([^&#\s]*)/g, "$1=[REDACTED]")
    .split("")
    .filter((character) => {
      const n = character.charCodeAt(0);
      return (
        n === 9 ||
        n === 10 ||
        n === 13 ||
        (n >= 32 && n !== 127 && !(n >= 0x202a && n <= 0x202e) && !(n >= 0x2066 && n <= 0x2069))
      );
    })
    .join("");
const object = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const text = (value, name, maximum = 500) => {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(`INVALID_${name}`);
  return value.trim();
};
export const key = (value) => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value || "")) throw new Error("INVALID_BUSINESS_KEY");
  return value;
};
export const validateOrigin = (value) => {
  const url = new URL(value);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" && !(local && url.protocol === "http:"))
  )
    throw new Error("INVALID_TEST_ORIGIN");
  return url.origin;
};
export const validatePath = (value) => {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.length > 1000 ||
    /[\r\n\\#]/.test(value)
  )
    throw new Error("INVALID_ENDPOINT_PATH");
  let decoded = value;
  for (let i = 0; i < 2; i++) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      throw new Error("INVALID_ENDPOINT_ENCODING");
    }
  }
  if (decoded.split(/[/?]/).includes("..") || /[\r\n\\#]/.test(decoded) || decoded.startsWith("//"))
    throw new Error("INVALID_ENDPOINT_PATH");
  return value;
};
const assertions = (values = []) => {
  if (!Array.isArray(values) || values.length > 20) throw new Error("INVALID_ASSERTIONS");
  return values.map((entry) => {
    if (
      !object(entry) ||
      typeof entry.path !== "string" ||
      !/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(entry.path) ||
      entry.path.split(".").some((part) => ["__proto__", "constructor", "prototype"].includes(part)) ||
      !["string", "number", "boolean"].includes(typeof entry.equals)
    )
      throw new Error("INVALID_ASSERTION");
    return { path: entry.path, equals: entry.equals };
  });
};
const checkSecrets = (value) => {
  if (Array.isArray(value)) {
    for (const item of value) checkSecrets(item);
    return;
  }
  if (!object(value)) return;
  for (const [name, entry] of Object.entries(value)) {
    if (
      /^(?:authorization|cookie|password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|headers)$/i.test(
        name,
      )
    )
      throw new Error("CREDENTIALS_MUST_STAY_LOCAL");
    checkSecrets(entry);
  }
};
export const validateCase = (input) => {
  if (!object(input)) throw new Error("INVALID_RULE");
  checkSecrets(input.requestBody);
  const result = {
    key: key(input.key),
    endpointKey: key(input.endpointKey),
    identity: key(input.identity),
    expectation: input.expectation,
    expectedStatuses: input.expectedStatuses,
    assertions: assertions(input.assertions),
    forbiddenAssertions: assertions(input.forbiddenAssertions),
    objectId: input.objectId ? key(input.objectId) : "",
    requestBody: input.requestBody ?? null,
    baselineRuleKey: input.baselineRuleKey ? key(input.baselineRuleKey) : "",
    policyNote: text(input.policyNote, "POLICY_NOTE", 4000),
    confirmed: input.confirmed === true,
    mutating: input.mutating === true,
  };
  if (
    !["allow", "deny"].includes(result.expectation) ||
    !Array.isArray(result.expectedStatuses) ||
    !result.expectedStatuses.length ||
    result.expectedStatuses.length > 8 ||
    result.expectedStatuses.some((status) => !Number.isInteger(status) || status < 100 || status > 599)
  )
    throw new Error("INVALID_EXPECTATION");
  if (result.expectation === "allow" && !result.assertions.length) throw new Error("ALLOW_REQUIRES_DATA_ASSERTION");
  if (result.expectation === "deny" && (!result.baselineRuleKey || !result.forbiddenAssertions.length))
    throw new Error("DENY_REQUIRES_BASELINE_AND_FORBIDDEN_DATA_ASSERTION");
  if (JSON.stringify(result.requestBody).length > 16384) throw new Error("REQUEST_BODY_TOO_LARGE");
  return result;
};
export const validateInventory = (document) => {
  if (!object(document) || document.schemaVersion !== 1) throw new Error("UNSUPPORTED_INVENTORY_SCHEMA");
  if (JSON.stringify(document).length > 1048576) throw new Error("INVENTORY_TOO_LARGE");
  const sourceRevision = text(document.sourceRevision, "SOURCE_REVISION", 200);
  if (
    !Array.isArray(document.endpoints) ||
    !document.endpoints.length ||
    document.endpoints.length > 50 ||
    !Array.isArray(document.rules || []) ||
    (document.rules || []).length > 50
  )
    throw new Error("INVENTORY_PAGE_BUDGET_EXCEEDED");
  const endpoints = document.endpoints.map((entry) => {
    if (!object(entry)) throw new Error("INVALID_ENDPOINT");
    const method = String(entry.method || "").toUpperCase();
    if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(method))
      throw new Error("INVALID_METHOD");
    return {
      key: key(entry.key),
      method,
      path: validatePath(entry.path),
      flow: String(entry.flow || "待确认业务流程").slice(0, 200),
      location: String(entry.location || "手工清单").slice(0, 500),
      operationId: String(entry.operationId || "").slice(0, 200),
    };
  });
  const keys = new Set(endpoints.map((entry) => entry.key));
  if (keys.size !== endpoints.length) throw new Error("DUPLICATE_ENDPOINT_KEY");
  const rules = (document.rules || []).map(validateCase);
  const ruleKeys = new Set(rules.map((entry) => entry.key));
  if (ruleKeys.size !== rules.length) throw new Error("DUPLICATE_RULE_KEY");
  for (const rule of rules) {
    if (!keys.has(rule.endpointKey)) throw new Error("RULE_ENDPOINT_NOT_IN_IMPORT");
    if (
      rule.baselineRuleKey &&
      !rules.some((other) => other.key === rule.baselineRuleKey && other.expectation === "allow")
    )
      throw new Error("MISSING_ALLOW_BASELINE");
    const endpoint = endpoints.find((entry) => entry.key === rule.endpointKey);
    if (!["GET", "HEAD", "OPTIONS"].includes(endpoint.method) && !rule.mutating)
      throw new Error("WRITE_METHOD_REQUIRES_MUTATING_DECLARATION");
  }
  return { schemaVersion: 1, sourceRevision, endpoints, rules };
};
export const parseOpenApi = (document, { sourceRevision = "", sourceLocation = "openapi.json" } = {}) => {
  if (
    !object(document) ||
    !/^(?:3\.|2\.)/.test(String(document.openapi || document.swagger || "")) ||
    !object(document.paths)
  )
    throw new Error("UNSUPPORTED_OPENAPI_DOCUMENT");
  const endpoints = [];
  for (const [path, methods] of Object.entries(document.paths))
    for (const [method, details] of Object.entries(methods)) {
      if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(method)) continue;
      // Path templates are inventory only; dynamic rules need explicit fixture paths.
      endpoints.push({
        key: `api-${operationKey(`${method}:${path}`)}`,
        method: method.toUpperCase(),
        path: validatePath(path),
        flow: Array.isArray(details.tags) ? String(details.tags[0] || "待确认业务流程") : "待确认业务流程",
        location: `${sourceLocation}#/paths/${path}/${method}`,
        operationId: String(details.operationId || ""),
      });
    }
  if (!endpoints.length || endpoints.length > 50)
    throw new Error("OPENAPI_IMPORT_REQUIRES_ONE_EXPLICIT_PAGE_UP_TO_50_ENDPOINTS");
  return validateInventory({
    schemaVersion: 1,
    sourceRevision: text(sourceRevision, "SOURCE_REVISION", 200),
    endpoints,
    rules: [],
  });
};
const at = (value, path) =>
  path
    .split(".")
    .reduce(
      (current, part) =>
        current !== null && typeof current === "object" && Object.hasOwn(current, part) ? current[part] : undefined,
      value,
    );
const satisfies = (body, assertion) => at(body, assertion.path) === assertion.equals;
export const evaluateResponse = (rule, response) => {
  const expected = rule.expectedStatuses.includes(response.status);
  const forbidden = rule.forbiddenAssertions.some((entry) => satisfies(response.body, entry));
  const matches = rule.assertions.every((entry) => satisfies(response.body, entry));
  if (!rule.confirmed) return { result: "inconclusive", summary: "业务规则尚未确认；结果保留为待判断证据。" };
  if (rule.expectation === "deny") {
    if (!response.baselineSatisfied)
      return { result: "inconclusive", summary: "正向基线尚未成功，不能仅凭状态码证明拒绝规则有效。" };
    if (forbidden) return { result: "violated", summary: "实际返回了规则明确禁止的受控对象数据；需人工复核。" };
    return expected
      ? { result: "satisfied", summary: "拒绝状态符合规则，且未命中指定禁止数据断言；只覆盖本次断言范围。" }
      : { result: "inconclusive", summary: "实际状态不符合预期，但没有足够证据确认越权。" };
  }
  if (forbidden) return { result: "violated", summary: "实际返回包含规则禁止的字段值，需复核对象/字段授权。" };
  return expected && matches
    ? { result: "satisfied", summary: "正向状态和受控对象断言符合已确认规则。" }
    : { result: "inconclusive", summary: "正向基线或返回内容不符合预期，需检查测试前提。" };
};
export const storedCase = (row) =>
  validateCase({
    key: row.fields["record-key"].split(":").at(-1),
    endpointKey: "stored-endpoint",
    identity: row.fields.identity,
    expectation: row.fields.expectation,
    expectedStatuses: parseJson(row.fields["expected-statuses"], []),
    assertions: parseJson(row.fields.assertions, []),
    forbiddenAssertions: parseJson(row.fields["forbidden-assertions"], []),
    objectId: row.fields["object-id"] || "",
    requestBody: parseJson(row.fields["request-body"]),
    baselineRuleKey: row.fields["baseline-rule-key"] || "",
    policyNote: row.fields["policy-note"],
    confirmed: row.fields.confirmed,
    mutating: row.fields.mutating,
  });

// Busabase scalar fields store bounded JSON documents as explicit text; relations
// remain real relation fields. Decode only at the domain boundary.
const jsonFields = new Set([
  "expected-statuses",
  "assertions",
  "forbidden-assertions",
  "request-body",
  "rule-snapshot",
]);
export const encodeFields = (fields) =>
  Object.fromEntries(
    Object.entries(fields).map(([name, value]) => [
      name,
      jsonFields.has(name) && typeof value !== "string" ? JSON.stringify(value) : value,
    ]),
  );
