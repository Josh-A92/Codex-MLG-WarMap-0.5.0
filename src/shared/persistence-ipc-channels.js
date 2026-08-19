const PERSISTENCE_IPC_CHANNELS = Object.freeze({
  LOAD_ENVELOPE: "persistence:load-envelope",
  SAVE_ENVELOPE: "persistence:save-envelope",
  GET_STARTUP_RESULT: "startup:get-result",
  LOAD_COMMITTED_GENERATION: "generation:load-committed",
  COMMIT_GENERATION: "generation:commit",
  SELECT_AND_IMPORT_EVIDENCE: "evidence:select-and-import"
});

module.exports = {
  PERSISTENCE_IPC_CHANNELS
};
