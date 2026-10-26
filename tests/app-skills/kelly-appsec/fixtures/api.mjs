import { createServer } from "node:http";

export const startApiFixture = async (t) => {
  const requests = [];
  const outsideRequests = [];
  const state = { secure: false, writes: 0 };
  const outside = createServer((request, response) => {
    outsideRequests.push(request.url);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ id: "outside" }));
  });
  await new Promise((resolve) => outside.listen(0, "127.0.0.1", () => resolve(undefined)));
  const outsideAddress = outside.address();
  if (!outsideAddress || typeof outsideAddress === "string") throw new Error("Fixture listener missing");
  const outsideOrigin = `http://127.0.0.1:${outsideAddress.port}`;
  const api = createServer((request, response) => {
    const token = String(request.headers.authorization || "").replace(/^Bearer /, "");
    const actor =
      token === "synthetic-a-token"
        ? "a"
        : token === "synthetic-b-token"
          ? "b"
          : token === "synthetic-admin-token"
            ? "admin"
            : "anonymous";
    requests.push({ method: request.method, path: request.url, actor });
    const send = (status, body) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (request.url === "/redirect") {
      response.writeHead(302, { location: `${outsideOrigin}/outside` });
      response.end();
      return;
    }
    if (request.url === "/public") {
      send(200, { id: "public" });
      return;
    }
    if (request.url === "/neutral") {
      send(200, { id: "unrelated-public-response" });
      return;
    }
    if (request.url === "/denied-leak") {
      send(403, { id: "test-b", password: "synthetic-response-secret" });
      return;
    }
    if (request.url === "/write" && request.method === "POST") {
      state.writes++;
      send(200, { id: "write" });
      return;
    }
    if (request.url === "/orders/test-a") {
      send(
        actor === "a" || actor === "admin" ? 200 : 403,
        actor === "a" || actor === "admin" ? { id: "test-a", tenant: "tenant-a" } : { error: "forbidden" },
      );
      return;
    }
    if (request.url === "/orders/test-b") {
      const allowed = !state.secure || actor === "b" || actor === "admin";
      send(
        allowed ? 200 : 403,
        allowed ? { id: "test-b", tenant: "tenant-b", password: "synthetic-response-secret" } : { error: "forbidden" },
      );
      return;
    }
    send(404, { error: "not found" });
  });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = api.address();
  if (!address || typeof address === "string") throw new Error("Fixture listener missing");
  t.after(async () => {
    for (const server of [api, outside]) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });
  return { origin: `http://127.0.0.1:${address.port}`, requests, outsideRequests, state };
};

export const inventoryFixture = (revision = "rev-a") => ({
  schemaVersion: 1,
  sourceRevision: revision,
  endpoints: [
    { key: "own-a", method: "GET", path: "/orders/test-a", flow: "订单读取", location: "fixture:orders" },
    { key: "own-b", method: "GET", path: "/orders/test-b", flow: "订单读取", location: "fixture:orders" },
    { key: "public", method: "GET", path: "/public", flow: "公开分享", location: "fixture:public" },
    { key: "neutral", method: "GET", path: "/neutral", flow: "拒绝判断", location: "fixture:neutral" },
    { key: "leak", method: "GET", path: "/denied-leak", flow: "字段泄露", location: "fixture:leak" },
    { key: "redirect", method: "GET", path: "/redirect", flow: "重定向边界", location: "fixture:redirect" },
  ],
  rules: [
    {
      key: "own-a",
      endpointKey: "own-a",
      identity: "user-a",
      expectation: "allow",
      expectedStatuses: [200],
      assertions: [{ path: "id", equals: "test-a" }],
      objectId: "test-a",
      policyNote: "测试用户可读自己的订单。",
      confirmed: true,
    },
    {
      key: "own-b",
      endpointKey: "own-b",
      identity: "user-b",
      expectation: "allow",
      expectedStatuses: [200],
      assertions: [{ path: "id", equals: "test-b" }],
      objectId: "test-b",
      policyNote: "另一测试用户可读自己的订单。",
      confirmed: true,
    },
    {
      key: "cross-b",
      endpointKey: "own-b",
      identity: "user-a",
      expectation: "deny",
      expectedStatuses: [403, 404],
      forbiddenAssertions: [{ path: "id", equals: "test-b" }],
      objectId: "test-b",
      baselineRuleKey: "own-b",
      policyNote: "用户 A 不得读取用户 B 的私有订单。",
      confirmed: true,
    },
    {
      key: "public",
      endpointKey: "public",
      identity: "anonymous",
      expectation: "allow",
      expectedStatuses: [200],
      assertions: [{ path: "id", equals: "public" }],
      objectId: "public",
      policyNote: "此公开资源允许匿名读取。",
      confirmed: true,
    },
    {
      key: "neutral",
      endpointKey: "neutral",
      identity: "user-a",
      expectation: "deny",
      expectedStatuses: [403],
      forbiddenAssertions: [{ path: "id", equals: "test-b" }],
      objectId: "test-b",
      baselineRuleKey: "own-b",
      policyNote: "状态码异常但无对象泄露证据时需继续调查。",
      confirmed: true,
    },
    {
      key: "leak",
      endpointKey: "leak",
      identity: "user-a",
      expectation: "deny",
      expectedStatuses: [403],
      forbiddenAssertions: [{ path: "id", equals: "test-b" }],
      objectId: "test-b",
      baselineRuleKey: "own-b",
      policyNote: "拒绝状态也不能返回另一个测试对象。",
      confirmed: true,
    },
    {
      key: "redirect",
      endpointKey: "redirect",
      identity: "user-a",
      expectation: "allow",
      expectedStatuses: [200],
      assertions: [{ path: "id", equals: "outside" }],
      policyNote: "当前来源授权不能扩大到重定向来源。",
      confirmed: true,
    },
  ],
});
