"""
Basic content moderation — a curated denylist for user-submitted text
(tour titles, comments). Deliberately simple: a plain word-boundary regex
against a short, hand-maintained list, not a third-party dependency or ML
classifier. Catches the obvious cases; doesn't try to catch everything
(leetspeak substitutions, other languages, etc.) -- paired with the
report-threshold auto-hide in supabase_db.create_content_report for
anything this misses.
"""

import re

# Intentionally short and blunt -- English slurs/profanity likely to show
# up in a tour title or a comment aimed at another walker. Extend this
# list as real reports come in rather than trying to anticipate everything
# up front.
_DENYLIST = [
    "fuck",
    "shit",
    "bitch",
    "asshole",
    "cunt",
    "nigger",
    "nigga",
    "faggot",
    "retard",
    "whore",
    "slut",
]

_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(word) for word in _DENYLIST) + r")\b",
    re.IGNORECASE,
)


def contains_denylisted_content(text: str) -> bool:
    """True if `text` contains a denylisted word as a whole word (word-
    boundary matched, so e.g. "class" doesn't trip on "ass")."""
    if not text:
        return False
    return bool(_PATTERN.search(text))
