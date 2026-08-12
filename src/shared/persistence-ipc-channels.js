const PERSISTENCE_IPC_CHANNELS = Object.freeze({
  LOAD_ENVELOPE: "persistence:load-envelope",
  SAVE_ENVELOPE: "persistence:save-envelope",
  LOAD_COMMITTED_GENERATION: "generation:load-committed",
  COMMIT_GENERATION: "generation:commit"
});

module.exports = {
  PERSISTENCE_IPC_CHANNELS
};
