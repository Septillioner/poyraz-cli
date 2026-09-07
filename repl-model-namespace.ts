import type {
  ListedChatModelRow,
  ModelProviderKind,
  OpenRouterTier,
} from 'poyraz';

export const MODEL_PROVIDER_ORDER: ModelProviderKind[] = [
  'ollama',
  'openai',
  'groq',
  'gemini',
  'openrouter',
];

const PROVIDER_TOKENS = new Set<string>(MODEL_PROVIDER_ORDER);
const TIER_TOKENS = new Set<string>(['free', 'premium']);

export type NamespaceQuery = {
  provider?: ModelProviderKind;
  tier?: OpenRouterTier;
  term: string;
  raw: string;
};

export function formatModelNamespace(row: ListedChatModelRow): string {
  const slug = row.id.replace(/\//g, '.').replace(/:/g, '.');
  if (row.provider === 'openrouter') {
    return `openrouter.${row.tier ?? 'premium'}.${slug}`;
  }
  return `${row.provider}.${slug}`;
}

export function parseNamespaceQuery(query: string): NamespaceQuery {
  const raw = query.trim().toLowerCase();
  if (!raw) return { term: '', raw };

  if (!raw.includes('.')) {
    if (TIER_TOKENS.has(raw)) {
      return { provider: 'openrouter', tier: raw as OpenRouterTier, term: '', raw };
    }
    if (PROVIDER_TOKENS.has(raw)) {
      return { provider: raw as ModelProviderKind, term: '', raw };
    }
    return { term: raw, raw };
  }

  const parts = raw.split('.');
  let provider: ModelProviderKind | undefined;
  let tier: OpenRouterTier | undefined;
  let startIdx = 0;

  if (parts[0] && PROVIDER_TOKENS.has(parts[0])) {
    provider = parts[0] as ModelProviderKind;
    startIdx = 1;
    if (provider === 'openrouter' && parts[1] && TIER_TOKENS.has(parts[1])) {
      tier = parts[1] as OpenRouterTier;
      startIdx = 2;
    }
  }

  const term = parts.slice(startIdx).join('.');
  return { provider, tier, term, raw };
}

export function modelMatchesNamespaceQuery(
  row: ListedChatModelRow,
  namespace: string,
  parsed: NamespaceQuery
): boolean {
  if (parsed.provider && row.provider !== parsed.provider) return false;
  if (parsed.tier && row.provider === 'openrouter' && (row.tier ?? 'premium') !== parsed.tier) {
    return false;
  }
  if (!parsed.term) return true;

  const term = parsed.term;
  return (
    namespace.includes(term) ||
    row.id.toLowerCase().includes(term) ||
    row.name.toLowerCase().includes(term)
  );
}

export function compareModelSearchRank(
  a: ListedChatModelRow,
  b: ListedChatModelRow,
  parsed: NamespaceQuery,
  providerOrder: ModelProviderKind[] = MODEL_PROVIDER_ORDER
): number {
  const nsA = formatModelNamespace(a);
  const nsB = formatModelNamespace(b);
  const q = parsed.raw;

  const scorePrefix = (ns: string): number => {
    if (!q) return 1;
    if (ns.startsWith(q)) return 0;
    if (parsed.term && ns.includes(parsed.term)) return 1;
    return 2;
  };

  const prefixDiff = scorePrefix(nsA) - scorePrefix(nsB);
  if (prefixDiff !== 0) return prefixDiff;

  const idxA = providerOrder.indexOf(a.provider);
  const idxB = providerOrder.indexOf(b.provider);
  if (idxA !== idxB) return idxA - idxB;

  return nsA.localeCompare(nsB);
}
