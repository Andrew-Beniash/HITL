from abc import ABC, abstractmethod


class ConversionError(Exception):
    """Raised when a converter fails to produce a valid EPUB."""


class BaseConverter(ABC):
    @abstractmethod
    def convert(self, source_path: str) -> tuple[bytes, dict]:
        """Convert *source_path* to EPUB3.

        Returns
        -------
        epub_bytes : bytes
            Raw bytes of the resulting EPUB3 file.
        manifest : dict
            ConversionManifest with at minimum:
            ``sourceFormat``, ``sourceFileHash``, ``convertedAt``,
            ``degradationNotices``.
        """
