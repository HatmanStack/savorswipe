import { IngredientScalingService } from '../IngredientScalingService';
import { Recipe } from '@/types';

describe('IngredientScalingService', () => {
  describe('parseIngredientAmount', () => {
    it('should parse simple amounts with units', () => {
      expect(IngredientScalingService.parseIngredientAmount('2 cups'))
        .toEqual({ value: 2, unit: 'cups', restOfText: '' });

      expect(IngredientScalingService.parseIngredientAmount('1 tbsp'))
        .toEqual({ value: 1, unit: 'tbsp', restOfText: '' });
    });

    it('should parse fractions', () => {
      expect(IngredientScalingService.parseIngredientAmount('1/2 cup'))
        .toEqual({ value: 0.5, unit: 'cup', restOfText: '' });

      expect(IngredientScalingService.parseIngredientAmount('3/4 tsp'))
        .toEqual({ value: 0.75, unit: 'tsp', restOfText: '' });
    });

    it('should parse mixed numbers', () => {
      expect(IngredientScalingService.parseIngredientAmount('1 1/2 cups'))
        .toEqual({ value: 1.5, unit: 'cups', restOfText: '' });

      expect(IngredientScalingService.parseIngredientAmount('2 1/4 oz'))
        .toEqual({ value: 2.25, unit: 'oz', restOfText: '' });
    });

    it('should parse decimal amounts', () => {
      expect(IngredientScalingService.parseIngredientAmount('0.5 kg'))
        .toEqual({ value: 0.5, unit: 'kg', restOfText: '' });

      expect(IngredientScalingService.parseIngredientAmount('2.5 grams'))
        .toEqual({ value: 2.5, unit: 'grams', restOfText: '' });
    });

    it('should parse ranges', () => {
      const result = IngredientScalingService.parseIngredientAmount('1-2 cups');
      expect(result).toEqual({
        value: 1,
        maxValue: 2,
        unit: 'cups',
        restOfText: ''
      });
    });

    it('should return null for non-measurable amounts', () => {
      expect(IngredientScalingService.parseIngredientAmount('to taste')).toBeNull();
      expect(IngredientScalingService.parseIngredientAmount('as needed')).toBeNull();
      expect(IngredientScalingService.parseIngredientAmount('for garnish')).toBeNull();
    });

    it('should handle amounts without units', () => {
      expect(IngredientScalingService.parseIngredientAmount('3'))
        .toEqual({ value: 3, unit: '', restOfText: '' });

      expect(IngredientScalingService.parseIngredientAmount('2 eggs'))
        .toEqual({ value: 2, unit: 'eggs', restOfText: '' });
    });
  });

  describe('decimalToFraction', () => {
    it('should convert common decimals to fractions', () => {
      expect(IngredientScalingService.decimalToFraction(0.5)).toBe('1/2');
      expect(IngredientScalingService.decimalToFraction(0.25)).toBe('1/4');
      expect(IngredientScalingService.decimalToFraction(0.75)).toBe('3/4');
      expect(IngredientScalingService.decimalToFraction(0.33)).toBe('1/3');
      expect(IngredientScalingService.decimalToFraction(0.67)).toBe('2/3');
    });

    it('should convert baking fractions (eighths)', () => {
      expect(IngredientScalingService.decimalToFraction(0.125)).toBe('1/8');
      expect(IngredientScalingService.decimalToFraction(0.375)).toBe('3/8');
      expect(IngredientScalingService.decimalToFraction(0.625)).toBe('5/8');
      expect(IngredientScalingService.decimalToFraction(0.875)).toBe('7/8');
    });

    it('should return decimal for very uncommon fractions', () => {
      expect(IngredientScalingService.decimalToFraction(0.37)).toBe('0.37');
      expect(IngredientScalingService.decimalToFraction(0.88)).toBe('0.88');
    });

    it('should handle whole numbers', () => {
      expect(IngredientScalingService.decimalToFraction(1.0)).toBe('1');
      expect(IngredientScalingService.decimalToFraction(2.0)).toBe('2');
    });

    it('should handle mixed numbers', () => {
      expect(IngredientScalingService.decimalToFraction(1.5)).toBe('1 1/2');
      expect(IngredientScalingService.decimalToFraction(2.25)).toBe('2 1/4');
    });
  });

  describe('scaleAmount', () => {
    it('should scale simple amounts', () => {
      const result = IngredientScalingService.scaleAmount('2 cups', 2);
      expect(result).toBe('4 cups');
    });

    it('should scale fractions', () => {
      const result = IngredientScalingService.scaleAmount('1/2 cup', 2);
      expect(result).toBe('1 cup');

      const result2 = IngredientScalingService.scaleAmount('1/4 tsp', 3);
      expect(result2).toBe('3/4 tsp');
    });

    it('should scale ranges', () => {
      const result = IngredientScalingService.scaleAmount('1-2 cups', 2);
      expect(result).toBe('2-4 cups');
    });

    it('should preserve "to taste" and similar phrases', () => {
      expect(IngredientScalingService.scaleAmount('to taste', 2)).toBe('to taste');
      expect(IngredientScalingService.scaleAmount('as needed', 3)).toBe('as needed');
    });

    it('should handle scaling down', () => {
      const result = IngredientScalingService.scaleAmount('2 cups', 0.5);
      expect(result).toBe('1 cup');
    });
  });

  describe('scaleRecipeIngredients', () => {
    it('should scale object format ingredients', () => {
      const recipe: Recipe = {
        key: 'test',
        Title: 'Test Recipe',
        Servings: 4,
        Ingredients: {
          'flour': '2 cups',
          'sugar': '1/2 cup',
          'salt': 'to taste'
        }
      };

      const scaled = IngredientScalingService.scaleRecipeIngredients(recipe, 8);

      expect(scaled.Ingredients).toEqual({
        'flour': '4 cups',
        'sugar': '1 cup',
        'salt': 'to taste'
      });
    });

    it('should scale nested object ingredients', () => {
      const recipe: Recipe = {
        key: 'test',
        Title: 'Test Recipe',
        Servings: 4,
        Ingredients: {
          'For the Crust': {
            'flour': '1 cup',
            'butter': '1/2 cup'
          },
          'For the Filling': {
            'sugar': '1/4 cup'
          }
        }
      };

      const scaled = IngredientScalingService.scaleRecipeIngredients(recipe, 8);

      expect(scaled.Ingredients).toEqual({
        'For the Crust': {
          'flour': '2 cups',
          'butter': '1 cup'
        },
        'For the Filling': {
          'sugar': '1/2 cup'
        }
      });
    });

    it('should scale array format ingredients', () => {
      const recipe: Recipe = {
        key: 'test',
        Title: 'Test Recipe',
        Servings: 4,
        Ingredients: [
          '2 cups flour',
          '1/2 cup sugar',
          'salt to taste'
        ]
      };

      const scaled = IngredientScalingService.scaleRecipeIngredients(recipe, 8);

      expect(scaled.Ingredients).toEqual([
        '4 cups flour',
        '1 cup sugar',
        'salt to taste'
      ]);
    });

    it('should handle recipes without Servings field (default to 4)', () => {
      const recipe: Recipe = {
        key: 'test',
        Title: 'Test Recipe',
        Ingredients: { 'flour': '2 cups' }
      };

      const scaled = IngredientScalingService.scaleRecipeIngredients(recipe, 8);

      expect(scaled.Ingredients).toEqual({ 'flour': '4 cups' });
    });

    it('should return recipe unchanged when target equals original servings', () => {
      const recipe: Recipe = {
        key: 'test',
        Title: 'Test Recipe',
        Servings: 4,
        Ingredients: { 'flour': '2 cups' }
      };

      const scaled = IngredientScalingService.scaleRecipeIngredients(recipe, 4);

      expect(scaled).toEqual(recipe);
    });
  });

  describe('Fraction Normalization', () => {
    it('should normalize odd fractions to standard baking measurements for cups', () => {
      // 4 × (4/13) = 16/13 ≈ 1.2308 should round to 1 1/4 cups (1.25)
      const result = IngredientScalingService.scaleAmount('4 cups', 4 / 13);
      expect(result).toBe('1 1/4 cups');
    });

    it('should normalize 9/13 cup to 2/3 cup', () => {
      // 9/13 (≈0.692) should round to 2/3 (≈0.667)
      const result = IngredientScalingService.scaleAmount('9 cups', 1 / 13);
      expect(result).toBe('2/3 cup');
    });

    it('should normalize to nearest standard fraction for tablespoons', () => {
      // 5/13 tbsp (≈0.385) should round to 1/3 (≈0.333)
      const result = IngredientScalingService.scaleAmount('5 tbsp', 1 / 13);
      expect(result).toBe('1/3 tbsp');
    });

    it('should normalize to nearest standard fraction for teaspoons', () => {
      // 7/13 tsp (≈0.538) should round to 1/2 (0.5)
      const result = IngredientScalingService.scaleAmount('7 tsp', 1 / 13);
      expect(result).toBe('1/2 tsp');
    });

    it('should normalize all units with fractions', () => {
      // Pounds should also be normalized to standard fractions
      // 4 × (4/13) = 16/13 ≈ 1.2308 should round to 1 1/4 pounds (1.25)
      const result = IngredientScalingService.scaleAmount('4 pounds', 4 / 13);
      expect(result).toBe('1 1/4 pounds');
    });

    it('should handle mixed numbers with normalization', () => {
      // 1.69 cups (1 9/13) should normalize to 1 2/3 cups
      const result = IngredientScalingService.scaleAmount('1 9/13 cups', 1);
      expect(result).toBe('1 2/3 cups');
    });

    it('should keep values under 1/8 as-is', () => {
      // Very small amounts shouldn't be normalized
      const result = IngredientScalingService.scaleAmount('1 cup', 0.05);
      expect(result).toBe('0.05 cup');
    });
  });

  describe('Abbreviation Handling', () => {
    it('should not pluralize abbreviated units with periods', () => {
      const result = IngredientScalingService.scaleAmount('1 c.', 2);
      expect(result).toBe('2 c.');
    });

    it('should not pluralize single-letter units', () => {
      const result = IngredientScalingService.scaleAmount('1 c', 3);
      expect(result).toBe('3 c');
    });

    it('should not pluralize T. (tablespoon abbreviation)', () => {
      const result = IngredientScalingService.scaleAmount('1 T.', 2);
      expect(result).toBe('2 T.');
    });

    it('should not pluralize oz.', () => {
      const result = IngredientScalingService.scaleAmount('8 oz.', 0.5);
      expect(result).toBe('4 oz.');
    });

    it('should still pluralize full words', () => {
      const result = IngredientScalingService.scaleAmount('1 cup', 2);
      expect(result).toBe('2 cups');
    });
  });
});
