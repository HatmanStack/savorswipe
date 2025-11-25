import { SearchService } from '../SearchService';
import { S3JsonData } from '@/types';

describe('SearchService', () => {
  // Mock recipe data covering all ingredient formats
  const mockJsonData: S3JsonData = {
    '1': {
      key: '1',
      Title: 'Chocolate Cake',
      Description: 'A rich chocolate dessert',
      Ingredients: '1 cup flour, 2 eggs, 1 cup chocolate',
      Directions: 'Mix and bake',
      Type: 'dessert',
    },
    '2': {
      key: '2',
      Title: 'pasta primavera',
      Description: 'Fresh vegetable pasta',
      Ingredients: ['1 lb pasta', '2 cups vegetables', '1 tbsp garlic'],
      Directions: ['Boil pasta', 'Sauté vegetables', 'Combine'],
      Type: 'main dish',
    },
    '3': {
      key: '3',
      Title: 'Chicken Stir Fry',
      Description: 'Asian-inspired chicken dish',
      Ingredients: {
        'chicken breast': '1 lb',
        'soy sauce': '2 tbsp',
        'vegetables': '2 cups',
      },
      Directions: {
        '1': 'Cut chicken',
        '2': 'Stir fry',
      },
      Type: 'main dish',
    },
    '4': {
      key: '4',
      Title: 'Apple Pie',
      Description: 'Classic dessert',
      Ingredients: {
        'For the crust': {
          'flour': '2 cups',
          'butter': '1/2 cup',
        },
        'For the filling': {
          'apples': '6 large',
          'sugar': '1 cup',
        },
      },
      Directions: 'Make crust, add filling, bake',
      Type: 'dessert',
    },
    '5': {
      key: '5',
      Title: 'Jalapeño Poppers',
      Description: 'Spicy appetizer',
      Ingredients: ['jalapeño peppers', 'cream cheese', 'bacon'],
      Directions: 'Stuff and bake',
      Type: 'appetizer',
    },
    '6': {
      key: '6',
      Title: 'French Toast',
      Description: 'Breakfast classic',
      Ingredients: 'bread, eggs, milk, cinnamon',
      Directions: 'Dip and fry',
      Type: 'breakfast',
    },
  };

  describe('searchRecipes', () => {
    it('should find recipes by title (case-insensitive)', () => {
      const results = SearchService.searchRecipes('chocolate', mockJsonData);
      expect(results).toHaveLength(1);
      expect(results[0].Title).toBe('Chocolate Cake');

      const results2 = SearchService.searchRecipes('PASTA', mockJsonData);
      expect(results2).toHaveLength(1);
      expect(results2[0].Title).toBe('pasta primavera');
    });

    it('should find recipes by ingredient (string format)', () => {
      const results = SearchService.searchRecipes('flour', mockJsonData);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.key === '1')).toBe(true); // Chocolate Cake has flour
    });

    it('should find recipes by ingredient (array format)', () => {
      const results = SearchService.searchRecipes('garlic', mockJsonData);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.key === '2')).toBe(true); // Pasta primavera has garlic
    });

    it('should find recipes by ingredient (object format)', () => {
      const results = SearchService.searchRecipes('soy sauce', mockJsonData);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.key === '3')).toBe(true); // Chicken Stir Fry has soy sauce
    });

    it('should find recipes by ingredient (nested object format)', () => {
      const results = SearchService.searchRecipes('butter', mockJsonData);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.key === '4')).toBe(true); // Apple Pie has butter in crust

      const results2 = SearchService.searchRecipes('apples', mockJsonData);
      expect(results2.length).toBeGreaterThanOrEqual(1);
      expect(results2.some(r => r.key === '4')).toBe(true); // Apple Pie has apples in filling
    });

    it('should return empty array for empty query', () => {
      const results = SearchService.searchRecipes('', mockJsonData);
      expect(results).toEqual([]);
    });

    it('should return empty array for whitespace-only query', () => {
      const results = SearchService.searchRecipes('   ', mockJsonData);
      expect(results).toEqual([]);

      const results2 = SearchService.searchRecipes('  \t  ', mockJsonData);
      expect(results2).toEqual([]);
    });

    it('should return empty array when no matches found', () => {
      const results = SearchService.searchRecipes('xyzabc123', mockJsonData);
      expect(results).toEqual([]);
    });

    it('should support partial matches', () => {
      const results = SearchService.searchRecipes('choc', mockJsonData);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.Title === 'Chocolate Cake')).toBe(true);
    });

    it('should handle special characters', () => {
      const results = SearchService.searchRecipes('jalapeño', mockJsonData);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.key === '5')).toBe(true); // Jalapeño Poppers
    });

    it('should find recipes when query matches both title and ingredients', () => {
      const results = SearchService.searchRecipes('chicken', mockJsonData);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.key === '3')).toBe(true); // Chicken Stir Fry
    });

    it('should handle trimmed queries', () => {
      const results = SearchService.searchRecipes('  chocolate  ', mockJsonData);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.Title === 'Chocolate Cake')).toBe(true);
    });

    it('should return all matching recipes, not just one', () => {
      // Both Chocolate Cake and Apple Pie should have flour
      const results = SearchService.searchRecipes('flour', mockJsonData);
      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });
});
