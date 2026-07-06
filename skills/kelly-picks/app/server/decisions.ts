// The develop/watch/drop decision model now lives in lib/picks-core.ts (pure,
// storage-agnostic) and the write path (saveDecision) lives in the data provider.
// This module re-exports the pure pieces so existing scripts imports keep working
// unchanged.
export {
  applyDecisions,
  CANDIDATE_ACTIONS,
  DECISION_KINDS,
  PROPOSAL_ACTIONS,
  stageForCandidateAction,
  statusForProposalAction,
  TREND_ACTIONS,
} from "../../lib/picks-core.ts";
