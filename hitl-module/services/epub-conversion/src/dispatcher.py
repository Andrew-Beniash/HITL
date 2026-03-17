"""Format dispatcher — maps source_format to the correct converter."""

from src.converters.base import BaseConverter, ConversionError
from src.converters.pandoc_converter import PandocConverter
from src.converters.passthrough_converter import PassthroughConverter
from src.converters.pdf_converter import PdfConverter
from src.converters.xlsx_epub_converter import XlsxEpubConverter

_CONVERTERS: dict[str, type[BaseConverter]] = {
    "docx": PandocConverter,
    "md": PandocConverter,
    "pdf": PdfConverter,
    "epub": PassthroughConverter,
    "xlsx": XlsxEpubConverter,
}


def dispatch(source_format: str, source_path: str) -> tuple[bytes, dict]:
    """Run the appropriate converter for *source_format*.

    Parameters
    ----------
    source_format:
        One of ``docx``, ``md``, ``pdf``, ``epub``.
    source_path:
        Absolute path to the downloaded source file.

    Returns
    -------
    (epub_bytes, manifest_dict)
    """
    converter_cls = _CONVERTERS.get(source_format.lower())
    if converter_cls is None:
        raise ConversionError(f"Unsupported source format: {source_format!r}")
    return converter_cls().convert(source_path)
