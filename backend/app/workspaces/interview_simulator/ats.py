import re
from typing import Dict, Any

FILLER_HEDGE_WORDS = [
    "maybe", "probably", "i think", "sort of", "kind of", "perhaps",
    "i guess", "basically", "actually", "honestly", "um", "uh", "like"
]

ATS_REQUIRED_SECTIONS = [
    {"name": "Contact Information", "keywords": ["email", "phone", "linkedin", "github"]},
    {"name": "Work Experience", "keywords": ["experience", "employment", "work history", "professional experience"]},
    {"name": "Education", "keywords": ["education", "university", "bachelor", "master", "phd", "degree", "b.s.", "m.s."]},
    {"name": "Technical Skills", "keywords": ["skills", "technologies", "languages", "frameworks", "tools", "competencies"]},
    {"name": "Projects / Publications", "keywords": ["projects", "publications", "open source", "key achievements"]}
]

def check_ats_structure(full_text: str) -> Dict[str, Any]:
    """
    Performs ATS format compliance audit checking for required sections,
    measurable impact numbers, and clean formatting.
    """
    text_lower = full_text.lower()
    checklist = []
    found_sections = 0
    
    for sec in ATS_REQUIRED_SECTIONS:
        present = any(kw in text_lower for kw in sec["keywords"])
        if present:
            found_sections += 1
        checklist.append({
            "section": sec["name"],
            "present": present
        })
        
    metric_matches = re.findall(r"\b(\d+[\%kmb\+]?|\$\d+)\b", full_text)
    has_metrics = len(metric_matches) >= 3
    
    base_score = int((found_sections / len(ATS_REQUIRED_SECTIONS)) * 80)
    if has_metrics:
        base_score += 20
        
    return {
        "score": min(100, base_score),
        "sections": checklist,
        "metrics_found": len(metric_matches),
        "recommendation": "Well-formatted for ATS filters." if base_score >= 80 else "Add more quantifiable metrics (%) and ensure all standard headings are explicit."
    }

def classify_seniority_tier(full_text: str) -> str:
    """
    Classifies resume seniority based on title keywords and career duration.
    """
    text_lower = full_text.lower()
    if any(k in text_lower for k in ["principal", "staff engineer", "director", "vp", "chief", "head of"]):
        return "Executive / Principal"
    if any(k in text_lower for k in ["lead", "senior", "sr.", "architect", "5+ years", "6+ years", "7+ years", "8+ years"]):
        return "Senior"
    if any(k in text_lower for k in ["mid-level", "software engineer ii", "3+ years", "4+ years"]):
        return "Mid-Level"
    return "Associate / Junior"

def calculate_confidence_ratio(candidate_response: str) -> float:
    """
    Measures verbal hedging and filler density in candidate response.
    Returns 0.0 (high hedging) to 1.0 (assertive and direct).
    """
    text_lower = candidate_response.lower()
    words = re.findall(r"\b\w+\b", text_lower)
    if not words:
        return 1.0
        
    hedge_count = sum(1 for phrase in FILLER_HEDGE_WORDS if phrase in text_lower)
    hedge_density = hedge_count / max(1, len(words) / 10)
    
    confidence = max(0.2, 1.0 - (hedge_density * 0.4))
    return round(confidence, 2)
