// The store's filesystem + snapshot-math logic now lives in the data-provider
// layer: lib/common.ts holds the provider-neutral helpers (fs primitives,
// recompute / metrics / merge, config + env loading, enum vocabularies) and
// lib/data-provider/local-file-provider.ts holds the read/write of the .data/*
// handoff files. This file re-exports the shared helpers so demo.ts and the
// scripts can keep importing "./store.ts" / "../app/server/store.ts" unchanged.
//
// The stateful decision path (applyDecision) moved onto the provider; callers go
// through createProvider().saveDecision(...) instead.
export * from "../../lib/common.ts";
