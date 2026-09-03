import math
import logging
from datetime import datetime
from typing import List, Tuple

logger = logging.getLogger(__name__)

def refresh_retrievability_scores(
    flashcards: List[dict],
    exam_date_str: str = None
) -> Tuple[List[dict], int]:
    """
    Recalculates retrievability score and forgotten risk for all cards.
    Returns the updated card list and the overall mastery percentage.
    """
    days_until_exam = None
    if exam_date_str:
        try:
            if "T" in exam_date_str:
                exam_dt = datetime.strptime(exam_date_str.split("T")[0], "%Y-%m-%d")
            else:
                exam_dt = datetime.strptime(exam_date_str, "%Y-%m-%d")
            days_until_exam = (exam_dt - datetime.now()).days
            days_until_exam = max(1, days_until_exam)
        except Exception as err:
            logger.error(f"Error parsing exam date for projection: {err}")
            
    for card in flashcards:
        grade = card.get("grade", "New")
        last_rev_str = card.get("last_reviewed")
        
        if grade == "New" or not last_rev_str:
            card["retrievability"] = 1.0
            card["forgotten_risk"] = False
        else:
            try:
                if "T" in last_rev_str:
                    last_rev_dt = datetime.strptime(last_rev_str.split("T")[0], "%Y-%m-%d")
                else:
                    last_rev_dt = datetime.strptime(last_rev_str, "%Y-%m-%d")
                elapsed_days = (datetime.now() - last_rev_dt).days
                elapsed_days = max(0, elapsed_days)
            except Exception:
                elapsed_days = 0
                
            h_life = card.get("half_life", 1)
            r = math.exp(-elapsed_days / h_life)
            card["retrievability"] = round(r, 2)
            card["forgotten_risk"] = (grade == "Again") or (r < 0.70)
            
        # Add predicted retrievability at exam time
        if days_until_exam is not None:
            h_life = card.get("half_life", 1)
            r_exam = math.exp(-days_until_exam / h_life)
            card["exam_retrievability"] = round(r_exam, 2)
        else:
            card["exam_retrievability"] = None
        
    # Calculate mastery percentage
    mastered_count = len([c for c in flashcards if c.get("grade") in ["Good", "Easy"]])
    mastery_percent = round((mastered_count / len(flashcards)) * 100) if flashcards else 0
    
    return flashcards, mastery_percent

def compute_review_progression(
    flashcards: List[dict],
    heatmap: List[dict],
    card_id: int,
    grade: str,
    exam_date_str: str = None
) -> Tuple[List[dict], List[dict], int]:
    """
    Applies SuperMemo SM-2 / Leitner active recall half-life progression,
    re-evaluates forgetting risk against the exam date, and aligns concept colors.
    Returns (flashcards, heatmap, mastery_percentage).
    """
    card_topic = None
    for card in flashcards:
        if card.get("id") == card_id:
            card["grade"] = grade
            card["last_reviewed"] = datetime.now().strftime("%Y-%m-%d")
            half_life = card.get("half_life", 1)
            
            if grade == "Again":
                half_life = 1
                card["interval"] = "Due in 1 day"
            elif grade == "Good":
                half_life = half_life * 2
                card["interval"] = f"Due in {half_life} days"
            elif grade == "Easy":
                half_life = half_life * 3
                card["interval"] = f"Due in {half_life} days"
                
            card["half_life"] = half_life
            card_topic = card.get("topic")
            break
            
    # Refresh all cards' retrievability and calculate mastery percentage
    flashcards, mastery_percent = refresh_retrievability_scores(flashcards, exam_date_str)
    
    # Heatmap color alignment
    if card_topic:
        grade_map = {
            "Again": ("LOW", "#FF4C4C", 0.35),
            "Good": ("MEDIUM", "#FFC107", 0.70),
            "Easy": ("HIGH", "#3ECF8E", 0.85)
        }
        if grade in grade_map:
            lvl, col, perf = grade_map[grade]
            updated = False
            for h in heatmap:
                if h.get("name", "").lower() == card_topic.lower():
                    h["level"] = lvl
                    h["color"] = col
                    h["measured_performance"] = perf
                    updated = True
                    break
            if not updated:
                heatmap.append({
                    "name": card_topic,
                    "level": lvl,
                    "color": col,
                    "measured_performance": perf
                })
                
    return flashcards, heatmap, mastery_percent

def merge_flashcard_decks(
    existing_cards: List[dict],
    new_cards: List[dict]
) -> List[dict]:
    """
    Merges newly generated flashcards with existing decks, preserving progression statistics
    (half-life, interval, grade, forgotten risk) for duplicate topics.
    """
    card_map = {c["topic"].lower(): c for c in existing_cards}
    merged = list(existing_cards)
    
    existing_ids = {c["id"] for c in existing_cards}
    next_id = max(existing_ids) + 1 if existing_ids else 100
    
    for card in new_cards:
        topic_lower = card["topic"].lower()
        if topic_lower in card_map:
            existing_card = card_map[topic_lower]
            existing_card["question"] = card.get("question", existing_card["question"])
            existing_card["summary"] = card.get("summary", existing_card.get("summary", ""))
            existing_card["answer_hint"] = card.get("answer_hint", existing_card.get("answer_hint", ""))
            existing_card["citation"] = card.get("citation", existing_card.get("citation", ""))
        else:
            card["half_life"] = 1
            card["forgotten_risk"] = False
            if card.get("id") in existing_ids or not card.get("id"):
                card["id"] = next_id
                next_id += 1
            merged.append(card)
            
    return merged
