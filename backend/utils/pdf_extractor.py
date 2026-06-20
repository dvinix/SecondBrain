# utils/pdf_extractor.py

from pypdf import PdfReader
from pathlib import Path
from typing import List, Dict
import re
import docx


def extract_pdf(file_path: str) -> List[Dict]:
    """
    Extract text from PDF, page by page.

    Returns:
        List of dicts: [{ "page": 1, "text": "...", "char_count": 450 }]

    Why char_count: used to detect scanned pages (char_count < 100 means
    the page is likely an image — flag it for OCR fallback in the frontend).
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    if path.suffix.lower() != ".pdf":
        raise ValueError(f"Expected PDF, got: {path.suffix}")

    reader = PdfReader(str(path))
    pages = []

    for page_num, page in enumerate(reader.pages, start=1):
        raw_text = page.extract_text() or ""
        cleaned = _clean_text(raw_text)
        pages.append({
            "page": page_num,
            "text": cleaned,
            "char_count": len(cleaned),
            "is_scanned": len(cleaned) < 100,  # flag for OCR fallback
        })

    return pages


def extract_markdown(file_path: str) -> List[Dict]:
    """
    Read a markdown file. Treat each H2/H3 section as its own 'page'
    so citations can reference sections, not just line numbers.
    """
    path = Path(file_path)
    content = path.read_text(encoding="utf-8")

    # Split on H2 or H3 headers
    sections = re.split(r'\n(?=#{2,3} )', content)
    pages = []

    for i, section in enumerate(sections, start=1):
        cleaned = _clean_text(section)
        if cleaned:
            pages.append({
                "page": i,
                "text": cleaned,
                "char_count": len(cleaned),
                "is_scanned": False,
            })

    return pages


def extract_text_file(file_path: str) -> List[Dict]:
    """Plain text files — split into 'pages' of ~2000 chars each."""
    path = Path(file_path)
    content = path.read_text(encoding="utf-8")
    cleaned = _clean_text(content)

    # Split into pseudo-pages of 2000 chars
    page_size = 2000
    pages = []
    for i in range(0, len(cleaned), page_size):
        chunk = cleaned[i:i + page_size]
        if chunk.strip():
            pages.append({
                "page": i // page_size + 1,
                "text": chunk,
                "char_count": len(chunk),
                "is_scanned": False,
            })

    return pages


def extract_docx(file_path: str) -> List[Dict]:
    """
    Extract text from a Word document (.docx).
    Treats the whole document as sequential text, split into pseudo-pages.
    """
    path = Path(file_path)
    try:
        doc = docx.Document(str(path))
    except Exception as e:
        raise ValueError(f"Could not read DOCX file: {e}")

    full_text = []
    for para in doc.paragraphs:
        full_text.append(para.text)

    content = "\n".join(full_text)
    cleaned = _clean_text(content)

    # Split into pseudo-pages of 2000 chars
    page_size = 2000
    pages = []
    for i in range(0, len(cleaned), page_size):
        chunk = cleaned[i:i + page_size]
        if chunk.strip():
            pages.append({
                "page": i // page_size + 1,
                "text": chunk,
                "char_count": len(chunk),
                "is_scanned": False,
            })

    return pages


def extract(file_path: str) -> List[Dict]:
    """
    Universal entry point. Detects file type and routes accordingly.
    Use this in the ingest pipeline — never call individual functions directly.
    """
    ext = Path(file_path).suffix.lower()
    extractors = {
        ".pdf": extract_pdf,
        ".md":  extract_markdown,
        ".txt": extract_text_file,
        ".docx": extract_docx,
        ".doc": extract_docx,  # Attempt parsing .doc with python-docx, though it may fail if it's legacy binary
    }
    if ext not in extractors:
        raise ValueError(f"Unsupported file type: {ext}. Supported: {list(extractors.keys())}")

    return extractors[ext](file_path)


def _clean_text(text: str) -> str:
    """
    Normalize extracted text.
    - Remove excessive whitespace
    - Normalize unicode quotes/dashes
    - Remove null bytes (common in some PDFs)
    """
    text = text.replace("\x00", "")          # null bytes
    text = re.sub(r'\n{3,}', '\n\n', text)   # max 2 consecutive newlines
    text = re.sub(r'[ \t]+', ' ', text)       # collapse spaces/tabs
    text = text.strip()
    return text


