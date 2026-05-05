import re
from dataclasses import dataclass

# Each entry: (compiled pattern, human-readable reason, threat_level)
_RULES: list[tuple[re.Pattern, str, int]] = [
    # Direct instruction overrides
    (re.compile(r"ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|constraints?)", re.I),
     "Direct instruction override attempt", 10),
    (re.compile(r"\bDAN\b", re.I),
     "DAN jailbreak pattern detected", 10),
    (re.compile(r"do\s+anything\s+now", re.I),
     "DAN jailbreak pattern detected", 10),

    # System prompt extraction / leakage
    (re.compile(r"\bSYSTEM\s*:", re.I),
     "System-role impersonation attempt", 9),
    (re.compile(r"(reveal|show|print|output|repeat|tell\s+me|give\s+me)\s+(your\s+)?(system\s+prompt|initial\s+instructions?|original\s+prompt|base\s+prompt)", re.I),
     "System prompt extraction attempt", 9),
    (re.compile(r"what\s+(are|were)\s+your\s+(original|initial|base|system)\s+instructions?", re.I),
     "System prompt extraction attempt", 9),

    # Role-play / persona hijacking
    (re.compile(r"(pretend|act|behave|roleplay|role-play|imagine)\s+(you\s+are|you're|as\s+if|like)\s+(a\s+)?(different|new|another|evil|unrestricted|uncensored)", re.I),
     "Persona hijack / role-play injection attempt", 8),
    (re.compile(r"(you\s+are\s+now|from\s+now\s+on\s+you\s+are|forget\s+(you\s+are|that\s+you))", re.I),
     "Identity override attempt", 8),

    # Prompt delimiter smuggling
    (re.compile(r"(```|\[\[|\{\{|<\|im_start\|>|<\|endoftext\|>|####\s*new\s+instructions?)", re.I),
     "Prompt delimiter / token injection attempt", 8),

    # Jailbreak template phrases
    (re.compile(r"(jailbreak|grandma\s+exploit|developer\s+mode|god\s+mode|unrestricted\s+mode)", re.I),
     "Known jailbreak template phrase", 9),
    (re.compile(r"(disregard|bypass|override|circumvent)\s+(your\s+)?(safety|ethical|content)?\s*(guidelines?|rules?|filter|restrictions?|constraints?|policy|policies)", re.I),
     "Safety bypass attempt", 9),

    # Unauthorized commitment / business manipulation
    (re.compile(r"(promise|guarantee|commit|confirm|agree)\s+(to\s+)?(give|offer|provide)\s+(a\s+)?\$?\d", re.I),
     "Unauthorized commercial commitment attempt", 7),
    (re.compile(r"\$\s*0\s*(lease|deal|offer|price|cost|payment)", re.I),
     "Unauthorized $0 commitment attempt", 8),
]


@dataclass
class RegexResult:
    triggered: bool
    reason: str
    threat_level: int


def check(prompt: str) -> RegexResult:
    for pattern, reason, level in _RULES:
        if pattern.search(prompt):
            return RegexResult(triggered=True, reason=reason, threat_level=level)
    return RegexResult(triggered=False, reason="", threat_level=0)
