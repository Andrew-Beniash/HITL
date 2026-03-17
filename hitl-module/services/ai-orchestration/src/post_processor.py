from __future__ import annotations

import re

_CONFIDENCE_RE = re.compile(r"Confidence:\s*(High|Medium|Low)")
_CITATION_RE = re.compile(r"\[citation:([^\]]+)\]")
_DIFF_BLOCK_RE = re.compile(r"```diff\n(.*?)```", re.DOTALL)


def extract_confidence(text: str) -> str | None:
    """Return 'High', 'Medium', or 'Low' confidence label, or None."""
    match = _CONFIDENCE_RE.search(text)
    return match.group(1) if match else None


def extract_citations(text: str) -> list[dict]:
    """Return list of {'sourceId': ...} dicts for every [citation:...] token."""
    return [{"sourceId": m.group(1)} for m in _CITATION_RE.finditer(text)]


def extract_edit_suggestion(text: str) -> dict | None:
    """Return {'unifiedDiff': content} from a ```diff ... ``` fenced block, or None."""
    match = _DIFF_BLOCK_RE.search(text)
    return {"unifiedDiff": match.group(1)} if match else None


def clean_response_text(text: str) -> str:
    """Remove [citation:...] tokens from display text."""
    return _CITATION_RE.sub("", text)
