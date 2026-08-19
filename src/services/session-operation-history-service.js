(function initializeSessionOperationHistoryService(globalScope) {
  const FACTORY_FIELDS = new Set(["limit"]);
  const OPERATION_FIELDS = new Set(["operationId", "undo", "redo"]);

  class SessionOperationHistoryError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "SessionOperationHistoryError";
      this.code = code;
    }
  }

  function fail(code, message) {
    throw new SessionOperationHistoryError(code, message);
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function exact(value, fields, path) {
    if (!isPlainObject(value)) fail("invalid_input", `${path} must be a plain object.`);
    const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
    if (unknown.length > 0) fail("invalid_input", `${path}.${unknown[0]} is not supported.`);
    return value;
  }

  function requiredString(value, path) {
    if (typeof value !== "string" || value.trim() === "") fail("invalid_input", `${path} must be non-empty.`);
    return value;
  }

  function createSessionOperationHistoryService(options = {}) {
    const input = exact(options, FACTORY_FIELDS, "options");
    const limit = input.limit === undefined ? 20 : input.limit;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      fail("invalid_factory", "options.limit must be an integer from 1 to 100.");
    }

    const undoStack = [];
    const redoStack = [];
    const seenOperationIds = new Set();
    let queueTail = Promise.resolve();
    let pendingOperations = 0;

    function snapshot() {
      return Object.freeze({
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        undoOperationIds: Object.freeze(undoStack.map((entry) => entry.operationId)),
        redoOperationIds: Object.freeze(redoStack.map((entry) => entry.operationId))
      });
    }

    function record(operation) {
      if (pendingOperations > 0) fail("operation_in_progress", "Cannot record an operation while undo or redo is pending.");
      const value = exact(operation, OPERATION_FIELDS, "operation");
      const operationId = requiredString(value.operationId, "operation.operationId");
      if (typeof value.undo !== "function" || typeof value.redo !== "function") {
        fail("invalid_input", "operation.undo and operation.redo must be functions.");
      }
      if (seenOperationIds.has(operationId)) {
        fail("duplicate_operation", `Operation '${operationId}' already exists in this session history.`);
      }
      undoStack.push(Object.freeze({ operationId, undo: value.undo, redo: value.redo }));
      seenOperationIds.add(operationId);
      if (undoStack.length > limit) undoStack.shift();
      redoStack.length = 0;
      return snapshot();
    }

    function enqueue(work) {
      pendingOperations += 1;
      const finish = async () => {
        try {
          return await work();
        } finally {
          pendingOperations -= 1;
        }
      };
      const queued = queueTail.then(finish, finish);
      queueTail = queued.catch(() => undefined);
      return queued;
    }

    function undo() {
      return enqueue(async () => {
        const entry = undoStack[undoStack.length - 1];
        if (!entry) return { status: "empty", direction: "undo", state: snapshot() };
        const result = await entry.undo();
        undoStack.pop();
        redoStack.push(entry);
        return { status: "applied", direction: "undo", operationId: entry.operationId, result, state: snapshot() };
      });
    }

    function redo() {
      return enqueue(async () => {
        const entry = redoStack[redoStack.length - 1];
        if (!entry) return { status: "empty", direction: "redo", state: snapshot() };
        const result = await entry.redo();
        redoStack.pop();
        undoStack.push(entry);
        return { status: "applied", direction: "redo", operationId: entry.operationId, result, state: snapshot() };
      });
    }

    function clear() {
      undoStack.length = 0;
      redoStack.length = 0;
      seenOperationIds.clear();
      return snapshot();
    }

    return Object.freeze({ record, undo, redo, clear, getState: snapshot });
  }

  const exportsObject = { createSessionOperationHistoryService, SessionOperationHistoryError };
  Object.keys(exportsObject).forEach((key) => { globalScope[key] = exportsObject[key]; });
  if (typeof module !== "undefined" && module.exports) module.exports = exportsObject;
}(typeof globalThis !== "undefined" ? globalThis : this));
