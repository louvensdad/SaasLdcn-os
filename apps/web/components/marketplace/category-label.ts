// The backend returns the category directly in Portuguese (a fixed, known
// set of 9 -- see derive_category in apps/api/app/services/marketplace_service.py).
// This maps those literal strings to i18n keys so the other 3 locales render
// translated labels instead of always showing Portuguese.
const CATEGORY_KEYS: Record<string, string> = {
  'IA': 'marketplace.category.ia',
  'Backend': 'marketplace.category.backend',
  'Frontend': 'marketplace.category.frontend',
  'DevOps': 'marketplace.category.devops',
  'Cloud': 'marketplace.category.cloud',
  'Banco de Dados': 'marketplace.category.database',
  'Segurança': 'marketplace.category.security',
  'Automação': 'marketplace.category.automation',
  'Integrações': 'marketplace.category.integrations',
};

export function categoryLabel(t: (key: string) => string, category: string): string {
  const key = CATEGORY_KEYS[category];
  if (!key) return category;
  const label = t(key);
  return label === key ? category : label;
}
