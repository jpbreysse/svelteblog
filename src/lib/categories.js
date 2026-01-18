// src/lib/categories.js
import { PUBLIC_BLOG_CATEGORIES } from '$env/static/public';

// Default categories used as fallback
const DEFAULT_CATEGORIES = [
  { value: 'thoughts', label: 'Thoughts' },
  { value: 'reflections', label: 'Reflections' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'creative', label: 'Creative' },
  { value: 'personal', label: 'Personal' },
  { value: 'tech', label: 'Technology' },
  { value: 'tutorial', label: 'Tutorial' },
  { value: 'politics', label: 'Politics' }
];

/**
 * Parse categories from environment variable (fallback mode)
 * Format: value:Display Name,value2:Display Name 2
 * Example: thoughts:Thoughts,tech:Technology
 *
 * NOTE: This function is for client-side use and fallback.
 * For server-side, use getCategoriesFromDB() or load via +page.server.js
 */
export function getCategories() {
  if (!PUBLIC_BLOG_CATEGORIES) {
    // Fallback to default categories if env var not set
    return DEFAULT_CATEGORIES;
  }

  return PUBLIC_BLOG_CATEGORIES
    .split(',')
    .map(cat => {
      const [value, label] = cat.trim().split(':');
      return {
        value: value.trim(),
        label: label ? label.trim() : value.trim()
      };
    })
    .filter(cat => cat.value); // Filter out empty entries
}

/**
 * Get the default category (first in the list)
 * @param {Array} categories - Optional categories array (for server-loaded data)
 */
export function getDefaultCategory(categories = null) {
  const cats = categories || getCategories();
  return cats.length > 0 ? cats[0].value : 'thoughts';
}

/**
 * Get category label by value
 * @param {string} value - Category value
 * @param {Array} categories - Optional categories array (for server-loaded data)
 */
export function getCategoryLabel(value, categories = null) {
  const cats = categories || getCategories();
  const category = cats.find(cat => cat.value === value);
  return category ? category.label : value;
}

/**
 * Get default categories array (used for migrations and fallbacks)
 */
export function getDefaultCategories() {
  return DEFAULT_CATEGORIES;
}
