/**
 * PDF Sanitizer Pro - Message Display Script
 *
 * Iniettato nell'anteprima di ogni email per mostrare un banner
 * con lo stato della scansione degli allegati PDF.
 */

(function () {
  const BANNER_ID = "pdf-sanitizer-banner";

  function createBanner() {
    if (document.getElementById(BANNER_ID)) return document.getElementById(BANNER_ID);

    const banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.style.cssText = `
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      padding: 10px 16px;
      margin: 0 0 8px 0;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 10px;
      line-height: 1.4;
      box-shadow: 0 1px 4px rgba(0,0,0,0.15);
    `;

    const body = document.body;
    if (body && body.firstChild) {
      body.insertBefore(banner, body.firstChild);
    } else if (body) {
      body.appendChild(banner);
    }
    return banner;
  }

  function setBannerState(banner, state, data) {
    const states = {
      scanning: {
        bg: "linear-gradient(135deg, #FFF3E0, #FFE0B2)",
        border: "#FF9800",
        color: "#E65100",
        icon: "\u23F3",
        text: "Scansione allegati PDF in corso..."
      },
      clean: {
        bg: "linear-gradient(135deg, #E8F5E9, #C8E6C9)",
        border: "#4CAF50",
        color: "#1B5E20",
        icon: "\u2705",
        text: "Allegati PDF verificati \u2014 Nessuna minaccia rilevata"
      },
      threat: {
        bg: "linear-gradient(135deg, #FFEBEE, #FFCDD2)",
        border: "#F44336",
        color: "#B71C1C",
        icon: "\u26A0\uFE0F",
        text: "ATTENZIONE: Minacce rilevate negli allegati PDF!"
      },
      sanitized_clean: {
        bg: "linear-gradient(135deg, #E3F2FD, #BBDEFB)",
        border: "#2196F3",
        color: "#0D47A1",
        icon: "\uD83D\uDEE1\uFE0F",
        text: "Allegati PDF sanificati preventivamente \u2014 Nessuna minaccia"
      },
      sanitized_threat: {
        bg: "linear-gradient(135deg, #FFF8E1, #FFECB3)",
        border: "#FFC107",
        color: "#F57F17",
        icon: "\uD83D\uDEE1\uFE0F",
        text: "Minacce rilevate e neutralizzate tramite sanificazione"
      },
      error: {
        bg: "linear-gradient(135deg, #F5F5F5, #E0E0E0)",
        border: "#9E9E9E",
        color: "#424242",
        icon: "\u26A0\uFE0F",
        text: "Errore durante la scansione degli allegati"
      },
      no_pdf: {
        bg: "none",
        border: "none",
        color: "transparent",
        icon: "",
        text: ""
      }
    };

    const s = states[state];
    if (!s || state === "no_pdf") {
      banner.style.display = "none";
      return;
    }

    banner.style.display = "flex";
    banner.style.background = s.bg;
    banner.style.border = `2px solid ${s.border}`;
    banner.style.color = s.color;

    let html = `<span style="font-size:18px;flex-shrink:0">${s.icon}</span>`;
    html += `<span style="flex:1"><strong>${s.text}</strong>`;

    if (data) {
      if (data.files && data.files.length > 0) {
        html += `<br><span style="font-size:12px;opacity:0.85">`;
        for (const f of data.files) {
          const statusIcon = getFileStatusIcon(f.status);
          html += `${statusIcon} <strong>${escapeHtml(f.filename)}</strong>`;
          if (f.riskLevel && f.riskLevel !== "safe") {
            html += ` \u2014 Rischio: <strong>${f.riskLevel.toUpperCase()}</strong>`;
          }
          if (f.threats && f.threats.length > 0) {
            html += ` (${escapeHtml(f.threats.slice(0, 3).join(", "))})`;
          }
          if (f.sanitized) {
            html += ` \u2192 Sanificato`;
          }
          html += `<br>`;
        }
        html += `</span>`;
      }
    }

    html += `</span>`;
    banner.innerHTML = html;
  }

  function getFileStatusIcon(status) {
    switch (status) {
      case "clean": return "\u2705";
      case "threat": return "\uD83D\uDEA8";
      case "sanitized_clean": return "\uD83D\uDEE1\uFE0F";
      case "sanitized_threat": return "\uD83D\uDEE1\uFE0F";
      case "error": return "\u274C";
      case "scanning": return "\u23F3";
      default: return "\u2753";
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function determineBannerState(results) {
    if (!results || results.length === 0) return "no_pdf";

    const hasScanning = results.some(r => r.status === "scanning");
    if (hasScanning) return "scanning";

    const hasError = results.some(r => r.status === "error");
    const hasThreat = results.some(r => r.status === "threat");
    const hasSanitizedThreat = results.some(r => r.status === "sanitized_threat");
    const hasSanitizedClean = results.some(r => r.status === "sanitized_clean");
    const hasClean = results.some(r => r.status === "clean");

    if (hasThreat) return "threat";
    if (hasSanitizedThreat) return "sanitized_threat";
    if (hasSanitizedClean) return "sanitized_clean";
    if (hasClean) return "clean";
    if (hasError) return "error";

    return "no_pdf";
  }

  function updateBanner(results) {
    const banner = createBanner();
    const state = determineBannerState(results);
    setBannerState(banner, state, { files: results });
  }

  // Chiedi al background lo stato di scansione per questo messaggio
  browser.runtime.sendMessage({ type: "getDisplayedMessageResults" }).then(response => {
    if (response && response.results) {
      updateBanner(response.results);
    }
  }).catch(() => {
    // Silenziosamente ignora errori (es. nessun PDF in questa email)
  });

  // Ascolta aggiornamenti push dal background (es. scansione completata)
  browser.runtime.onMessage.addListener((message) => {
    if (message.type === "updateScanBanner" && message.results) {
      updateBanner(message.results);
    }
  });
})();
