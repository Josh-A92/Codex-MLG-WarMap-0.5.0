(function initializeApplicationMutationCoordinatorFactory(globalScope) {
  const FACTORY_FIELDS = new Set(["participants", "auditRecordService", "createTransactionId"]);

  class ApplicationMutationCoordinatorError extends Error {
    constructor(code, message, options) {
      super(message);
      this.name = "ApplicationMutationCoordinatorError";
      this.code = code;
      if (options && Object.prototype.hasOwnProperty.call(options, "cause")) this.cause = options.cause;
      if (options && Array.isArray(options.rollbackErrors)) this.rollbackErrors = options.rollbackErrors.slice();
    }
  }

  function fail(code, message, options) {
    throw new ApplicationMutationCoordinatorError(code, message, options);
  }

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function requireOptions(value) {
    if (!isRecord(value)) fail("invalid_factory", "options must be a plain object.");
    const unknown = Object.keys(value).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknown.length > 0) fail("invalid_factory", `options.${unknown[0]} is not supported.`);
    if (!Array.isArray(value.participants) || value.participants.length === 0) {
      fail("invalid_factory", "options.participants must be a non-empty array.");
    }
    return value;
  }

  function bindParticipants(value) {
    return value.map((participant, index) => {
      if (participant === null || typeof participant !== "object" || Array.isArray(participant)) {
        fail("invalid_factory", `options.participants[${index}] must be an object.`);
      }
      if (typeof participant.captureTransactionState !== "function") {
        fail("invalid_factory", `options.participants[${index}].captureTransactionState is required.`);
      }
      if (typeof participant.restoreTransactionState !== "function") {
        fail("invalid_factory", `options.participants[${index}].restoreTransactionState is required.`);
      }
      return {
        capture: participant.captureTransactionState.bind(participant),
        restore: participant.restoreTransactionState.bind(participant)
      };
    });
  }

  function createApplicationMutationCoordinator(options) {
    const input = requireOptions(options);
    const participants = bindParticipants(input.participants);
    const auditRecordService = input.auditRecordService || null;
    const createTransactionId = input.createTransactionId || null;
    let queueTail = Promise.resolve();

    async function runMutation(mutation, durableCommit, auditIntent) {
      if (typeof mutation !== "function") fail("invalid_mutation", "mutation must be a function.");
      if (typeof durableCommit !== "function") fail("invalid_commit", "durableCommit must be a function.");

      const snapshots = [];
      for (const participant of participants) snapshots.push(await participant.capture());

      try {
        let transactionId = null;
        if (auditIntent) {
          if (!auditRecordService || !createTransactionId) fail("invalid_audit", "Audit intent requires auditRecordService and createTransactionId.");
          if (Object.prototype.hasOwnProperty.call(auditIntent, "transactionId")) {
            fail("forged_audit_metadata", "auditIntent.transactionId is system-controlled.");
          }
          transactionId = createTransactionId();
          if (typeof transactionId !== "string" || transactionId.trim() === "") {
            fail("invalid_dependency", "createTransactionId must return a non-empty string.");
          }
        }
        const result = await mutation(transactionId);
        if (auditIntent) {
          await auditRecordService.append({ ...auditIntent, transactionId, sequence: 1 });
        }
        await durableCommit(result);
        return result;
      } catch (operationError) {
        const rollbackErrors = [];
        for (let index = participants.length - 1; index >= 0; index -= 1) {
          try {
            await participants[index].restore(snapshots[index]);
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
        }
        if (rollbackErrors.length > 0) {
          fail(
            "rollback_failed",
            "Application Mutation Coordinator could not fully restore mutation state.",
            { cause: operationError, rollbackErrors }
          );
        }
        throw operationError;
      }
    }

    function execute(mutation, durableCommit, auditIntent) {
      const queued = queueTail.then(
        () => runMutation(mutation, durableCommit, auditIntent),
        () => runMutation(mutation, durableCommit, auditIntent)
      );
      queueTail = queued.catch(() => undefined);
      return queued;
    }

    return Object.freeze({ execute });
  }

  const exportsObject = {
    createApplicationMutationCoordinator,
    ApplicationMutationCoordinatorError
  };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof window !== "undefined" ? window : globalThis));
