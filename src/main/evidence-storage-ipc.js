function safeError(error) {
  return {
    code: error && typeof error.code === "string" ? error.code : "evidence_store_error",
    message: error && typeof error.message === "string" ? error.message : String(error)
  };
}

function createEvidenceStorageHandlers(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)
      || Object.keys(options).some((field) => !["dialog", "evidenceFileStore"].includes(field))) {
    throw new TypeError("Evidence storage handlers require strict options.");
  }
  const dialog = options.dialog;
  const store = options.evidenceFileStore;
  if (!dialog || typeof dialog.showOpenDialog !== "function") {
    throw new TypeError("Evidence storage handlers require dialog.showOpenDialog.");
  }
  if (!store || typeof store.importFile !== "function") {
    throw new TypeError("Evidence storage handlers require evidenceFileStore.importFile.");
  }

  async function selectAndImportEvidence() {
    try {
      const selection = await dialog.showOpenDialog({
        title: "Select screenshot evidence",
        properties: ["openFile"],
        filters: [{ name: "Screenshot images", extensions: ["png", "jpg", "jpeg"] }]
      });
      if (!selection || selection.canceled === true) {
        return { ok: true, result: { status: "cancelled" } };
      }
      if (!Array.isArray(selection.filePaths) || selection.filePaths.length !== 1
          || typeof selection.filePaths[0] !== "string" || selection.filePaths[0].trim() === "") {
        throw Object.assign(new Error("Evidence selection did not return exactly one file."), { code: "invalid_selection" });
      }
      const imported = await store.importFile({ sourcePath: selection.filePaths[0] });
      return { ok: true, result: { status: "imported", asset: imported } };
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }
  }

  return Object.freeze({ selectAndImportEvidence });
}

module.exports = { createEvidenceStorageHandlers };
