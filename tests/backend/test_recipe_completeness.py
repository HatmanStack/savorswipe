"""Tests for backend.services.recipe_completeness."""

import copy

from services.recipe_completeness import (
    is_recipe_incomplete,
    merge_incomplete_recipes,
    merge_recipes,
)
from services.title_similarity import title_similarity


def test_title_similarity_identical():
    assert title_similarity("Chocolate Chip Cookies", "Chocolate Chip Cookies") == 1.0


def test_title_similarity_disjoint():
    assert title_similarity("Apple Pie", "Beef Stew") == 0.0


def test_title_similarity_partial_overlap_above_threshold():
    score = title_similarity("Chocolate Chip Cookies", "Chocolate Cookies")
    assert score >= 0.3


def test_title_similarity_empty_inputs():
    assert title_similarity("", "anything") == 0.0
    assert title_similarity("the and of", "the and of") == 0.0  # all stopwords


def test_is_recipe_incomplete_missing_ingredients():
    assert is_recipe_incomplete({"Title": "X", "Directions": ["step"]}) is True


def test_is_recipe_incomplete_missing_directions():
    assert is_recipe_incomplete({"Title": "X", "Ingredients": {"a": "b"}}) is True


def test_is_recipe_incomplete_complete_recipe():
    assert (
        is_recipe_incomplete(
            {"Title": "X", "Ingredients": {"a": "b"}, "Directions": ["step"]}
        )
        is False
    )


def test_merge_recipes_does_not_mutate_inputs():
    incomplete = {"Title": "Pie", "Description": "tasty"}
    complete = {
        "Title": "Apple Pie Recipe",
        "Description": "from grandma",
        "Ingredients": {"apples": "3"},
        "Directions": ["bake"],
    }
    incomplete_snapshot = copy.deepcopy(incomplete)
    complete_snapshot = copy.deepcopy(complete)

    merged = merge_recipes(incomplete, complete)

    assert incomplete == incomplete_snapshot
    assert complete == complete_snapshot
    assert merged["Title"] == "Pie"  # shorter
    assert "tasty" in merged["Description"]
    assert "from grandma" in merged["Description"]
    assert merged["Ingredients"] == {"apples": "3"}


def test_merge_incomplete_recipes_returns_new_list_and_no_mutation():
    incomplete = {"Title": "Apple Pie", "Description": "yum"}
    complete = {
        "Title": "Apple Pie Deluxe",
        "Description": "details",
        "Ingredients": {"apples": "3"},
        "Directions": ["bake"],
    }
    recipes = [incomplete, complete]
    snapshot = copy.deepcopy(recipes)

    result = merge_incomplete_recipes(recipes)

    # Inputs untouched
    assert recipes == snapshot
    # New list returned
    assert result is not recipes
    assert len(result) == 1
    assert "yum" in result[0]["Description"]
    assert result[0]["Ingredients"] == {"apples": "3"}


def test_merge_incomplete_recipes_no_match_appends():
    incomplete = {"Title": "Random Soup"}
    complete = {
        "Title": "Apple Pie",
        "Ingredients": {"a": "b"},
        "Directions": ["bake"],
    }
    result = merge_incomplete_recipes([incomplete, complete])
    assert len(result) == 2


def test_merge_incomplete_recipes_short_circuit():
    assert merge_incomplete_recipes([]) == []
    single = [{"Title": "Pie"}]
    out = merge_incomplete_recipes(single)
    assert out == single
    assert out is not single  # still a fresh list
