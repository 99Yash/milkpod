export const queryKeys = {
  assets: {
    all: ['assets'] as const,
    lists: () => ['assets', 'list'] as const,
    list: (filters?: Record<string, string>) =>
      ['assets', 'list', filters ?? {}] as const,
    detail: (id: string) => ['assets', 'detail', id] as const,
  },
  collections: {
    all: ['collections'] as const,
    lists: () => ['collections', 'list'] as const,
    list: () => ['collections', 'list'] as const,
    detail: (id: string) => ['collections', 'detail', id] as const,
  },
  shareLinks: (params: { assetId?: string; collectionId?: string }) =>
    ['share-links', params] as const,
  sharedResource: (token: string) => ['shared-resource', token] as const,
  transcriptSearch: (assetId: string, query: string) =>
    ['transcript-search', assetId, query] as const,
};
