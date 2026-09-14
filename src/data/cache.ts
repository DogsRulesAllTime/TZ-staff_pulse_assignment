import { useQuery } from '@tanstack/react-query';
import { fetchOrgTree } from './api';

export const ORG_TREE_KEY = ['org-tree'] as const;

/** staleTime/retry defaults live on the shared QueryClient in src/main.tsx. */
export function useOrgTreeQuery() {
  return useQuery({ queryKey: ORG_TREE_KEY, queryFn: fetchOrgTree });
}
