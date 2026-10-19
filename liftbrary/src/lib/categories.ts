export const CATEGORIES = [
  { id: 'chest', name: 'Chest' },
  { id: 'back', name: 'Back' },
  { id: 'shoulders', name: 'Shoulders' },
  { id: 'biceps', name: 'Biceps' },
  { id: 'triceps', name: 'Triceps' },
  { id: 'forearms', name: 'Forearms' },
  { id: 'legs', name: 'Legs' },
  { id: 'glutes', name: 'Glutes' },
  { id: 'core', name: 'Core' },
  { id: 'full-body', name: 'Full Body' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export function categoryName(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.name ?? id;
}
