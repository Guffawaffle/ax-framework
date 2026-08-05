export async function observeTimerFixture(descriptor, context) {
  const target = descriptor.subject?.readyAfterObservations;
  if (
    descriptor.condition?.type !== "observation-count" ||
    !Number.isInteger(target) ||
    target < 1
  ) {
    throw new Error(
      "test.timer requires condition.type='observation-count' and a positive readyAfterObservations",
    );
  }

  const complete = context.observationCount >= target;
  return {
    outcome: complete ? "satisfied" : "pending",
    retryAfterMs: 25,
    evidence: {
      observationCount: context.observationCount,
      readyAfterObservations: target,
    },
  };
}
