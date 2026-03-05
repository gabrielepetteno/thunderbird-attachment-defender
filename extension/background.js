/**
 * PDF Sanitizer Pro - Background Script
 *
 * Monitora AUTOMATICAMENTE tutte le email in arrivo su tutti gli account
 * collegati a Thunderbird. Ogni PDF allegato viene inviato al server VPS
 * per un'analisi approfondita e sanificazione completa.
 *
 * Funzionalità:
 * - Auto-scan di ogni nuova email in arrivo
 * - Analisi strutturale del PDF (JavaScript, link, oggetti embedded)
 * - Sanificazione tramite conversione in immagini (distrugge qualsiasi codice malevolo)
 * - Notifiche desktop per avvisare l'utente
 * - Cronologia completa delle scansioni
 * - Badge sull'icona con contatore file pericolosi
 */

// ============================================================
// CONFIGURAZIONE DEFAULT (sovrascritta dalle Opzioni)
// ============================================================
const DEFAULT_CONFIG = {
  apiUrl: "http://YOUR_SERVER_IP:9097",
  apiKey: "CHANGE_THIS_TO_A_STRONG_SECRET_KEY",
  vtApiKey: "",              // VirusTotal API key (opzionale)
  vtEnabled: false,          // Attiva/disattiva controllo VirusTotal
  autoSanitize: true,        // Sanifica automaticamente i PDF pericolosi
  autoDownloadSafe: false,   // Scarica automaticamente i PDF sanificati
  showNotifications: true,   // Mostra notifiche desktop
  scanOnArrival: true,       // Scansiona all'arrivo di ogni email
  maxFileSizeMB: 50,         // Dimensione massima file da scansionare (MB)
  logRetentionDays: 30       // Giorni di conservazione log
};

// Stato globale
let scanQueue = [];
let isProcessing = false;
let stats = {
  totalScanned: 0,
  threatsFound: 0,
  filesSanitized: 0,
  lastScanTime: null
};

// Mappa tabId → messageId per tracciare quale messaggio è visualizzato
let displayedMessages = new Map();
// Mappa messageId → [tabIds] per aggiornamento push dei banner
let messageToTabs = new Map();

// ============================================================
// INIZIALIZZAZIONE
// ============================================================
async function initialize() {
  console.log("[PDF Sanitizer Pro] Avvio estensione...");

  // Carica configurazione salvata
  const stored = await browser.storage.local.get("config");
  if (!stored.config) {
    await browser.storage.local.set({ config: DEFAULT_CONFIG });
  }

  // Carica statistiche salvate
  const storedStats = await browser.storage.local.get("stats");
  if (storedStats.stats) {
    stats = storedStats.stats;
  }

  // Carica log scansioni
  const storedLogs = await browser.storage.local.get("scanLogs");
  if (!storedLogs.scanLogs) {
    await browser.storage.local.set({ scanLogs: [] });
  }

  // Registra script di visualizzazione messaggio (banner nell'anteprima email)
  browser.messageDisplayScripts.register({
    js: [{ file: "content/messageDisplay.js" }]
  });

  // Traccia quale messaggio viene visualizzato in ogni tab
  browser.messageDisplay.onMessageDisplayed.addListener(onMessageDisplayed);

  // Registra listener per nuove email
  browser.messages.onNewMailReceived.addListener(onNewMailReceived);

  // Registra menu contestuale per scansione manuale
  browser.menus.create({
    id: "scan-pdf-manual",
    title: "🛡️ Scansiona PDF allegati",
    contexts: ["message_list"]
  });

  browser.menus.create({
    id: "sanitize-pdf-manual",
    title: "🔒 Sanifica PDF allegati",
    contexts: ["message_list"]
  });

  browser.menus.onClicked.addListener(onMenuClicked);

  // Imposta badge iniziale
  updateBadge();

  console.log("[PDF Sanitizer Pro] Estensione avviata con successo!");

  if ((stored.config || DEFAULT_CONFIG).showNotifications) {
    browser.notifications.create("startup", {
      type: "basic",
      title: "PDF Sanitizer Pro",
      message: "Protezione attiva! Monitoraggio automatico di tutte le email in arrivo."
    });
  }
}

// ============================================================
// MONITORAGGIO EMAIL IN ARRIVO
// ============================================================
async function onNewMailReceived(folder, messages) {
  const config = (await browser.storage.local.get("config")).config || DEFAULT_CONFIG;

  if (!config.scanOnArrival) return;

  console.log(`[PDF Sanitizer Pro] Nuove email ricevute in ${folder.name}: ${messages.messages.length}`);

  for (const message of messages.messages) {
    try {
      const attachments = await browser.messages.listAttachments(message.id);
      const pdfAttachments = attachments.filter(att =>
        att.name.toLowerCase().endsWith(".pdf") ||
        att.contentType === "application/pdf"
      );

      if (pdfAttachments.length > 0) {
        console.log(`[PDF Sanitizer Pro] Trovati ${pdfAttachments.length} PDF in email da: ${message.author}`);

        for (const att of pdfAttachments) {
          scanQueue.push({
            messageId: message.id,
            attachment: att,
            sender: message.author,
            subject: message.subject,
            date: message.date,
            folder: folder.name,
            action: config.autoSanitize ? "sanitize" : "scan"
          });
        }
      }
    } catch (err) {
      console.error("[PDF Sanitizer Pro] Errore nell'analisi email:", err);
    }
  }

  // Avvia l'elaborazione della coda
  if (scanQueue.length > 0 && !isProcessing) {
    processQueue();
  }
}

// ============================================================
// TRACCIAMENTO MESSAGGIO VISUALIZZATO
// ============================================================
async function onMessageDisplayed(tab, message) {
  // Aggiorna la mappa tab → message
  const oldMessageId = displayedMessages.get(tab.id);
  if (oldMessageId) {
    const tabs = messageToTabs.get(oldMessageId);
    if (tabs) {
      tabs.delete(tab.id);
      if (tabs.size === 0) messageToTabs.delete(oldMessageId);
    }
  }

  displayedMessages.set(tab.id, message.id);
  if (!messageToTabs.has(message.id)) {
    messageToTabs.set(message.id, new Set());
  }
  messageToTabs.get(message.id).add(tab.id);

  // Cerca risultati scansione per questo messaggio e invia al content script
  const results = await getScanResultsForMessage(message);
  if (results.length > 0) {
    try {
      await browser.tabs.sendMessage(tab.id, {
        type: "updateScanBanner",
        results: results
      });
    } catch (e) {
      // Il content script potrebbe non essere ancora pronto, verrà aggiornato via polling
    }
  }
}

async function getScanResultsForMessage(message) {
  const stored = await browser.storage.local.get("scanLogs");
  const logs = stored.scanLogs || [];

  // Cerca i PDF allegati di questo messaggio
  let attachments = [];
  try {
    attachments = await browser.messages.listAttachments(message.id);
  } catch (e) {
    return [];
  }

  const pdfAttachments = attachments.filter(att =>
    att.name.toLowerCase().endsWith(".pdf") ||
    att.contentType === "application/pdf"
  );

  if (pdfAttachments.length === 0) return [];

  const results = [];
  for (const att of pdfAttachments) {
    // Cerca nei log per messageId o per combinazione sender+filename
    const logEntry = logs.find(l =>
      (l.messageId === message.id && l.filename === att.name) ||
      (l.sender === message.author && l.filename === att.name && l.subject === message.subject)
    );

    if (logEntry) {
      results.push({
        filename: att.name,
        status: logEntry.status,
        riskLevel: logEntry.riskLevel,
        riskScore: logEntry.riskScore,
        threats: logEntry.threats || [],
        sanitized: logEntry.sanitized || false
      });
    } else {
      // PDF presente ma non ancora scansionato - controlla se è in coda
      const inQueue = scanQueue.some(q =>
        q.messageId === message.id && q.attachment.name === att.name
      );
      if (inQueue || isProcessing) {
        results.push({
          filename: att.name,
          status: "scanning"
        });
      }
      // Se non è in coda e non c'è log, non mostriamo nulla (il messaggio potrebbe essere vecchio)
    }
  }

  return results;
}

async function pushBannerUpdate(messageId) {
  // Aggiorna il banner in tutti i tab che mostrano questo messaggio
  const tabIds = messageToTabs.get(messageId);
  if (!tabIds || tabIds.size === 0) return;

  let message;
  try {
    message = await browser.messages.get(messageId);
  } catch (e) {
    return;
  }

  const results = await getScanResultsForMessage(message);
  for (const tabId of tabIds) {
    try {
      await browser.tabs.sendMessage(tabId, {
        type: "updateScanBanner",
        results: results
      });
    } catch (e) {
      // Tab potrebbe essere chiuso, rimuovi dalla mappa
      tabIds.delete(tabId);
      displayedMessages.delete(tabId);
    }
  }
}

// ============================================================
// ELABORAZIONE CODA DI SCANSIONE
// ============================================================
async function processQueue() {
  if (isProcessing || scanQueue.length === 0) return;
  isProcessing = true;

  const config = (await browser.storage.local.get("config")).config || DEFAULT_CONFIG;

  while (scanQueue.length > 0) {
    const task = scanQueue.shift();

    try {
      // Aggiorna badge con indicatore di lavoro in corso
      browser.browserAction.setBadgeText({ text: "..." });
      browser.browserAction.setBadgeBackgroundColor({ color: "#FFA500" });

      // Mostra stato "scansione in corso" nel banner dell'email
      await pushBannerUpdate(task.messageId);

      // Scarica l'allegato
      const fileData = await browser.messages.getAttachmentFile(
        task.messageId,
        task.attachment.partName
      );

      // Controlla dimensione file
      const fileSizeMB = fileData.size / (1024 * 1024);
      if (fileSizeMB > config.maxFileSizeMB) {
        await addScanLog({
          messageId: task.messageId,
          filename: task.attachment.name,
          sender: task.sender,
          subject: task.subject,
          date: new Date().toISOString(),
          status: "skipped",
          reason: `File troppo grande (${fileSizeMB.toFixed(1)} MB > ${config.maxFileSizeMB} MB)`,
          threats: []
        });
        continue;
      }

      if (task.action === "scan") {
        // Solo scansione (analisi senza sanificazione)
        await performScan(fileData, task, config);
      } else {
        // Scansione + Sanificazione
        await performScanAndSanitize(fileData, task, config);
      }

    } catch (err) {
      console.error(`[PDF Sanitizer Pro] Errore elaborazione ${task.attachment.name}:`, err);
      await addScanLog({
        messageId: task.messageId,
        filename: task.attachment.name,
        sender: task.sender,
        subject: task.subject,
        date: new Date().toISOString(),
        status: "error",
        reason: `Errore: ${err.message}`,
        threats: []
      });

      // Aggiorna banner con stato errore
      await pushBannerUpdate(task.messageId);

      if (config.showNotifications) {
        browser.notifications.create(`error-${Date.now()}`, {
          type: "basic",
          title: "⚠️ Errore Scansione PDF",
          message: `Impossibile analizzare "${task.attachment.name}" da ${task.sender}. Controlla la connessione al server.`
        });
      }
    }
  }

  isProcessing = false;
  updateBadge();
}

// ============================================================
// SCANSIONE (SOLO ANALISI)
// ============================================================
async function performScan(fileData, task, config) {
  const formData = new FormData();
  formData.append("file", fileData, task.attachment.name);

  const analyzeHeaders = { "x-api-key": config.apiKey };
  if (config.vtEnabled && config.vtApiKey) {
    analyzeHeaders["x-vt-api-key"] = config.vtApiKey;
  }

  const response = await fetch(`${config.apiUrl}/analyze`, {
    method: "POST",
    headers: analyzeHeaders,
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Server ha risposto con errore ${response.status}`);
  }

  const report = await response.json();

  stats.totalScanned++;
  stats.lastScanTime = new Date().toISOString();

  const logEntry = {
    messageId: task.messageId,
    filename: task.attachment.name,
    sender: task.sender,
    subject: task.subject,
    folder: task.folder,
    date: new Date().toISOString(),
    fileSize: fileData.size,
    status: report.risk_level === "safe" ? "clean" : "threat",
    riskLevel: report.risk_level,
    riskScore: report.risk_score,
    threats: report.threats || [],
    details: report.details || {}
  };

  if (report.risk_level !== "safe") {
    stats.threatsFound++;

    if (config.showNotifications) {
      const threatList = report.threats.map(t => `• ${t}`).join("\n");
      browser.notifications.create(`threat-${Date.now()}`, {
        type: "basic",
        title: `🚨 PDF PERICOLOSO RILEVATO!`,
        message: `"${task.attachment.name}" da ${task.sender}\nRischio: ${report.risk_level.toUpperCase()}\n${threatList}`
      });
    }
  } else {
    if (config.showNotifications) {
      browser.notifications.create(`safe-${Date.now()}`, {
        type: "basic",
        title: "✅ PDF Sicuro",
        message: `"${task.attachment.name}" da ${task.sender} è stato verificato e risulta pulito.`
      });
    }
  }

  await addScanLog(logEntry);
  await browser.storage.local.set({ stats });

  // Aggiorna il banner nell'anteprima email se il messaggio è visualizzato
  await pushBannerUpdate(task.messageId);
}

// ============================================================
// SCANSIONE + SANIFICAZIONE
// ============================================================
async function performScanAndSanitize(fileData, task, config) {
  // Prima: analisi
  const formDataAnalysis = new FormData();
  formDataAnalysis.append("file", fileData, task.attachment.name);

  const analyzeHeaders = { "x-api-key": config.apiKey };
  if (config.vtEnabled && config.vtApiKey) {
    analyzeHeaders["x-vt-api-key"] = config.vtApiKey;
  }

  const analysisResponse = await fetch(`${config.apiUrl}/analyze`, {
    method: "POST",
    headers: analyzeHeaders,
    body: formDataAnalysis
  });

  let report = { risk_level: "unknown", threats: [], risk_score: 0 };
  if (analysisResponse.ok) {
    report = await analysisResponse.json();
  }

  stats.totalScanned++;
  stats.lastScanTime = new Date().toISOString();

  // Poi: sanificazione (sempre, per sicurezza al 100%)
  const formDataSanitize = new FormData();
  formDataSanitize.append("file", fileData, task.attachment.name);

  const sanitizeResponse = await fetch(`${config.apiUrl}/sanitize`, {
    method: "POST",
    headers: { "x-api-key": config.apiKey },
    body: formDataSanitize
  });

  if (!sanitizeResponse.ok) {
    throw new Error(`Errore sanificazione: ${sanitizeResponse.status}`);
  }

  const safeBlob = await sanitizeResponse.blob();
  const blobUrl = URL.createObjectURL(safeBlob);

  stats.filesSanitized++;

  const logEntry = {
    messageId: task.messageId,
    filename: task.attachment.name,
    sender: task.sender,
    subject: task.subject,
    folder: task.folder,
    date: new Date().toISOString(),
    fileSize: fileData.size,
    status: report.risk_level === "safe" ? "sanitized_clean" : "sanitized_threat",
    riskLevel: report.risk_level,
    riskScore: report.risk_score,
    threats: report.threats || [],
    details: report.details || {},
    sanitized: true
  };

  if (report.risk_level !== "safe") {
    stats.threatsFound++;
  }

  // Notifica con info sulle minacce trovate
  if (config.showNotifications) {
    if (report.risk_level !== "safe") {
      browser.notifications.create(`sanitized-threat-${Date.now()}`, {
        type: "basic",
        title: "🛡️ PDF Pericoloso → Sanificato!",
        message: `"${task.attachment.name}" da ${task.sender} conteneva minacce ed è stato sanificato automaticamente.`
      });
    } else {
      browser.notifications.create(`sanitized-clean-${Date.now()}`, {
        type: "basic",
        title: "✅ PDF Sanificato",
        message: `"${task.attachment.name}" da ${task.sender} è stato sanificato preventivamente.`
      });
    }
  }

  // Scarica automaticamente se l'opzione è attiva
  if (config.autoDownloadSafe) {
    await browser.downloads.download({
      url: blobUrl,
      filename: `SAFE_${task.attachment.name}`,
      saveAs: false
    });
  } else {
    // Salva il blob URL per download successivo dal popup
    logEntry.safeBlobUrl = blobUrl;
  }

  await addScanLog(logEntry);
  await browser.storage.local.set({ stats });

  // Aggiorna il banner nell'anteprima email se il messaggio è visualizzato
  await pushBannerUpdate(task.messageId);
}

// ============================================================
// MENU CONTESTUALE (SCANSIONE/SANIFICAZIONE MANUALE)
// ============================================================
async function onMenuClicked(info, tab) {
  const config = (await browser.storage.local.get("config")).config || DEFAULT_CONFIG;

  if (!info.selectedMessages || !info.selectedMessages.messages) return;

  const action = info.menuItemId === "sanitize-pdf-manual" ? "sanitize" : "scan";

  for (const msg of info.selectedMessages.messages) {
    try {
      const attachments = await browser.messages.listAttachments(msg.id);
      const pdfAttachments = attachments.filter(att =>
        att.name.toLowerCase().endsWith(".pdf") ||
        att.contentType === "application/pdf"
      );

      if (pdfAttachments.length === 0) {
        if (config.showNotifications) {
          browser.notifications.create(`nopdf-${Date.now()}`, {
            type: "basic",
            title: "PDF Sanitizer Pro",
            message: "Nessun allegato PDF trovato in questa email."
          });
        }
        continue;
      }

      for (const att of pdfAttachments) {
        scanQueue.push({
          messageId: msg.id,
          attachment: att,
          sender: msg.author,
          subject: msg.subject,
          date: msg.date,
          folder: "Manuale",
          action: action
        });
      }
    } catch (err) {
      console.error("[PDF Sanitizer Pro] Errore menu contestuale:", err);
    }
  }

  if (scanQueue.length > 0 && !isProcessing) {
    processQueue();
  }
}

// ============================================================
// GESTIONE LOG E BADGE
// ============================================================
async function addScanLog(entry) {
  const config = (await browser.storage.local.get("config")).config || DEFAULT_CONFIG;
  const stored = await browser.storage.local.get("scanLogs");
  let logs = stored.scanLogs || [];

  // Aggiungi in testa (più recente prima)
  logs.unshift(entry);

  // Pulisci log vecchi
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.logRetentionDays);
  logs = logs.filter(log => new Date(log.date) > cutoffDate);

  // Limita a 1000 voci massimo
  if (logs.length > 1000) logs = logs.slice(0, 1000);

  await browser.storage.local.set({ scanLogs: logs });
  updateBadge();
}

async function updateBadge() {
  const stored = await browser.storage.local.get("scanLogs");
  const logs = stored.scanLogs || [];

  // Conta minacce delle ultime 24 ore
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentThreats = logs.filter(l =>
    (l.status === "threat" || l.status === "sanitized_threat") &&
    new Date(l.date) > oneDayAgo
  ).length;

  if (recentThreats > 0) {
    browser.browserAction.setBadgeText({ text: String(recentThreats) });
    browser.browserAction.setBadgeBackgroundColor({ color: "#FF0000" });
  } else {
    browser.browserAction.setBadgeText({ text: "" });
  }
}

// ============================================================
// API PER IL POPUP E LE OPZIONI
// ============================================================
browser.runtime.onMessage.addListener(async (message, sender) => {
  switch (message.type) {
    case "getStats":
      return stats;

    case "getLogs":
      const stored = await browser.storage.local.get("scanLogs");
      return stored.scanLogs || [];

    case "getDisplayedMessageResults":
      // Richiesta dal content script: cerca i risultati per il messaggio visualizzato nel tab
      if (sender.tab && sender.tab.id) {
        const msgId = displayedMessages.get(sender.tab.id);
        if (msgId) {
          try {
            const msg = await browser.messages.get(msgId);
            const results = await getScanResultsForMessage(msg);
            return { results };
          } catch (e) {
            return { results: [] };
          }
        }
      }
      return { results: [] };

    case "getConfig":
      const configStored = await browser.storage.local.get("config");
      return configStored.config || DEFAULT_CONFIG;

    case "saveConfig":
      await browser.storage.local.set({ config: message.config });
      return { success: true };

    case "testConnection":
      try {
        const cfg = (await browser.storage.local.get("config")).config || DEFAULT_CONFIG;
        const healthHeaders = { "x-api-key": cfg.apiKey };
        if (cfg.vtEnabled && cfg.vtApiKey) {
          healthHeaders["x-vt-api-key"] = cfg.vtApiKey;
        }
        const resp = await fetch(`${cfg.apiUrl}/health`, {
          headers: healthHeaders
        });
        if (resp.ok) {
          const data = await resp.json();
          return { success: true, data };
        }
        return { success: false, error: `HTTP ${resp.status}` };
      } catch (e) {
        return { success: false, error: e.message };
      }

    case "clearLogs":
      await browser.storage.local.set({ scanLogs: [] });
      stats = { totalScanned: 0, threatsFound: 0, filesSanitized: 0, lastScanTime: null };
      await browser.storage.local.set({ stats });
      updateBadge();
      return { success: true };

    case "downloadSafe":
      if (message.blobUrl) {
        await browser.downloads.download({
          url: message.blobUrl,
          filename: `SAFE_${message.filename}`,
          saveAs: true
        });
        return { success: true };
      }
      return { success: false, error: "No blob URL" };

    default:
      return { error: "Tipo messaggio non riconosciuto" };
  }
});

// ============================================================
// AVVIO
// ============================================================
initialize();
