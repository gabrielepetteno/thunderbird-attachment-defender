# 🛡️ Thunderbird Attachment Defender

**Automatically scan and sanitize PDF email attachments in Thunderbird — no manual clicks required.**

A self-hosted security extension for Mozilla Thunderbird that monitors every incoming email across all your accounts. When a PDF attachment is detected, it is automatically sent to your own backend server for deep structural analysis and full sanitization, without relying on any third-party cloud service.

> Inspired by [justverifyit/thunderbird](https://github.com/justverifyit/thunderbird) — but goes much further: **automatic scanning, full sanitization, self-hosted backend, and optional VirusTotal integration.**

---

## ✨ Key Features

| Feature | justverifyit/thunderbird | **Thunderbird Attachment Defender** |
|---|---|---|
| Requires manual button click | ✅ Yes | ❌ **Fully automatic** |
| Scans attachments | ✅ VirusTotal only | ✅ Deep local analysis + optional VirusTotal |
| Sanitizes (removes threats) | ❌ No | ✅ **Yes — destroys malicious code** |
| Self-hosted backend | ❌ No | ✅ **Your server, your data** |
| Works offline | ❌ No | ✅ **Yes** |
| Privacy (no data to third parties) | ❌ Files sent to VirusTotal | ✅ **Files stay on your server** |
| Real-time dashboard | ❌ No | ✅ Yes |
| Auto-start on boot | ❌ No | ✅ Yes (Windows service) |

---

## 🔍 Threats Detected

The backend performs a **deep structural analysis** of every PDF:

- 🔴 **Embedded JavaScript** — scripts that execute on open
- 🔴 **Auto-open actions** (OpenAction / AA) — code that runs without user interaction
- 🔴 **Launch actions** — attempts to execute external programs
- 🟠 **Embedded files** — hidden executables (.exe, .bat, .vbs, .ps1…)
- 🟠 **Suspicious external links** — URL shorteners, IPs, known malicious TLDs
- 🟠 **Interactive forms** (AcroForm) — phishing data collectors
- 🟡 **Encrypted/locked PDFs** — may hide malicious content
- 🟡 **Rich media / 3D content** — known exploit delivery vectors
- ☁️ **VirusTotal cross-check** (optional) — 70+ antivirus engines via hash lookup

### How Sanitization Works

The sanitization process is inspired by [Dangerzone](https://github.com/freedomofpress/dangerzone):

1. Each page of the PDF is rendered into a flat pixel image (rasterized at 150 DPI)
2. A brand-new PDF is built from those images — no metadata, no scripts, no objects
3. The original file is deleted from the server immediately after processing

**Any embedded code, script, macro, or exploit is physically destroyed** — it cannot survive the pixel conversion.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│         Mozilla Thunderbird         │
│                                     │
│  ┌─────────────────────────────┐    │
│  │   Attachment Defender       │    │
│  │   (WebExtension)            │    │
│  │                             │    │
│  │  • Auto-detects new emails  │    │
│  │  • Finds PDF attachments    │    │
│  │  • Sends to backend API     │    │
│  │  • Shows results + badge    │    │
│  └────────────┬────────────────┘    │
└───────────────┼─────────────────────┘
                │ HTTP (your network)
                ▼
┌─────────────────────────────────────┐
│     Backend Server (Python)         │
│     Windows VPS or local PC         │
│                                     │
│  POST /analyze  → threat report     │
│  POST /sanitize → clean PDF         │
│  GET  /health   → status check      │
│                                     │
│  • PyMuPDF deep PDF analysis        │
│  • Page-to-image sanitization       │
│  • Optional VirusTotal API check    │
│  • Runs as Windows Service          │
│  • Auto-restarts on crash/reboot    │
└─────────────────────────────────────┘
```

The backend can run:
- On a **Windows VPS** accessible from anywhere
- On the **same PC** as Thunderbird (`http://localhost:9097`) for maximum privacy

> **Is running it locally safe?** Yes — the server only listens on your configured port, uses API key authentication, and the PDF processing happens entirely on your machine. The sanitized output never contains active code.

---

## 🚀 Installation

### Prerequisites

- [Mozilla Thunderbird](https://www.thunderbird.net/) 115.0 or later
- [Python 3.10+](https://www.python.org/downloads/) (for the backend server)
- A Windows machine (VPS or local) to run the backend

---

### Step 1 — Set up the Backend Server

#### Option A: Windows VPS (recommended — always on)

1. Copy the `server/` folder to your Windows VPS (e.g. `C:\PDF_Sanitizer\`)
2. Copy `server/config.example.py` to `server/config.py` and edit it:

```python
API_SECRET_KEY     = "your-strong-random-key-here"  # required
VIRUSTOTAL_API_KEY = "your-vt-key"                   # optional
SERVER_PORT        = 9097
```

3. Open a Command Prompt **as Administrator** in `C:\PDF_Sanitizer\` and run:

```bat
INSTALLA_TUTTO.bat
```

This single script will:
- Install Python dependencies (`fastapi`, `uvicorn`, `pymupdf`, `python-multipart`)
- Open port 9097 in Windows Firewall
- Download NSSM and install the server as a **Windows Service**
- The service starts automatically at boot and restarts itself after any crash

4. Verify it's running:

```bat
sc query PDFSanitizerPro
```

Expected output: `STATE: 4 RUNNING`

5. Test from your browser: `http://YOUR_SERVER_IP:9097/docs`

#### Option B: Local machine (same PC as Thunderbird)

Follow the same steps above. In the extension settings, use `http://localhost:9097` as the server URL. Your PDF files never leave your machine.

---

### Step 2 — Install the Thunderbird Extension

1. Open Thunderbird
2. Menu → **Add-ons and Themes** → gear icon ⚙️ → **Debug Add-ons**
3. Click **Load Temporary Add-on...**
4. Select `extension/manifest.json` from this repository

> For permanent installation, package the `extension/` folder as a `.xpi` file and install it via the Add-ons Manager.

---

### Step 3 — Configure the Extension

Click the 🛡️ shield icon in the Thunderbird toolbar → **⚙️ Settings**

| Setting | Description |
|---|---|
| **Server URL** | Your backend address, e.g. `http://YOUR_SERVER_IP:9097` or `http://localhost:9097` |
| **API Key** | Must match `API_SECRET_KEY` in `config.py` |
| **Auto-scan on arrival** | Scan every incoming email automatically (recommended: ON) |
| **Auto-sanitize** | Also create a sanitized version of every PDF (recommended: ON) |
| **Notifications** | Show desktop alerts for threats and scan results |

Click **🔌 Test Connection** to verify the extension can reach your server.

---

## ⚙️ Configuration Reference

### Backend (`server/config.py`)

```python
API_SECRET_KEY     = "your-secret-key"   # required — shared with extension
VIRUSTOTAL_API_KEY = ""                  # optional — free key from virustotal.com
SERVER_PORT        = 9097                # port to listen on
SANITIZE_DPI       = 150                 # rendering quality (120–200)
MAX_FILE_SIZE      = 50 * 1024 * 1024   # max PDF size (bytes)
```

### Generating a secure API key

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### VirusTotal (optional)

Get a free API key at [virustotal.com](https://www.virustotal.com/gui/my-apikey). The free tier allows 4 lookups/minute and 500/day. The backend first checks the file **hash** (no upload, no privacy concern); it only uploads the file if the hash is unknown to VirusTotal.

---

## 📊 Extension Dashboard

Click the 🛡️ icon in the toolbar to open the dashboard:

- **Server status** — live connection indicator (green/red)
- **Scanned / Threats / Sanitized** — counters since installation
- **Activity log** — last 20 PDFs processed with risk level, sender, and detected threats
- **Settings** — open configuration page
- **Clear logs** — wipe the activity history

The icon badge turns **red** with a count whenever threats are detected in the last 24 hours.

---

## 🔒 Security Notes

- The backend API is protected by a secret API key — never expose it publicly without the key
- All temporary PDF files are deleted from the server immediately after processing
- The sanitized PDF contains only pixel images — no metadata, no scripts, no interactive elements
- If running on a public VPS, consider adding HTTPS via a reverse proxy (nginx + Let's Encrypt)
- The extension only sends PDFs to the server you configure — it never contacts external services (except VirusTotal if you enable it)

---

## 🛠️ Windows Service Commands

After installation, manage the service from an Admin Command Prompt:

```bat
sc query PDFSanitizerPro                        # check status
C:\PDF_Sanitizer\nssm.exe start PDFSanitizerPro    # start
C:\PDF_Sanitizer\nssm.exe stop PDFSanitizerPro     # stop
C:\PDF_Sanitizer\nssm.exe restart PDFSanitizerPro  # restart
C:\PDF_Sanitizer\nssm.exe remove PDFSanitizerPro confirm  # uninstall
```

Logs are saved to `C:\PDF_Sanitizer\logs\`.

---

## 📁 Project Structure

```
thunderbird-attachment-defender/
├── extension/                  # Thunderbird WebExtension
│   ├── manifest.json
│   ├── background.js           # Core logic: auto-scan, queue, sanitize
│   ├── popup/                  # Dashboard UI (popup.html + popup.js)
│   ├── options/                # Settings page (options.html + options.js)
│   └── icons/                  # SVG shield icons
└── server/                     # Self-hosted Python backend
    ├── server.py               # FastAPI app (analyze + sanitize endpoints)
    ├── config.example.py       # Configuration template → copy to config.py
    ├── requirements.txt        # Python dependencies
    ├── INSTALLA_TUTTO.bat      # One-click Windows setup (run as Admin)
    ├── start_server.bat        # Manual start with auto-restart loop
    └── install_service.ps1     # PowerShell alternative installer
```

---

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Ideas for future improvements:
- macOS / Linux backend support
- `.docx` and `.xlsx` attachment scanning
- HTTPS support built-in (via self-signed cert)
- Thunderbird Add-on Store packaging (`.xpi`)
- Docker backend option

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

## 🙏 Acknowledgements

- [justverifyit/thunderbird](https://github.com/justverifyit/thunderbird) — original inspiration
- [Dangerzone](https://github.com/freedomofpress/dangerzone) — sanitization concept (page-to-pixel)
- [PyMuPDF](https://pymupdf.readthedocs.io/) — fast and powerful PDF processing
- [FastAPI](https://fastapi.tiangolo.com/) — modern Python web framework
- [VirusTotal](https://www.virustotal.com/) — optional cloud malware database
