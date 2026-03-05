/**
 * PDF Sanitizer Pro - Message Display Action Popup
 *
 * Mostra i dettagli della scansione per gli allegati PDF
 * del messaggio attualmente visualizzato.
 */

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await browser.runtime.sendMessage({ type: "getDisplayedMessageResults" });
    if (response && response.results && response.results.length > 0) {
      renderResults(response.results);
    } else if (response && response.noPdf) {
      showNoPdf();
    } else {
      showEmpty();
    }
  } catch (err) {
    showEmpty();
  }
});

function renderResults(results) {
  // Determina stato globale
  const hasThreat = results.some(r => r.status === "threat");
  const hasSanitizedThreat = results.some(r => r.status === "sanitized_threat");
  const hasSanitizedClean = results.some(r => r.status === "sanitized_clean");
  const hasClean = results.some(r => r.status === "clean");
  const hasScanning = results.some(r => r.status === "scanning");
  const hasError = results.some(r => r.status === "error");

  const banner = document.getElementById("statusBanner");
  const bannerIcon = document.getElementById("bannerIcon");
  const bannerText = document.getElementById("bannerText");
  const headerIcon = document.getElementById("headerIcon");

  banner.style.display = "flex";

  if (hasThreat) {
    banner.className = "status-banner status-threat";
    bannerIcon.textContent = "\u26A0\uFE0F";
    bannerText.textContent = "MINACCE RILEVATE!";
    headerIcon.textContent = "\uD83D\uDEA8";
  } else if (hasSanitizedThreat) {
    banner.className = "status-banner status-sanitized-threat";
    bannerIcon.textContent = "\uD83D\uDEE1\uFE0F";
    bannerText.textContent = "Minacce neutralizzate tramite sanificazione";
    headerIcon.textContent = "\uD83D\uDEE1\uFE0F";
  } else if (hasSanitizedClean) {
    banner.className = "status-banner status-sanitized-clean";
    bannerIcon.textContent = "\uD83D\uDEE1\uFE0F";
    bannerText.textContent = "PDF sanificati preventivamente";
    headerIcon.textContent = "\uD83D\uDEE1\uFE0F";
  } else if (hasClean) {
    banner.className = "status-banner status-safe";
    bannerIcon.textContent = "\u2705";
    bannerText.textContent = "Tutti gli allegati PDF sono sicuri";
    headerIcon.textContent = "\u2705";
  } else if (hasScanning) {
    banner.className = "status-banner status-scanning";
    bannerIcon.textContent = "\u23F3";
    bannerText.textContent = "Scansione in corso...";
    headerIcon.textContent = "\u23F3";
  } else if (hasError) {
    banner.className = "status-banner status-error";
    bannerIcon.textContent = "\u26A0\uFE0F";
    bannerText.textContent = "Errore durante la scansione";
    headerIcon.textContent = "\u26A0\uFE0F";
  }

  // Render file list
  const fileList = document.getElementById("fileList");
  fileList.innerHTML = "";

  for (const file of results) {
    const item = document.createElement("div");
    item.className = "file-item";

    let statusBadge = "";
    let statusText = "";
    switch (file.status) {
      case "clean":
        statusBadge = '<span class="badge badge-safe">SICURO</span>';
        statusText = "Nessuna minaccia";
        break;
      case "threat":
        statusBadge = '<span class="badge badge-threat">PERICOLOSO</span>';
        statusText = `Rischio: ${(file.riskLevel || "").toUpperCase()} (${file.riskScore || 0}/100)`;
        break;
      case "sanitized_clean":
        statusBadge = '<span class="badge badge-sanitized">SANIFICATO</span>';
        statusText = "Sanificato preventivamente";
        break;
      case "sanitized_threat":
        statusBadge = '<span class="badge badge-sanitized">SANIFICATO</span>';
        statusText = `Minacce neutralizzate - Rischio originale: ${(file.riskLevel || "").toUpperCase()}`;
        break;
      case "scanning":
        statusBadge = '<span class="badge badge-scanning">IN CORSO</span>';
        statusText = "Scansione in corso...";
        break;
      case "error":
        statusBadge = '<span class="badge badge-error">ERRORE</span>';
        statusText = file.reason || "Errore sconosciuto";
        break;
      default:
        statusBadge = '<span class="badge badge-error">?</span>';
        statusText = "Stato sconosciuto";
    }

    let html = `
      <div class="file-name">${escapeHtml(file.filename)}</div>
      <div class="file-status">${statusBadge} ${escapeHtml(statusText)}</div>
    `;

    if (file.threats && file.threats.length > 0) {
      html += '<ul class="file-threats">';
      for (const t of file.threats) {
        html += `<li>${escapeHtml(t)}</li>`;
      }
      html += '</ul>';
    }

    item.innerHTML = html;
    fileList.appendChild(item);
  }
}

function showNoPdf() {
  document.getElementById("emptyState").style.display = "block";
}

function showEmpty() {
  document.getElementById("emptyState").style.display = "block";
  document.getElementById("emptyState").innerHTML = `
    <div class="icon">📎</div>
    <div>Nessun risultato di scansione per questa email</div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
