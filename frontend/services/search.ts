/**
 * Search Service
 * TODO: Implement unified search
 */

import { Post } from '@/types/posts';

export type { Post };

export interface SearchResults {
  posts: Post[];
  recipes: any[];
  users: any[];
}

// Stub functions - TODO: Implement
export async function search(query: string, token: string): Promise<SearchResults> {
  // TODO: Implement API call
  return {
    posts: [],
    recipes: [],
    users: [],
  };
}

