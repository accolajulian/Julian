import type { CategoryId } from './categories';

export type Platform = 'youtube' | 'tiktok' | 'instagram' | 'other';

// One saved workout video. It can live in more than one category.
export type Workout = {
  id: string;
  url: string;
  title: string;
  thumbnailUrl?: string;
  platform: Platform;
  categories: CategoryId[];
  createdAt: number;
};
