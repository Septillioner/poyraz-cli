import {
  listAggregatedChatModels,
  listChatModelsEnvFromProcess,
  type ListedChatModelRow,
} from 'poyraz';

export async function prefetchModels(cache: ListedChatModelRow[]): Promise<void> {
  try {
    const models = await listAggregatedChatModels(listChatModelsEnvFromProcess());
    cache.length = 0;
    cache.push(...models);
  } catch {
    // model picker degrades to live fetch on demand
  }
}

export async function refreshModels(cache: ListedChatModelRow[]): Promise<void> {
  await prefetchModels(cache);
}
