"""
Recipe completeness and multi-page merge helpers.

Pure functions extracted from lambda_function.py to remove the
in-place mutation hazard from merge_incomplete_recipes.
"""

from __future__ import annotations

from typing import Dict, List

from logger import get_logger
from services.title_similarity import title_similarity

log = get_logger("services.recipe_completeness")


def is_recipe_incomplete(recipe: Dict) -> bool:
    """Check whether a recipe is missing ingredients or directions."""
    ingredients = recipe.get("Ingredients", {})
    directions = recipe.get("Directions", [])

    has_ingredients = bool(ingredients) and (
        isinstance(ingredients, dict) and len(ingredients) > 0
    )
    has_directions = bool(directions) and (
        (isinstance(directions, list) and len(directions) > 0)
        or (isinstance(directions, dict) and len(directions) > 0)
    )

    return not has_ingredients or not has_directions


def merge_recipes(incomplete: Dict, complete: Dict) -> Dict:
    """
    Merge an incomplete recipe into a complete one.
    Takes description from incomplete, ingredients/directions from complete.
    Returns a new dict; inputs are not mutated.
    """
    merged = dict(complete)

    if len(incomplete.get("Title", "")) < len(complete.get("Title", "")):
        merged["Title"] = incomplete.get("Title", complete.get("Title"))

    incomplete_desc = incomplete.get("Description", "")
    complete_desc = complete.get("Description", "")
    if incomplete_desc and complete_desc:
        if incomplete_desc not in complete_desc:
            merged["Description"] = f"{incomplete_desc}\n\n{complete_desc}"
    elif incomplete_desc:
        merged["Description"] = incomplete_desc

    return merged


def merge_incomplete_recipes(recipes: List[Dict]) -> List[Dict]:
    """
    Pure version of multi-page recipe merging.

    Returns a NEW list. The input list and its dict elements are not
    mutated. Incomplete recipes that match a complete one (>=30% Jaccard
    title overlap) are merged into a fresh dict; unmatched incomplete
    recipes are appended as-is.
    """
    if len(recipes) <= 1:
        return list(recipes)

    complete: List[Dict] = []
    incomplete: List[Dict] = []

    for recipe in recipes:
        if is_recipe_incomplete(recipe):
            incomplete.append(recipe)
        else:
            complete.append(recipe)

    if not incomplete or not complete:
        return list(recipes)

    log.info(
        "Found incomplete and complete recipes",
        incomplete=len(incomplete),
        complete=len(complete),
    )

    # Build a fresh result list rather than mutating `complete`.
    result: List[Dict] = list(complete)
    merged_indices: set[int] = set()

    for inc_recipe in incomplete:
        inc_title = inc_recipe.get("Title", "")
        best_match: int | None = None
        best_score = 0.0

        for idx, comp_recipe in enumerate(result):
            if idx in merged_indices:
                continue

            comp_title = comp_recipe.get("Title", "")
            score = title_similarity(inc_title, comp_title)

            if score > best_score and score >= 0.3:
                best_score = score
                best_match = idx

        if best_match is not None:
            log.info(
                "Merging recipes",
                incomplete_title=inc_title,
                complete_title=result[best_match].get("Title"),
                similarity=round(best_score, 2),
            )
            result[best_match] = merge_recipes(inc_recipe, result[best_match])
            merged_indices.add(best_match)
        else:
            log.info("No match found for incomplete recipe, keeping as-is", title=inc_title)
            result.append(inc_recipe)

    return result
