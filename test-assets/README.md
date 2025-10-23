# Test Assets for Upload Testing

This directory contains test files for manual QA testing of the multi-file upload feature.

## Required Test Files

### Recipe Images (5 files)
Create or download 5 JPG/PNG images containing recipes. These should be:

1. **test-recipe-1.jpg** - A simple recipe with clear text (e.g., chocolate chip cookies)
2. **test-recipe-2.jpg** - A recipe with ingredients list and directions
3. **test-recipe-3.png** - A handwritten recipe (to test OCR on handwriting)
4. **test-recipe-4.jpg** - A recipe card or printed recipe
5. **test-recipe-5.jpg** - A mobile phone photo of a recipe

### Recipe PDFs (2 files)
Create or download PDF files containing recipes:

1. **test-cookbook-3recipes.pdf** - A PDF containing exactly 3 recipes (for testing multi-recipe extraction)
2. **test-single-recipe.pdf** - A single-page PDF with one recipe

### Duplicate Test File (1 file)
1. **duplicate-recipe.jpg** - A copy of test-recipe-1.jpg with a different filename (for testing duplicate detection)

## How to Obtain Test Files

### Option 1: Create Your Own
- Take photos of recipes from cookbooks (respecting copyright for personal testing only)
- Screenshot recipes from your personal collection
- Create simple recipes in a text editor and save as image/PDF

### Option 2: Use Sample Recipes
- Search for "public domain recipes" online
- Use recipes from government sources (USDA, etc.)
- Generate simple test recipes with clear formatting

### Option 3: Generate Synthetic Test Data
- Use a word processor to create recipe documents
- Export as PDF or save as image
- Ensure clear text for OCR testing

## File Size Recommendations

- **Images**: 100KB - 5MB (test various sizes)
- **PDFs**: Keep under 20MB for initial testing
- **Large file test**: Create one ~15MB file to test size limits

## Important Notes

- **Do not commit actual recipe files** to the repository (add to .gitignore)
- Test files should contain actual recipe content for accurate OCR testing
- Use a variety of fonts, layouts, and image qualities
- Keep copies of working test files for regression testing

## Testing Checklist

Before manual testing, verify you have:
- [ ] 5 diverse recipe images
- [ ] 2 PDF files (one multi-recipe, one single)
- [ ] 1 duplicate file for duplicate detection testing
- [ ] All files are readable and contain recipe content
- [ ] File sizes vary to test different scenarios
