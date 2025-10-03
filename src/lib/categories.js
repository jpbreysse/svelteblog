// src/lib/categories.js
import { PUBLIC_BLOG_CATEGORIES } from '$env/static/public';

/**
 * Parse categories from environment variable
 * Format: value:Display Name,value2:Display Name 2
 * Example: thoughts:Thoughts,tech:Technology
 */
export function getCategories() {
  if (!PUBLIC_BLOG_CATEGORIES) {
    // Fallback to default categories if env var not set
    return [
      { value: 'thoughts', label: 'Thoughts' },
      { value: 'reflections', label: 'Reflections' },
      { value: 'lifestyle', label: 'Lifestyle' },
      { value: 'creative', label: 'Creative' },
      { value: 'personal', label: 'Personal' },
      { value: 'tech', label: 'Technology' },
      { value: 'tutorial', label: 'Tutorial' },
      { value: 'politics', label: 'Politics' }
    ];
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
 */
export function getDefaultCategory() {
  const categories = getCategories();
  return categories.length > 0 ? categories[0].value : 'thoughts';
}

/**
 * Get category label by value
 */
export function getCategoryLabel(value) {
  const categories = getCategories();
  const category = categories.find(cat => cat.value === value);
  return category ? category.label : value;
}
