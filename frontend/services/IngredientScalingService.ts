import { Recipe, RecipeIngredients } from '@/types';

interface ParsedAmount {
  value: number;
  maxValue?: number; // For ranges like "1-2 cups"
  unit: string;
  restOfText: string;
}

export class IngredientScalingService {
  private static readonly COMMON_FRACTIONS: Record<string, string> = {
    '0.13': '1/8',
    '0.25': '1/4',
    '0.33': '1/3',
    '0.5': '1/2',
    '0.67': '2/3',
    '0.75': '3/4',
  };

  // Standard baking fractions (for cups, tbsp, tsp)
  private static readonly STANDARD_FRACTIONS = [
    1/8, 1/4, 1/3, 1/2, 2/3, 3/4, 1,
  ];

  private static readonly NON_SCALABLE_PHRASES = [
    'to taste',
    'as needed',
    'for garnish',
    'optional',
    'garnish',
  ];

  /**
   * Parse an ingredient amount string into numeric value and unit.
   * Returns null if no amount can be parsed (e.g., "to taste").
   */
  static parseIngredientAmount(text: string): ParsedAmount | null {
    const trimmed = text.trim();
    const trimmedLower = trimmed.toLowerCase();

    // Check for non-scalable phrases (case-insensitive)
    for (const phrase of this.NON_SCALABLE_PHRASES) {
      if (trimmedLower.includes(phrase)) {
        return null;
      }
    }

    // Try to match mixed number (e.g., "1 1/2 cups")
    // Match on original to preserve case
    const mixedMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)\s*(.*)/);
    if (mixedMatch) {
      const whole = parseInt(mixedMatch[1]);
      const numerator = parseInt(mixedMatch[2]);
      const denominator = parseInt(mixedMatch[3]);
      const rest = mixedMatch[4];
      const value = whole + numerator / denominator;

      const unitMatch = rest.match(/^(\w+\.?)/);
      const unit = unitMatch ? unitMatch[1] : '';

      return { value, unit, restOfText: rest.replace(unit, '').trim() };
    }

    // Try to match fraction (e.g., "1/2 cup")
    const fractionMatch = trimmed.match(/^(\d+)\/(\d+)\s*(.*)/);
    if (fractionMatch) {
      const numerator = parseInt(fractionMatch[1]);
      const denominator = parseInt(fractionMatch[2]);
      const rest = fractionMatch[3];
      const value = numerator / denominator;

      const unitMatch = rest.match(/^(\w+\.?)/);
      const unit = unitMatch ? unitMatch[1] : '';

      return { value, unit, restOfText: rest.replace(unit, '').trim() };
    }

    // Try to match range (e.g., "1-2 cups")
    const rangeMatch = trimmed.match(/^(\d+\.?\d*)\s*-\s*(\d+\.?\d*)\s*(.*)/);
    if (rangeMatch) {
      const value = parseFloat(rangeMatch[1]);
      const maxValue = parseFloat(rangeMatch[2]);
      const rest = rangeMatch[3];

      const unitMatch = rest.match(/^(\w+\.?)/);
      const unit = unitMatch ? unitMatch[1] : '';

      return { value, maxValue, unit, restOfText: rest.replace(unit, '').trim() };
    }

    // Try to match decimal or whole number (e.g., "2.5 grams" or "3 eggs")
    const simpleMatch = trimmed.match(/^(\d+\.?\d*)\s*(.*)/);
    if (simpleMatch) {
      const value = parseFloat(simpleMatch[1]);
      const rest = simpleMatch[2];

      const unitMatch = rest.match(/^(\w+\.?)/);
      const unit = unitMatch ? unitMatch[1] : '';

      return { value, unit, restOfText: rest.replace(unit, '').trim() };
    }

    return null;
  }

  /**
   * Round a value to the nearest standard baking fraction.
   * Applies to all measurements to ensure clean fractions.
   */
  private static normalizeToStandardFraction(value: number): number {
    // For values less than 1/8, keep as-is (very small amounts)
    if (value < 0.125) {
      return value;
    }

    const whole = Math.floor(value);
    const fractional = value - whole;

    // If already a whole number, no normalization needed
    if (fractional === 0) {
      return value;
    }

    // Find nearest standard fraction
    let nearest = this.STANDARD_FRACTIONS[0];
    let minDiff = Math.abs(fractional - nearest);

    for (const frac of this.STANDARD_FRACTIONS) {
      const diff = Math.abs(fractional - frac);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = frac;
      }
    }

    return whole + nearest;
  }

  /**
   * Convert a decimal to a fraction string.
   * Uses common fractions lookup and GCD-based algorithm for simple fractions.
   */
  static decimalToFraction(decimal: number): string {
    // Handle whole numbers
    if (decimal % 1 === 0) {
      return decimal.toString();
    }

    // Handle mixed numbers
    const whole = Math.floor(decimal);
    const fractional = decimal - whole;

    // Try common fractions lookup first (fast path)
    const roundedFractional = Math.round(fractional * 1000) / 1000;
    const key = roundedFractional.toFixed(2);

    if (this.COMMON_FRACTIONS[key]) {
      return whole > 0
        ? `${whole} ${this.COMMON_FRACTIONS[key]}`
        : this.COMMON_FRACTIONS[key];
    }

    // Try to find a simple fraction (denominators up to 16 for baking)
    const tolerance = 0.005; // Tighter tolerance to avoid false matches
    for (let denominator = 2; denominator <= 16; denominator++) {
      for (let numerator = 1; numerator < denominator; numerator++) {
        const fractionValue = numerator / denominator;
        if (Math.abs(fractional - fractionValue) < tolerance) {
          const frac = `${numerator}/${denominator}`;
          return whole > 0 ? `${whole} ${frac}` : frac;
        }
      }
    }

    // No simple fraction found, return decimal
    return decimal.toFixed(2).replace(/\.?0+$/, '');
  }

  /**
   * Adjust unit for singular/plural based on amount.
   */
  private static pluralizeUnit(unit: string, amount: number): string {
    if (!unit) return unit;

    // Don't pluralize abbreviations (c., T., tsp., oz., lb., etc.)
    if (unit.includes('.')) {
      return unit;
    }

    // Don't pluralize single-letter units
    if (unit.length === 1) {
      return unit;
    }

    // If amount is 1 or less, make singular; otherwise make plural
    const needsSingular = amount <= 1;
    const isPlural = unit.endsWith('s');

    if (needsSingular && isPlural) {
      // Remove 's' for singular (cups → cup)
      return unit.slice(0, -1);
    } else if (!needsSingular && !isPlural) {
      // Add 's' for plural (cup → cups)
      return unit + 's';
    }

    return unit;
  }

  /**
   * Scale a single ingredient amount string.
   */
  static scaleAmount(amountText: string, scaleFactor: number): string {
    const parsed = this.parseIngredientAmount(amountText);

    // If can't parse or is non-scalable, return as-is
    if (!parsed) {
      return amountText;
    }

    let scaledValue = parsed.value * scaleFactor;
    let scaledMax = parsed.maxValue ? parsed.maxValue * scaleFactor : undefined;

    // Normalize to standard baking fractions for common units
    scaledValue = this.normalizeToStandardFraction(scaledValue);
    if (scaledMax) {
      scaledMax = this.normalizeToStandardFraction(scaledMax);
    }

    // Format the scaled value
    let scaledAmount: string;
    let finalUnit = parsed.unit;

    if (scaledMax) {
      // Range - use the max value for pluralization
      const minStr = this.decimalToFraction(scaledValue);
      const maxStr = this.decimalToFraction(scaledMax);
      scaledAmount = `${minStr}-${maxStr}`;
      finalUnit = this.pluralizeUnit(parsed.unit, scaledMax);
    } else {
      scaledAmount = this.decimalToFraction(scaledValue);
      finalUnit = this.pluralizeUnit(parsed.unit, scaledValue);
    }

    // Reconstruct the string
    const parts = [scaledAmount, finalUnit, parsed.restOfText]
      .filter(Boolean)
      .join(' ');

    return parts;
  }

  /**
   * Scale all ingredients in a recipe.
   * Returns a new Recipe object with scaled ingredients.
   */
  static scaleRecipeIngredients(recipe: Recipe, targetServings: number): Recipe {
    const originalServings = recipe.Servings || 4;

    // If servings match, no scaling needed
    if (targetServings === originalServings) {
      return recipe;
    }

    const scaleFactor = targetServings / originalServings;

    // Handle different ingredient formats
    const scaledIngredients = this.scaleIngredients(
      recipe.Ingredients,
      scaleFactor
    );

    return {
      ...recipe,
      Ingredients: scaledIngredients,
    };
  }

  /**
   * Recursively scale ingredients regardless of format.
   */
  private static scaleIngredients(
    ingredients: RecipeIngredients | undefined,
    scaleFactor: number
  ): RecipeIngredients | undefined {
    if (!ingredients) {
      return ingredients;
    }

    // String format - try to scale inline
    if (typeof ingredients === 'string') {
      return this.scaleAmount(ingredients, scaleFactor);
    }

    // Array format
    if (Array.isArray(ingredients)) {
      return ingredients.map((item) => this.scaleAmount(item, scaleFactor));
    }

    // Object format
    if (typeof ingredients === 'object') {
      const scaled: Record<string, any> = {};

      for (const [key, value] of Object.entries(ingredients)) {
        // Check if value is a nested object (sectioned ingredients)
        if (typeof value === 'object' && !Array.isArray(value)) {
          // Recursively scale nested section
          scaled[key] = this.scaleIngredients(value as RecipeIngredients, scaleFactor);
        } else if (typeof value === 'string') {
          // Scale the amount string
          scaled[key] = this.scaleAmount(value, scaleFactor);
        } else {
          // Shouldn't happen, but preserve as-is
          scaled[key] = value;
        }
      }

      return scaled;
    }

    return ingredients;
  }
}
