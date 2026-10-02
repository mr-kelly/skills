let pending;
export const getRuntime = () =>
  (pending ||= fetch("__airapp/runtime", { headers: { accept: "application/json" } })
    .then((response) =>
      response.ok && response.headers.get("content-type")?.includes("application/json") ? response.json() : null,
    )
    .then((body) =>
      body && typeof body.hosted === "boolean"
        ? { ...body, determined: true }
        : { runtime: "unknown", hosted: false, determined: false },
    )
    .catch(() => ({ runtime: "unknown", hosted: false, determined: false })));
