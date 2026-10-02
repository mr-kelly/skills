export function enforceRecipientScopedReview<T extends Record<string, any>>(classification: T, recipient = ""): T {
  if (!recipient) return classification;
  return {
    ...classification,
    status: "needs_review",
    proposed_action: "review",
    reason:
      classification.status === "needs_review"
        ? classification.reason
        : `Recipient-scoped support intake requires semantic review before cleanup. Rule prefilter: ${classification.reason}`,
  };
}
