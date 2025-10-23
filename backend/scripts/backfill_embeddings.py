#!/usr/bin/env python3
"""
Embedding Backfill Script

Generates embeddings for existing recipes that don't have embeddings yet.
Run this script once after deploying the new embedding system.

Usage:
    python backfill_embeddings.py [--dry-run]

Options:
    --dry-run    Preview what would be done without actually saving to S3
"""

import sys
import os
import json
import boto3
import argparse

# Add parent directory to path to import modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from embeddings import EmbeddingStore
from embedding_generator import EmbeddingGenerator


def backfill_existing_recipes(dry_run: bool = False) -> None:
    """
    Generate embeddings for existing recipes that don't have them.

    Args:
        dry_run: If True, preview changes without saving to S3
    """
    # Get bucket name from environment
    bucket_name = os.getenv('S3_BUCKET')
    if not bucket_name:
        print("Error: S3_BUCKET environment variable not set")
        sys.exit(1)

    print(f"Using bucket: {bucket_name}")
    print(f"Mode: {'DRY RUN (no changes will be saved)' if dry_run else 'LIVE (will save to S3)'}")
    print()

    # Create S3 client
    s3_client = boto3.client('s3')

    # Load existing recipes
    print("Loading existing recipes...")
    try:
        response = s3_client.get_object(Bucket=bucket_name, Key='jsondata/combined_data.json')
        recipes = json.loads(response['Body'].read())
        print(f"Found {len(recipes)} recipes")
    except Exception as e:
        print(f"Error loading recipes: {e}")
        sys.exit(1)

    # Load existing embeddings
    print("Loading existing embeddings...")
    try:
        embedding_store = EmbeddingStore(bucket_name)
        existing_embeddings, _ = embedding_store.load_embeddings()
        print(f"Found {len(existing_embeddings)} existing embeddings")
    except Exception as e:
        print(f"Error loading embeddings: {e}")
        sys.exit(1)

    # Identify recipes needing embeddings
    recipes_without_embeddings = {
        key: recipe
        for key, recipe in recipes.items()
        if key not in existing_embeddings
    }
    print(f"Found {len(recipes_without_embeddings)} recipes without embeddings")
    print()

    if not recipes_without_embeddings:
        print("All recipes already have embeddings. Nothing to do!")
        return

    if dry_run:
        print("DRY RUN - Would process the following recipes:")
        for i, (key, recipe) in enumerate(list(recipes_without_embeddings.items())[:10]):
            title = recipe.get('Title', 'Unknown')
            print(f"  {i+1}. Recipe {key}: {title}")
        if len(recipes_without_embeddings) > 10:
            print(f"  ... and {len(recipes_without_embeddings) - 10} more")
        print()
        print("Run without --dry-run to actually generate and save embeddings.")
        return

    # Generate embeddings
    print("Generating embeddings...")
    print("This may take a while depending on the number of recipes...")
    print()

    try:
        embedding_generator = EmbeddingGenerator()
        new_embeddings = {}
        errors = []

        for i, (key, recipe) in enumerate(recipes_without_embeddings.items(), 1):
            title = recipe.get('Title', 'Unknown')

            try:
                embedding = embedding_generator.generate_recipe_embedding(recipe)
                new_embeddings[key] = embedding

                # Print progress every 10 recipes
                if i % 10 == 0:
                    print(f"Progress: {i}/{len(recipes_without_embeddings)} recipes processed")

            except Exception as e:
                error_msg = f"Recipe {key} ({title}): {str(e)}"
                errors.append(error_msg)
                print(f"Error: {error_msg}")

        print()
        print(f"Successfully generated {len(new_embeddings)} embeddings")

        if errors:
            print(f"Failed to generate {len(errors)} embeddings:")
            for error in errors[:10]:
                print(f"  - {error}")
            if len(errors) > 10:
                print(f"  ... and {len(errors) - 10} more errors")
            print()

    except Exception as e:
        print(f"Error generating embeddings: {e}")
        sys.exit(1)

    # Save embeddings
    if new_embeddings:
        print("Saving embeddings to S3...")
        try:
            success = embedding_store.add_embeddings(new_embeddings)

            if success:
                print("✓ Successfully saved embeddings to S3")
            else:
                print("✗ Failed to save embeddings (max retries exceeded)")
                print("This can happen due to concurrent modifications.")
                print("Try running the script again.")
                sys.exit(1)

        except Exception as e:
            print(f"Error saving embeddings: {e}")
            sys.exit(1)

    # Print summary
    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total recipes:              {len(recipes)}")
    print(f"Recipes with embeddings:    {len(existing_embeddings) + len(new_embeddings)}")
    print(f"Coverage:                   {((len(existing_embeddings) + len(new_embeddings)) / len(recipes) * 100):.1f}%")
    print(f"New embeddings added:       {len(new_embeddings)}")
    print(f"Failed:                     {len(errors)}")
    print("=" * 60)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Generate embeddings for existing recipes without embeddings'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview what would be done without actually saving to S3'
    )

    args = parser.parse_args()

    try:
        backfill_existing_recipes(dry_run=args.dry_run)
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        sys.exit(1)


if __name__ == '__main__':
    main()
