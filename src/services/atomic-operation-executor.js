(function initializeAtomicOperationExecutorFactory(globalScope) {
  const FACTORY_FIELDS = new Set(["participants"]);
  const PARTICIPANT_METHODS = ["captureTransactionState", "restoreTransactionState"];

  class AtomicOperationExecutorError extends Error {
    constructor(code, message, options) {
      super(message);
      this.name = "AtomicOperationExecutorError";
      this.code = code;
      if (options && Object.prototype.hasOwnProperty.call(options, "cause")) {
        this.cause = options.cause;
      }
      if (options && Array.isArray(options.rollbackErrors)) {
        this.rollbackErrors = options.rollbackErrors.slice();
      }
    }
  }

  function fail(code, message, options) {
    throw new AtomicOperationExecutorError(code, message, options);
  }

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function requireOptions(value) {
    if (!isRecord(value)) {
      fail("invalid_factory", "Atomic Operation Executor requires options to be a plain object.");
    }
    const unknown = Object.keys(value).filter((field) => !FACTORY_FIELDS.has(field)).sort();
    if (unknown.length > 0) {
      fail("invalid_factory", `Atomic Operation Executor does not recognize options.${unknown[0]}.`);
    }
    if (!Object.prototype.hasOwnProperty.call(value, "participants") || !Array.isArray(value.participants)) {
      fail("invalid_factory", "Atomic Operation Executor requires options.participants to be an array.");
    }
    if (value.participants.length === 0) {
      fail("invalid_factory", "Atomic Operation Executor requires at least one participant.");
    }
    return value;
  }

  function bindParticipant(value, index) {
    const path = `options.participants[${index}]`;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_factory", `Atomic Operation Executor requires ${path} to be an object.`);
    }
    const output = {};
    PARTICIPANT_METHODS.forEach((method) => {
      if (typeof value[method] !== "function") {
        fail("invalid_factory", `Atomic Operation Executor requires ${path}.${method}.`);
      }
      output[method] = value[method].bind(value);
    });
    return output;
  }

  function createAtomicOperationExecutor(options) {
    const input = requireOptions(options);
    const participants = input.participants.map(bindParticipant);
    let queueTail = Promise.resolve();

    async function runOperation(operation) {
      const snapshots = [];
      for (let index = 0; index < participants.length; index += 1) {
        snapshots.push(await participants[index].captureTransactionState());
      }

      try {
        return await operation();
      } catch (operationError) {
        const rollbackErrors = [];
        for (let index = participants.length - 1; index >= 0; index -= 1) {
          try {
            await participants[index].restoreTransactionState(snapshots[index]);
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
        }
        if (rollbackErrors.length > 0) {
          fail(
            "rollback_failed",
            "Atomic Operation Executor could not fully restore transaction state.",
            { cause: operationError, rollbackErrors }
          );
        }
        throw operationError;
      }
    }

    function executeAtomically(operation) {
      if (typeof operation !== "function") {
        return Promise.reject(new AtomicOperationExecutorError(
          "invalid_operation",
          "Atomic Operation Executor requires operation to be a function."
        ));
      }
      const queued = queueTail.then(
        () => runOperation(operation),
        () => runOperation(operation)
      );
      queueTail = queued.catch(() => undefined);
      return queued;
    }

    return Object.freeze({ executeAtomically });
  }

  const exportsObject = {
    createAtomicOperationExecutor,
    AtomicOperationExecutorError
  };
  Object.keys(exportsObject).forEach((key) => {
    globalScope[key] = exportsObject[key];
  });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
