from typing import List, Optional

STANDARD_CLAUSES = [
    {
        "name": "Indemnification",
        "keywords": ["indemnif", "hold harmless", "defend and hold", "indemnity"]
    },
    {
        "name": "Limitation of Liability",
        "keywords": ["limitation of liability", "consequential damages", "aggregate liability", "cap on liability", "liability cap", "indirect damages", "special damages"]
    },
    {
        "name": "Termination for Convenience",
        "keywords": ["termination for convenience", "terminate without cause", "terminate at any time upon", "without cause upon", "written notice of termination"]
    },
    {
        "name": "Governing Law & Jurisdiction",
        "keywords": ["governing law", "jurisdiction", "venue", "laws of the state", "exclusive jurisdiction", "arbitration", "choice of law"]
    },
    {
        "name": "Confidentiality & Non-Disclosure",
        "keywords": ["confidential information", "non-disclosure", "proprietary information", "trade secrets", "duty of confidentiality"]
    },
    {
        "name": "Intellectual Property Rights",
        "keywords": ["intellectual property", "ownership of work product", "work made for hire", "ip rights", "proprietary rights", "assignment of inventions"]
    },
    {
        "name": "Force Majeure",
        "keywords": ["force majeure", "act of god", "unforeseeable circumstances", "acts of government", "epidemic", "pandemic", "labor dispute"]
    },
    {
        "name": "Representations & Warranties",
        "keywords": ["representations and warranties", "warrants that", "as is", "express or implied warranties", "disclaimer of warranties", "warranty"]
    },
    {
        "name": "Data Protection / Privacy",
        "keywords": ["data protection", "gdpr", "personally identifiable", "data processing", "security measures", "data privacy", "ccpa", "confidential data"]
    },
    {
        "name": "Payment Terms & Late Fees",
        "keywords": ["payment terms", "net 30", "net 60", "invoicing", "late fee", "interest rate", "due upon receipt", "fees and payment"]
    }
]

def scan_missing_clauses(chunks: List[dict], full_text: Optional[str] = None) -> List[str]:
    """
    Performs deterministic keyword coverage scan across document chunks / full text
    to identify missing standard commercial contractual clauses.
    """
    if full_text and full_text.strip():
        combined_text = full_text.lower()
    else:
        texts = []
        for c in chunks:
            if isinstance(c, dict):
                chunk_str = c.get("parent") or c.get("child") or c.get("text") or ""
                texts.append(chunk_str)
            elif isinstance(c, str):
                texts.append(c)
        combined_text = " ".join(texts).lower()

    missing = []
    for clause in STANDARD_CLAUSES:
        found = any(kw.lower() in combined_text for kw in clause["keywords"])
        if not found:
            missing.append(clause["name"])
            
    return missing
