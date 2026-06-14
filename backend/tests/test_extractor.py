# tests/test_extractor.py
"""
WHAT WE'RE TESTING:
- PDF extraction returns page-by-page structure
- Page numbers are correct
- Scanned pages are flagged (char_count < 100)
- Markdown sections are split correctly
- Unsupported file types raise clean errors

HOW TO RUN:
  pytest tests/test_extractor.py -v
"""

import pytest
from utils.pdf_extractor import extract, extract_markdown, extract_text_file


class TestPDFExtractor:

    def test_returns_list_of_pages(self, tmp_path):
        """Every page should be a dict with required keys."""
        # Use a real PDF from your test documents folder
        pages = extract("tests/documents/attention_paper.pdf")

        assert isinstance(pages, list)
        assert len(pages) > 0

        for page in pages:
            assert "page" in page
            assert "text" in page
            assert "char_count" in page
            assert "is_scanned" in page

    def test_page_numbers_are_sequential(self):
        pages = extract("tests/documents/attention_paper.pdf")
        page_nums = [p["page"] for p in pages]
        assert page_nums == list(range(1, len(pages) + 1))

    def test_char_count_matches_text_length(self):
        pages = extract("tests/documents/attention_paper.pdf")
        for page in pages:
            assert page["char_count"] == len(page["text"])

    def test_text_content_is_nonempty(self):
        """A real text PDF should have at least 100 chars per page on average."""
        pages = extract("tests/documents/attention_paper.pdf")
        text_pages = [p for p in pages if not p["is_scanned"]]
        avg_chars = sum(p["char_count"] for p in text_pages) / len(text_pages)
        assert avg_chars > 100, f"Average chars per page too low: {avg_chars}"

    def test_scanned_pages_flagged(self):
        """
        If you have a scanned PDF in test documents, it should have
        is_scanned=True on most pages.
        """
        # Skip if no scanned PDF available
        import os
        if not os.path.exists("tests/documents/scanned_sample.pdf"):
            pytest.skip("No scanned PDF in test documents")

        pages = extract("tests/documents/scanned_sample.pdf")
        scanned_count = sum(1 for p in pages if p["is_scanned"])
        assert scanned_count > len(pages) * 0.5, "Scanned PDF not detected"

    def test_unsupported_file_type_raises(self, tmp_path):
        fake_file = tmp_path / "test.xlsx"
        fake_file.write_text("data")
        with pytest.raises(ValueError, match="Unsupported file type"):
            extract(str(fake_file))

    def test_missing_file_raises(self):
        with pytest.raises(FileNotFoundError):
            extract("tests/documents/nonexistent.pdf")


class TestMarkdownExtractor:

    def test_splits_on_headers(self, tmp_path):
        md_content = """# Title

## Introduction
This is the intro section with some content about the topic.

## Methods
This section describes the methodology used.

## Results
Final results are presented here.
"""
        md_file = tmp_path / "test.md"
        md_file.write_text(md_content)
        pages = extract(str(md_file))

        # Should have at least 3 sections
        assert len(pages) >= 3

    def test_no_empty_sections(self, tmp_path):
        md_file = tmp_path / "test.md"
        md_file.write_text("## Section\nContent here\n## Empty\n\n## More\nText")
        pages = extract(str(md_file))
        for page in pages:
            assert page["char_count"] > 0


class TestMultiDocExtraction:
    """
    PRODUCTION TEST: Extract multiple real documents and compare.
    This catches encoding issues, corrupt PDFs, and edge cases.
    """

    def test_all_test_documents(self):
        """Run extraction on every document in tests/documents/ folder."""
        import os
        doc_dir = "tests/documents"
        if not os.path.exists(doc_dir):
            pytest.skip("No test documents directory")

        results = {}
        for filename in os.listdir(doc_dir):
            filepath = os.path.join(doc_dir, filename)
            ext = os.path.splitext(filename)[1].lower()
            if ext not in [".pdf", ".md", ".txt"]:
                continue
            try:
                pages = extract(filepath)
                results[filename] = {
                    "pages": len(pages),
                    "total_chars": sum(p["char_count"] for p in pages),
                    "scanned_pages": sum(1 for p in pages if p.get("is_scanned")),
                    "success": True,
                }
            except Exception as e:
                results[filename] = {"success": False, "error": str(e)}

        # Print a summary table
        print("\n\n── Extraction Test Results ──")
        print(f"{'File':<40} {'Pages':>6} {'Chars':>8} {'Scanned':>8} {'Status':>8}")
        print("─" * 74)
        for name, r in results.items():
            if r["success"]:
                print(f"{name:<40} {r['pages']:>6} {r['total_chars']:>8} "
                      f"{r['scanned_pages']:>8} {'OK':>8}")
            else:
                print(f"{name:<40} {'—':>6} {'—':>8} {'—':>8} {'FAIL':>8}")
                print(f"  Error: {r['error']}")

        failed = [n for n, r in results.items() if not r["success"]]
        assert len(failed) == 0, f"Extraction failed for: {failed}"