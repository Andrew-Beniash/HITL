"""PandocConverter — converts DOCX and MD files to EPUB3 via Pandoc."""

import hashlib
import pathlib
import subprocess
import tempfile
from datetime import datetime, timezone

from src.converters.base import BaseConverter, ConversionError


class PandocConverter(BaseConverter):
    """Uses the system Pandoc binary to produce EPUB3 from DOCX or Markdown."""

    def convert(self, source_path: str) -> tuple[bytes, dict]:
        source_bytes = pathlib.Path(source_path).read_bytes()
        source_hash = hashlib.sha256(source_bytes).hexdigest()
        source_format = pathlib.Path(source_path).suffix.lstrip(".").lower() or "docx"

        with tempfile.NamedTemporaryFile(suffix=".epub", delete=False) as out_f:
            out_path = out_f.name

        try:
            result = subprocess.run(
                [
                    "pandoc",
                    source_path,
                    "--to", "epub3",
                    "--epub-embed-font",
                    "--toc",
                    "--toc-depth=3",
                    "--track-changes=all",
                    "-o", out_path,
                ],
                capture_output=True,
                timeout=120,
            )
            if result.returncode != 0:
                raise ConversionError(
                    f"Pandoc exited {result.returncode}: {result.stderr.decode(errors='replace')}"
                )
            epub_bytes = pathlib.Path(out_path).read_bytes()
        finally:
            pathlib.Path(out_path).unlink(missing_ok=True)

        manifest = {
            "sourceFormat": source_format,
            "sourceFileHash": source_hash,
            "convertedAt": datetime.now(timezone.utc).isoformat(),
            "degradationNotices": [],
        }
        return epub_bytes, manifest
