"""
Thunderbird Attachment Defender — Backend API
=============================================
Self-hosted FastAPI server for deep PDF analysis and sanitization.
Install on a Windows VPS or on the same machine running Thunderbird.

Endpoints:
  GET  /health    → Server health check
  POST /analyze   → Deep PDF threat analysis (returns JSON report)
  POST /sanitize  → Full sanitization (converts pages to flat images, rebuilds clean PDF)

Threats detected:
  - Embedded JavaScript
  - Auto-open actions (OpenAction, AA)
  - Suspicious external links
  - Embedded files (OLE objects, hidden attachments)
  - Interactive forms (AcroForm phishing)
  - Encrypted/locked PDFs
  - Launch actions (attempt to execute external programs)
  - Rich media / 3D content (known exploit vectors)

Optional:
  - VirusTotal cloud check (set VIRUSTOTAL_API_KEY in config.py)

Installation:
  pip install -r requirements.txt

Start:
  python server.py
  (or: uvicorn server:app --host 0.0.0.0 --port 9097)

GitHub: https://github.com/YOUR_USERNAME/thunderbird-attachment-defender
License: MIT
"""

import fitz  # PyMuPDF
from fastapi import FastAPI, UploadFile, File, Header, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import re
import uuid
import hashlib
import logging
from datetime import datetime

# ============================================================
# CONFIGURATION — edit these values or use config.py
# ============================================================

# Load from config.py if it exists, otherwise use defaults
try:
    import config
    API_SECRET_KEY    = config.API_SECRET_KEY
    VIRUSTOTAL_API_KEY = getattr(config, "VIRUSTOTAL_API_KEY", "")
    SERVER_PORT       = getattr(config, "SERVER_PORT", 9097)
    SANITIZE_DPI      = getattr(config, "SANITIZE_DPI", 150)
    MAX_FILE_SIZE     = getattr(config, "MAX_FILE_SIZE", 50 * 1024 * 1024)
except ImportError:
    # Defaults — CHANGE API_SECRET_KEY before running!
    API_SECRET_KEY     = "CHANGE_THIS_TO_A_STRONG_SECRET_KEY"
    VIRUSTOTAL_API_KEY = ""        # Optional: set to enable cloud VirusTotal check
    SERVER_PORT        = 9097
    SANITIZE_DPI       = 150      # DPI for page-to-image conversion (quality vs size)
    MAX_FILE_SIZE      = 50 * 1024 * 1024  # Max accepted file size (50 MB)

# Temp folder for files being processed
TEMP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("sanitizer.log", encoding="utf-8")
    ]
)
logger = logging.getLogger("PDFSanitizer")

# ============================================================
# APP FASTAPI
# ============================================================

app = FastAPI(
    title="Thunderbird Attachment Defender API",
    version="1.0.0",
    description="Self-hosted API for deep PDF threat analysis and sanitization"
)

# Allow requests from any origin (required for Thunderbird extension)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Statistiche in memoria
server_stats = {
    "start_time": datetime.now().isoformat(),
    "total_analyzed": 0,
    "total_sanitized": 0,
    "threats_found": 0
}


# ============================================================
# AUTHENTICATION
# ============================================================

def verify_api_key(x_api_key: str = Header(None)):
    if x_api_key != API_SECRET_KEY:
        logger.warning(f"Unauthorized access attempt with key: {x_api_key}")
        raise HTTPException(status_code=401, detail="Invalid API key")


# ============================================================
# VIRUSTOTAL INTEGRATION (optional)
# ============================================================

async def check_virustotal(file_bytes: bytes, filename: str) -> dict:
    """
    Check file hash against VirusTotal (optional cloud cross-check).
    Only runs if VIRUSTOTAL_API_KEY is configured.
    Returns a dict with vt_detected, vt_engines, vt_link or vt_error.
    """
    if not VIRUSTOTAL_API_KEY:
        return {"vt_enabled": False}

    import urllib.request
    import json as _json

    sha256 = hashlib.sha256(file_bytes).hexdigest()
    headers = {"x-apikey": VIRUSTOTAL_API_KEY}

    try:
        # First: check if hash already known (no upload needed)
        req = urllib.request.Request(
            f"https://www.virustotal.com/api/v3/files/{sha256}",
            headers=headers
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = _json.loads(resp.read())
                stats = data["data"]["attributes"]["last_analysis_stats"]
                total = sum(stats.values())
                detected = stats.get("malicious", 0) + stats.get("suspicious", 0)
                return {
                    "vt_enabled": True,
                    "vt_detected": detected > 0,
                    "vt_malicious": stats.get("malicious", 0),
                    "vt_suspicious": stats.get("suspicious", 0),
                    "vt_total_engines": total,
                    "vt_link": f"https://www.virustotal.com/gui/file/{sha256}",
                    "vt_source": "hash_lookup"
                }
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise

        # Hash not found: upload the file
        import io, mimetypes
        boundary = uuid.uuid4().hex
        body = (
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f'Content-Type: application/octet-stream\r\n\r\n'
        ).encode() + file_bytes + f'\r\n--{boundary}--\r\n'.encode()

        upload_req = urllib.request.Request(
            "https://www.virustotal.com/api/v3/files",
            data=body,
            headers={**headers, "Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST"
        )
        with urllib.request.urlopen(upload_req, timeout=30) as resp:
            upload_data = _json.loads(resp.read())
            analysis_id = upload_data["data"]["id"]
            return {
                "vt_enabled": True,
                "vt_detected": None,
                "vt_analysis_id": analysis_id,
                "vt_link": f"https://www.virustotal.com/gui/file/{sha256}",
                "vt_source": "uploaded",
                "vt_note": "File uploaded for analysis. Check vt_link for results."
            }

    except Exception as e:
        logger.warning(f"VirusTotal check failed: {e}")
        return {"vt_enabled": True, "vt_error": str(e)}


# ============================================================
# ANALISI APPROFONDITA PDF
# ============================================================

# Pattern sospetti nelle stringhe del PDF
SUSPICIOUS_URL_PATTERNS = [
    r"https?://bit\.ly/",
    r"https?://tinyurl\.com/",
    r"https?://t\.co/",
    r"https?://goo\.gl/",
    r"https?://[^/]*\.ru/",
    r"https?://[^/]*\.cn/",
    r"https?://[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}",
    r"data:application/",
    r"javascript:",
]


def analyze_pdf_deep(filepath: str) -> dict:
    """
    Analisi approfondita di un file PDF.
    Restituisce un report dettagliato con livello di rischio e minacce trovate.
    """
    threats = []
    details = {
        "pages": 0,
        "has_javascript": False,
        "has_auto_actions": False,
        "has_embedded_files": False,
        "has_forms": False,
        "has_encryption": False,
        "has_launch_actions": False,
        "has_suspicious_links": False,
        "has_rich_media": False,
        "suspicious_links": [],
        "embedded_file_names": [],
        "javascript_count": 0,
        "link_count": 0,
        "annotation_count": 0,
    }

    try:
        doc = fitz.open(filepath)
    except Exception as e:
        return {
            "risk_level": "high",
            "risk_score": 90,
            "threats": [f"Impossibile aprire il PDF: {str(e)} — potrebbe essere corrotto o contenere exploit"],
            "details": details
        }

    try:
        details["pages"] = doc.page_count

        # === 1. CONTROLLO METADATI E STRUTTURA ===
        metadata = doc.metadata or {}

        # Controlla se il PDF è cifrato
        if doc.is_encrypted:
            details["has_encryption"] = True
            threats.append("PDF cifrato/protetto — potrebbe nascondere contenuti malevoli")

        # === 2. ANALISI XREF (Cross Reference Table) ===
        # Cerca oggetti sospetti nella struttura interna del PDF
        xref_count = doc.xref_length()
        for xref in range(1, xref_count):
            try:
                xref_str = doc.xref_object(xref)
            except Exception:
                continue

            # JavaScript
            if "/JavaScript" in xref_str or "/JS " in xref_str or "/JS(" in xref_str:
                details["has_javascript"] = True
                details["javascript_count"] += 1

            # Azioni automatiche all'apertura
            if "/OpenAction" in xref_str or "/AA " in xref_str or "/AA<<" in xref_str:
                details["has_auto_actions"] = True

            # Launch actions (esecuzione programmi esterni)
            if "/Launch" in xref_str:
                details["has_launch_actions"] = True

            # File embedded (OLE objects, allegati interni)
            if "/EmbeddedFile" in xref_str or "/Filespec" in xref_str:
                details["has_embedded_files"] = True

            # Form interattivi
            if "/AcroForm" in xref_str:
                details["has_forms"] = True

            # Multimedia / RichMedia / 3D
            if "/RichMedia" in xref_str or "/3D" in xref_str:
                details["has_rich_media"] = True

            # URI sospetti
            if "/URI" in xref_str:
                # Estrai l'URL
                uri_match = re.search(r'/URI\s*\((.*?)\)', xref_str)
                if not uri_match:
                    uri_match = re.search(r'/URI\s*<(.*?)>', xref_str)
                if uri_match:
                    url = uri_match.group(1)
                    details["link_count"] += 1
                    for pattern in SUSPICIOUS_URL_PATTERNS:
                        if re.search(pattern, url, re.IGNORECASE):
                            details["has_suspicious_links"] = True
                            if url not in details["suspicious_links"]:
                                details["suspicious_links"].append(url)

        # === 3. CONTROLLO FILE EMBEDDED ===
        try:
            embedded_count = doc.embfile_count()
            if embedded_count > 0:
                details["has_embedded_files"] = True
                for i in range(embedded_count):
                    info = doc.embfile_info(i)
                    name = info.get("filename", f"file_{i}")
                    details["embedded_file_names"].append(name)
                    # Estensioni pericolose
                    dangerous_ext = [".exe", ".bat", ".cmd", ".vbs", ".js", ".ps1",
                                     ".scr", ".pif", ".com", ".msi", ".dll", ".hta"]
                    if any(name.lower().endswith(ext) for ext in dangerous_ext):
                        threats.append(f"File eseguibile embedded: {name}")
        except Exception:
            pass

        # === 4. ANALISI ANNOTAZIONI E LINK PER PAGINA ===
        for page_num in range(doc.page_count):
            try:
                page = doc[page_num]
                annotations = page.annots()
                if annotations:
                    for annot in annotations:
                        details["annotation_count"] += 1
                        # Controlla annotazioni con azioni
                        try:
                            if annot.info.get("content", ""):
                                content = annot.info["content"]
                                for pattern in SUSPICIOUS_URL_PATTERNS:
                                    if re.search(pattern, content, re.IGNORECASE):
                                        details["has_suspicious_links"] = True
                        except Exception:
                            pass
            except Exception:
                continue

        doc.close()

    except Exception as e:
        logger.error(f"Errore durante l'analisi: {e}")
        threats.append(f"Errore durante l'analisi approfondita: {str(e)}")

    # === 5. CALCOLO RISCHIO ===
    if details["has_javascript"]:
        threats.append(f"JavaScript embedded rilevato ({details['javascript_count']} istanze)")
    if details["has_auto_actions"]:
        threats.append("Azioni automatiche all'apertura del documento (OpenAction/AA)")
    if details["has_launch_actions"]:
        threats.append("Launch Action: il PDF tenta di eseguire programmi esterni")
    if details["has_embedded_files"]:
        file_list = ", ".join(details["embedded_file_names"][:5])
        threats.append(f"File embedded nel PDF: {file_list or 'rilevati'}")
    if details["has_forms"]:
        threats.append("Form interattivi (AcroForm) — possibile phishing")
    if details["has_suspicious_links"]:
        link_list = ", ".join(details["suspicious_links"][:3])
        threats.append(f"Link sospetti: {link_list}")
    if details["has_rich_media"]:
        threats.append("Contenuto multimediale/3D embedded — vettore di exploit noto")

    # Punteggio rischio (0-100)
    risk_score = 0
    if details["has_javascript"]:
        risk_score += 40
    if details["has_auto_actions"]:
        risk_score += 25
    if details["has_launch_actions"]:
        risk_score += 35
    if details["has_embedded_files"]:
        risk_score += 20
    if details["has_forms"]:
        risk_score += 10
    if details["has_suspicious_links"]:
        risk_score += 15
    if details["has_encryption"]:
        risk_score += 10
    if details["has_rich_media"]:
        risk_score += 15

    risk_score = min(risk_score, 100)

    if risk_score == 0:
        risk_level = "safe"
    elif risk_score <= 20:
        risk_level = "low"
    elif risk_score <= 50:
        risk_level = "medium"
    else:
        risk_level = "high"

    return {
        "risk_level": risk_level,
        "risk_score": risk_score,
        "threats": threats,
        "details": details
    }


# ============================================================
# SANIFICAZIONE PDF (Metodo Dangerzone)
# ============================================================

def sanitize_pdf_file(input_path: str, output_path: str, dpi: int = SANITIZE_DPI):
    """
    Sanifica un PDF convertendo ogni pagina in immagine piatta.
    Questo distrugge fisicamente qualsiasi codice, script, macro o exploit.
    """
    doc = fitz.open(input_path)
    safe_doc = fitz.open()
    total_pages = doc.page_count  # Salva PRIMA di chiudere

    for page_num in range(total_pages):
        page = doc[page_num]

        # Converti la pagina in pixel (immagine raster)
        pix = page.get_pixmap(dpi=dpi)

        # Crea nuova pagina bianca con le stesse dimensioni
        safe_page = safe_doc.new_page(
            width=page.rect.width,
            height=page.rect.height
        )

        # "Stampa" i pixel sulla pagina nuova — addio virus!
        safe_page.insert_image(safe_page.rect, stream=pix.tobytes("png"))

        logger.info(f"  Pagina {page_num + 1}/{total_pages} sanificata")

    # Salva il PDF pulito con compressione
    safe_doc.save(output_path, deflate=True, garbage=4)
    safe_doc.close()
    doc.close()

    return {
        "pages_processed": total_pages,
        "output_size": os.path.getsize(output_path)
    }


# ============================================================
# UTILITY
# ============================================================

def cleanup_files(*files):
    """Delete temporary files."""
    for f in files:
        try:
            if f and os.path.exists(f):
                os.remove(f)
        except Exception as e:
            logger.warning(f"Could not delete {f}: {e}")


# ============================================================
# API ENDPOINTS
# ============================================================

@app.get("/health")
async def health_check(x_api_key: str = Header(None)):
    """Health check — confirms server is running."""
    verify_api_key(x_api_key)
    return {
        "status": "online",
        "name": "Thunderbird Attachment Defender",
        "version": "1.0.0",
        "pymupdf_version": fitz.version[0],
        "virustotal_enabled": bool(VIRUSTOTAL_API_KEY),
        "uptime_since": server_stats["start_time"],
        "stats": server_stats
    }


@app.post("/analyze")
async def analyze_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    x_api_key: str = Header(None)
):
    """
    Deep PDF threat analysis.
    Does NOT modify the file — returns a JSON threat report.
    Optionally cross-checks with VirusTotal if API key is configured.
    """
    verify_api_key(x_api_key)

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(contents) / 1024 / 1024:.1f} MB). Max: {MAX_FILE_SIZE / 1024 / 1024:.0f} MB"
        )

    task_id = str(uuid.uuid4())
    input_path = os.path.join(TEMP_DIR, f"analyze_{task_id}.pdf")

    with open(input_path, "wb") as f:
        f.write(contents)

    logger.info(f"[ANALYZE] File: {file.filename} ({len(contents) / 1024:.1f} KB)")

    try:
        report = analyze_pdf_deep(input_path)
        report["filename"] = file.filename
        report["file_size"] = len(contents)
        report["analyzed_at"] = datetime.now().isoformat()

        # Optional VirusTotal cloud check
        vt_result = await check_virustotal(contents, file.filename)
        report["virustotal"] = vt_result
        if vt_result.get("vt_detected"):
            report["threats"].append(
                f"VirusTotal: {vt_result.get('vt_malicious',0)} malicious, "
                f"{vt_result.get('vt_suspicious',0)} suspicious "
                f"out of {vt_result.get('vt_total_engines',0)} engines"
            )
            if report["risk_score"] < 60:
                report["risk_score"] = max(report["risk_score"], 60)
                report["risk_level"] = "high"

        server_stats["total_analyzed"] += 1
        if report["risk_level"] != "safe":
            server_stats["threats_found"] += 1

        logger.info(f"[ANALYZE] Result: {report['risk_level']} (score: {report['risk_score']}) — {len(report['threats'])} threats")

        background_tasks.add_task(cleanup_files, input_path)

        return JSONResponse(content=report)

    except Exception as e:
        cleanup_files(input_path)
        logger.error(f"[ANALYZE] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")


@app.post("/sanitize")
async def sanitize_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    x_api_key: str = Header(None)
):
    """
    Full PDF sanitization: converts every page to a flat raster image,
    then rebuilds a clean PDF. Destroys any embedded code, scripts or exploits.
    Returns the sanitized PDF file.
    """
    verify_api_key(x_api_key)

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(contents) / 1024 / 1024:.1f} MB). Max: {MAX_FILE_SIZE / 1024 / 1024:.0f} MB"
        )

    task_id = str(uuid.uuid4())
    input_path = os.path.join(TEMP_DIR, f"in_{task_id}.pdf")
    output_path = os.path.join(TEMP_DIR, f"out_{task_id}.pdf")

    with open(input_path, "wb") as f:
        f.write(contents)

    logger.info(f"[SANITIZE] File: {file.filename} ({len(contents) / 1024:.1f} KB)")

    try:
        result = sanitize_pdf_file(input_path, output_path)

        server_stats["total_sanitized"] += 1

        logger.info(
            f"[SANITIZE] Done: {result['pages_processed']} pages, "
            f"output: {result['output_size'] / 1024:.1f} KB"
        )

        background_tasks.add_task(cleanup_files, input_path, output_path)

        return FileResponse(
            output_path,
            media_type="application/pdf",
            filename=f"SAFE_{file.filename}"
        )

    except Exception as e:
        cleanup_files(input_path, output_path)
        logger.error(f"[SANITIZE] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Sanitization error: {str(e)}")


# ============================================================
# STARTUP
# ============================================================

if __name__ == "__main__":
    import uvicorn
    logger.info("=" * 60)
    logger.info("  Thunderbird Attachment Defender — API Server v1.0.0")
    logger.info(f"  Listening on http://0.0.0.0:{SERVER_PORT}")
    logger.info(f"  VirusTotal integration: {'ENABLED' if VIRUSTOTAL_API_KEY else 'disabled (set VIRUSTOTAL_API_KEY in config.py)'}")
    logger.info(f"  API docs: http://localhost:{SERVER_PORT}/docs")
    logger.info("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=SERVER_PORT)
