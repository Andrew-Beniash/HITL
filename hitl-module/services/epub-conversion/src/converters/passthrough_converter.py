"""PassthroughConverter — validates an EPUB and returns it unchanged."""

import hashlib
import pathlib
from datetime import datetime, timezone

from ebooklib import epub

from src.converters.base import BaseConverter, ConversionError


class PassthroughConverter(BaseConverter):
    """Validates the source EPUB via ebooklib; passes bytes through unchanged."""

    def convert(self, source_path: str) -> tuple[bytes, dict]:
        try:
            book = epub.read_epub(source_path, options={"ignore_ncx": True})
        except Exception as exc:
            raise ConversionError(f"Invalid EPUB: {exc}") from exc

        epub_bytes = pathlib.Path(source_path).read_bytes()
        source_hash = hashlib.sha256(epub_bytes).hexdigest()

        degradation_notices: list[str] = []
        version = getattr(book, "version", None) or ""
        if version.startswith("2"):
            degradation_notices.append(
                "Source is EPUB2; some EPUB3 reader features may not be available."
            )

        manifest = {
            "sourceFormat": "epub",
            "sourceFileHash": source_hash,
            "convertedAt": datetime.now(timezone.utc).isoformat(),
            "degradationNotices": degradation_notices,
        }
        return epub_bytes, manifest
