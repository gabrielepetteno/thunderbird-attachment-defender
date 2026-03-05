// ============================================================
// OPTIONS PAGE - PDF Sanitizer Pro
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  await loadConfig();

  document.getElementById("btnSave").addEventListener("click", saveConfig);
  document.getElementById("btnTest").addEventListener("click", testConnection);
});

async function loadConfig() {
  const config = await browser.runtime.sendMessage({ type: "getConfig" });

  document.getElementById("apiUrl").value = config.apiUrl || "";
  document.getElementById("apiKey").value = config.apiKey || "";
  document.getElementById("scanOnArrival").checked = config.scanOnArrival !== false;
  document.getElementById("autoSanitize").checked = config.autoSanitize !== false;
  document.getElementById("autoDownloadSafe").checked = config.autoDownloadSafe === true;
  document.getElementById("showNotifications").checked = config.showNotifications !== false;
  document.getElementById("maxFileSizeMB").value = config.maxFileSizeMB || 50;
  document.getElementById("logRetentionDays").value = config.logRetentionDays || 30;
}

async function saveConfig() {
  const config = {
    apiUrl: document.getElementById("apiUrl").value.replace(/\/+$/, ""),
    apiKey: document.getElementById("apiKey").value,
    scanOnArrival: document.getElementById("scanOnArrival").checked,
    autoSanitize: document.getElementById("autoSanitize").checked,
    autoDownloadSafe: document.getElementById("autoDownloadSafe").checked,
    showNotifications: document.getElementById("showNotifications").checked,
    maxFileSizeMB: parseInt(document.getElementById("maxFileSizeMB").value) || 50,
    logRetentionDays: parseInt(document.getElementById("logRetentionDays").value) || 30
  };

  // Validazione
  if (!config.apiUrl) {
    showStatus("Inserisci l'URL del server!", "error");
    return;
  }
  if (!config.apiKey) {
    showStatus("Inserisci la chiave API!", "error");
    return;
  }

  const result = await browser.runtime.sendMessage({ type: "saveConfig", config });

  if (result.success) {
    showStatus("Impostazioni salvate con successo!", "success");
  } else {
    showStatus("Errore nel salvataggio delle impostazioni.", "error");
  }
}

async function testConnection() {
  showStatus("Connessione al server in corso...", "info");

  const result = await browser.runtime.sendMessage({ type: "testConnection" });

  if (result.success) {
    const info = result.data;
    showStatus(
      `Connessione riuscita! Server: ${info.name || "PDF Sanitizer"} v${info.version || "?"} — PyMuPDF: ${info.pymupdf_version || "?"}`,
      "success"
    );
  } else {
    showStatus(
      `Connessione fallita: ${result.error}. Verifica che il server sia avviato sul VPS e che la porta 9097 sia aperta nel firewall.`,
      "error"
    );
  }
}

function showStatus(message, type) {
  const el = document.getElementById("statusMsg");
  el.textContent = message;
  el.className = `status-msg ${type}`;
}
