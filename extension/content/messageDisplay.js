/**
 * PDF Sanitizer Pro - Message Display Script
 *
 * Iniettato nell'anteprima di ogni email per mostrare un banner
 * con lo stato della scansione degli allegati PDF.
 */

(function () {
  const BANNER_ID = "pdf-sanitizer-banner";
  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 500;

  console.log("[PDF Sanitizer Pro] Content script caricato nell'anteprima email");

  function createBanner() {
    let banner = document.getElementById(BANNER_ID);
    if (banner) return banner;

    banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.style.cssText = [
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      "font-size: 13px",
      "padding: 10px 16px",
      "margin: 8px",
      "border-radius: 8px",
      "display: flex",
      "align-items: center",
      "gap: 10px",
      "line-height: 1.4",
      "box-shadow: 0 2px 6px rgba(0,0,0,0.2)",
      "position: relative",
      "z-index: 9999"
    ].join(";");

    // Inserisci nel body appena possibile
    const target = document.body || document.documentElement;
    if (target.firstChild) {
      target.insertBefore(banner, target.firstChild);
    } else {
      target.appendChild(banner);
    }

    console.log("[PDF Sanitizer Pro] Banner creato nel DOM");
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
      }
    };

    const s = states[state];
    if (!s) {
      banner.style.display = "none";
      return;
    }

    banner.style.display = "flex";
    banner.style.background = s.bg;
    banner.style.border = "2px solid " + s.border;
    banner.style.color = s.color;

    let html = '<span style="font-size:18px;flex-shrink:0">' + s.icon + '</span>';
    html += '<span style="flex:1"><strong>' + s.text + '</strong>';

    if (data && data.files && data.files.length > 0) {
      html += '<br><span style="font-size:12px;opacity:0.85">';
      for (let i = 0; i < data.files.length; i++) {
        const f = data.files[i];
        const statusIcon = getFileStatusIcon(f.status);
        html += statusIcon + " <strong>" + escapeHtml(f.filename) + "</strong>";
        if (f.riskLevel && f.riskLevel !== "safe") {
          html += " \u2014 Rischio: <strong>" + f.riskLevel.toUpperCase() + "</strong>";
        }
        if (f.threats && f.threats.length > 0) {
          html += " (" + escapeHtml(f.threats.slice(0, 3).join(", ")) + ")";
        }
        if (f.sanitized) {
          html += " \u2192 Sanificato";
        }
        html += "<br>";
      }
      html += '</span>';
    }

    html += '</span>';
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
    div.textContent = str || "";
    return div.innerHTML;
  }

  function determineBannerState(results) {
    if (!results || results.length === 0) return null;

    const hasScanning = results.some(function(r) { return r.status === "scanning"; });
    if (hasScanning) return "scanning";

    const hasThreat = results.some(function(r) { return r.status === "threat"; });
    const hasSanitizedThreat = results.some(function(r) { return r.status === "sanitized_threat"; });
    const hasSanitizedClean = results.some(function(r) { return r.status === "sanitized_clean"; });
    const hasClean = results.some(function(r) { return r.status === "clean"; });
    const hasError = results.some(function(r) { return r.status === "error"; });

    if (hasThreat) return "threat";
    if (hasSanitizedThreat) return "sanitized_threat";
    if (hasSanitizedClean) return "sanitized_clean";
    if (hasClean) return "clean";
    if (hasError) return "error";

    return null;
  }

  function updateBanner(results) {
    const state = determineBannerState(results);
    if (!state) {
      // Nessun PDF o nessun risultato: nascondi/rimuovi banner
      const existing = document.getElementById(BANNER_ID);
      if (existing) existing.style.display = "none";
      return;
    }
    const banner = createBanner();
    setBannerState(banner, state, { files: results });
    console.log("[PDF Sanitizer Pro] Banner aggiornato: stato=" + state + ", " + results.length + " file");
  }

  // Richiedi risultati al background con retry (per gestire race condition con onMessageDisplayed)
  function requestResults(attempt) {
    attempt = attempt || 0;
    browser.runtime.sendMessage({ type: "getDisplayedMessageResults" }).then(function(response) {
      if (response && response.results && response.results.length > 0) {
        updateBanner(response.results);
      } else if (attempt < MAX_RETRIES) {
        // Riprova dopo un delay - il background potrebbe non aver ancora registrato questo tab
        setTimeout(function() {
          requestResults(attempt + 1);
        }, RETRY_DELAY_MS);
      } else {
        console.log("[PDF Sanitizer Pro] Nessun risultato dopo " + MAX_RETRIES + " tentativi");
      }
    }).catch(function(err) {
      console.log("[PDF Sanitizer Pro] Errore comunicazione con background:", err);
      if (attempt < MAX_RETRIES) {
        setTimeout(function() {
          requestResults(attempt + 1);
        }, RETRY_DELAY_MS);
      }
    });
  }

  // Ascolta aggiornamenti push dal background (scansione completata, stato aggiornato)
  browser.runtime.onMessage.addListener(function(message) {
    if (message.type === "updateScanBanner" && message.results) {
      console.log("[PDF Sanitizer Pro] Ricevuto aggiornamento push dal background");
      updateBanner(message.results);
    }
  });

  // Avvia richiesta con un piccolo delay iniziale per dare tempo a onMessageDisplayed
  setTimeout(function() {
    requestResults(0);
  }, 200);

})();
