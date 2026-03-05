// ============================================================
// POPUP - PDF Sanitizer Pro
// ============================================================

const STATUS_ICONS = {
  clean: "✅",
  threat: "🚨",
  sanitized_clean: "🛡️",
  sanitized_threat: "⚠️",
  error: "❌",
  skipped: "⏭️"
};

const STATUS_LABELS = {
  clean: "Pulito",
  threat: "MINACCIA",
  sanitized_clean: "Sanificato",
  sanitized_threat: "Minaccia sanificata",
  error: "Errore",
  skipped: "Saltato"
};

// Carica dati all'apertura
document.addEventListener("DOMContentLoaded", async () => {
  await loadStats();
  await loadLogs();
  await testConnection();

  document.getElementById("btnOptions").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
    window.close();
  });

  let clearClickCount = 0;
  let clearTimer = null;
  document.getElementById("btnClearLogs").addEventListener("click", async () => {
    clearClickCount++;
    if (clearClickCount === 1) {
      // Primo clic: chiedi conferma cambiando il testo del bottone
      document.getElementById("btnClearLogs").textContent = "Conferma pulizia?";
      document.getElementById("btnClearLogs").style.background = "#dc2626";
      document.getElementById("btnClearLogs").style.color = "white";
      clearTimer = setTimeout(() => {
        clearClickCount = 0;
        document.getElementById("btnClearLogs").textContent = "🗑️ Pulisci log";
        document.getElementById("btnClearLogs").style.background = "";
        document.getElementById("btnClearLogs").style.color = "";
      }, 3000);
    } else if (clearClickCount >= 2) {
      // Secondo clic: conferma, pulisci tutto
      clearTimeout(clearTimer);
      clearClickCount = 0;
      await browser.runtime.sendMessage({ type: "clearLogs" });
      document.getElementById("btnClearLogs").textContent = "🗑️ Pulisci log";
      document.getElementById("btnClearLogs").style.background = "";
      document.getElementById("btnClearLogs").style.color = "";
      await loadStats();
      await loadLogs();
    }
  });

  document.getElementById("connectionBox").addEventListener("click", testConnection);
});

async function loadStats() {
  const stats = await browser.runtime.sendMessage({ type: "getStats" });
  document.getElementById("statScanned").textContent = stats.totalScanned || 0;
  document.getElementById("statThreats").textContent = stats.threatsFound || 0;
  document.getElementById("statSanitized").textContent = stats.filesSanitized || 0;

  const subtitle = document.getElementById("headerStatus");
  if (stats.lastScanTime) {
    const d = new Date(stats.lastScanTime);
    subtitle.textContent = `Ultima scansione: ${d.toLocaleString("it-IT")}`;
  }
}

async function loadLogs() {
  const logs = await browser.runtime.sendMessage({ type: "getLogs" });
  const container = document.getElementById("logList");

  if (!logs || logs.length === 0) {
    container.innerHTML = `<div class="log-empty">Nessuna scansione ancora effettuata.<br>I PDF verranno controllati automaticamente.</div>`;
    return;
  }

  container.innerHTML = "";

  // Mostra le ultime 20 voci
  const recentLogs = logs.slice(0, 20);

  for (const log of recentLogs) {
    const item = document.createElement("div");
    item.className = `log-item ${log.status}`;

    const icon = STATUS_ICONS[log.status] || "❓";
    const timeStr = formatTime(log.date);

    let threatsHtml = "";
    if (log.threats && log.threats.length > 0) {
      threatsHtml = `<div class="log-threats">${log.threats.slice(0, 3).join(" · ")}</div>`;
    }
    if (log.reason) {
      threatsHtml = `<div class="log-threats">${log.reason}</div>`;
    }

    item.innerHTML = `
      <div class="log-icon">${icon}</div>
      <div class="log-details">
        <div class="log-filename" title="${escapeHtml(log.filename)}">${escapeHtml(log.filename)}</div>
        <div class="log-sender" title="${escapeHtml(log.sender || '')}">${escapeHtml(log.sender || "Sconosciuto")}</div>
        ${threatsHtml}
      </div>
      <div class="log-time">${timeStr}</div>
    `;

    container.appendChild(item);
  }
}

async function testConnection() {
  const dot = document.getElementById("connectionDot");
  const text = document.getElementById("connectionText");

  dot.className = "dot checking";
  text.textContent = "Verifico connessione al server...";

  const result = await browser.runtime.sendMessage({ type: "testConnection" });

  if (result.success) {
    dot.className = "dot online";
    text.textContent = `Server online — ${result.data?.version || "connesso"}`;
    document.getElementById("headerShield").className = "shield";
  } else {
    dot.className = "dot offline";
    text.textContent = `Server offline: ${result.error}`;
    document.getElementById("headerShield").className = "shield danger";
  }
}

function formatTime(isoStr) {
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Adesso";
  if (diffMin < 60) return `${diffMin}m fa`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h fa`;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
