"""PdfConverter — PDF → EPUB3 using pdfminer.six (text) + PyMuPDF (images)."""

import hashlib
import html as html_mod
import io
import pathlib
import tempfile
from datetime import datetime, timezone

import fitz  # PyMuPDF
from ebooklib import epub
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTTextContainer

from src.converters.base import BaseConverter, ConversionError


def _extract_page_texts(source_path: str) -> list[str]:
    """Return a list of HTML strings (one per page) using pdfminer."""
    pages: list[str] = []
    for page_layout in extract_pages(source_path):
        parts: list[str] = []
        for element in page_layout:
            if isinstance(element, LTTextContainer):
                text = element.get_text().strip()
                if text:
                    parts.append(f"<p>{html_mod.escape(text)}</p>")
        pages.append("\n".join(parts))
    return pages


class PdfConverter(BaseConverter):
    """Converts PDF pages to EPUB chapters with embedded images."""

    def convert(self, source_path: str) -> tuple[bytes, dict]:
        source_bytes = pathlib.Path(source_path).read_bytes()
        source_hash = hashlib.sha256(source_bytes).hexdigest()

        try:
            page_texts = _extract_page_texts(source_path)
        except Exception as exc:
            raise ConversionError(f"pdfminer extraction failed: {exc}") from exc

        try:
            doc = fitz.open(source_path)
        except Exception as exc:
            raise ConversionError(f"PyMuPDF open failed: {exc}") from exc

        book = epub.EpubBook()
        book.set_title(pathlib.Path(source_path).stem)
        book.set_language("en")

        chapters: list[epub.EpubHtml] = []

        for page_num in range(len(doc)):
            page = doc[page_num]
            text_html = page_texts[page_num] if page_num < len(page_texts) else ""
            image_html_parts: list[str] = []

            for img_idx, img_info in enumerate(page.get_images(full=True)):
                xref = img_info[0]
                try:
                    base_image = doc.extract_image(xref)
                except Exception:
                    continue
                img_bytes = base_image["image"]
                img_ext = base_image.get("ext", "png")
                img_name = f"images/p{page_num + 1}_{img_idx + 1}.{img_ext}"

                epub_img = epub.EpubImage()
                epub_img.file_name = img_name
                epub_img.media_type = f"image/{img_ext}"
                epub_img.content = img_bytes
                book.add_item(epub_img)

                image_html_parts.append(
                    f'<figure><img src="../{img_name}" alt="Figure {img_idx + 1}"/></figure>'
                )

            page_break = (
                f'<div class="page-break" data-page-number="{page_num + 1}"/>'
                if page_num > 0
                else ""
            )
            images_html = "\n".join(image_html_parts)

            chapter_html = (
                "<?xml version='1.0' encoding='utf-8'?>"
                "<!DOCTYPE html>"
                '<html xmlns="http://www.w3.org/1999/xhtml">'
                f"<head><title>Page {page_num + 1}</title></head>"
                f"<body>{page_break}\n{text_html}\n{images_html}</body>"
                "</html>"
            )

            ch = epub.EpubHtml(
                title=f"Page {page_num + 1}",
                file_name=f"page_{page_num + 1}.xhtml",
                lang="en",
            )
            ch.content = chapter_html
            book.add_item(ch)
            chapters.append(ch)

        doc.close()

        book.add_item(epub.EpubNcx())
        book.add_item(epub.EpubNav())
        book.toc = chapters  # type: ignore[assignment]
        book.spine = ["nav"] + chapters  # type: ignore[list-item]

        with tempfile.NamedTemporaryFile(suffix=".epub", delete=False) as f:
            tmp_path = f.name
        try:
            epub.write_epub(tmp_path, book)
            epub_bytes = pathlib.Path(tmp_path).read_bytes()
        finally:
            pathlib.Path(tmp_path).unlink(missing_ok=True)

        manifest = {
            "sourceFormat": "pdf",
            "sourceFileHash": source_hash,
            "convertedAt": datetime.now(timezone.utc).isoformat(),
            "pageCount": len(doc) if not doc.is_closed else page_num + 1,
            "degradationNotices": [],
        }
        return epub_bytes, manifest
