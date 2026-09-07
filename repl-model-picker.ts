import { search } from '@inquirer/prompts';
import { CancelPromptError, ExitPromptError } from '@inquirer/core';
import {
  formatProviderLabel,
  groupModelsByProvider,
  listAggregatedChatModels,
  listChatModelsEnvFromProcess,
  type ListedChatModelRow,
  type ModelProviderKind,
} from 'poyraz';
import { switchModelFromRow, type ReplCommandContext } from './repl-commands.js';
import {
  compareModelSearchRank,
  formatModelNamespace,
  MODEL_PROVIDER_ORDER,
  modelMatchesNamespaceQuery,
  parseNamespaceQuery,
} from './repl-model-namespace.js';
import { printField, printHint, printSection } from './repl-theme.js';

export type ModelPickerContext = ReplCommandContext & {
  getModelRows: () => ListedChatModelRow[];
};

const EMPTY_QUERY_PER_PROVIDER_LIMIT = 25;
const FILTERED_QUERY_LIMIT = 40;

function pickerValue(row: ListedChatModelRow): string {
  return `${row.provider}|${row.id}`;
}

export function resolvePickerValue(
  value: string,
  rows: ListedChatModelRow[]
): ListedChatModelRow | undefined {
  const pipe = value.indexOf('|');
  if (pipe === -1) {
    return rows.find((row) => row.id === value);
  }
  const provider = value.slice(0, pipe) as ModelProviderKind;
  const id = value.slice(pipe + 1);
  return rows.find((row) => row.provider === provider && row.id === id);
}

export function searchModels(
  query: string,
  rows: ListedChatModelRow[],
  limit?: number
): ListedChatModelRow[] {
  const parsed = parseNamespaceQuery(query);

  if (!parsed.raw) {
    const maxPerProvider = limit ?? EMPTY_QUERY_PER_PROVIDER_LIMIT;
    const groups = groupModelsByProvider(rows);
    const result: ListedChatModelRow[] = [];
    for (const provider of MODEL_PROVIDER_ORDER) {
      const groupRows = groups.get(provider);
      if (!groupRows?.length) continue;
      const providerSorted = [...groupRows].sort((a, b) =>
        compareModelSearchRank(a, b, { term: '', raw: '' })
      );
      result.push(...providerSorted.slice(0, maxPerProvider));
    }
    return result;
  }

  const max = limit ?? FILTERED_QUERY_LIMIT;
  const matches = rows.filter((row) => {
    const namespace = formatModelNamespace(row);
    return modelMatchesNamespaceQuery(row, namespace, parsed);
  });

  matches.sort((a, b) => compareModelSearchRank(a, b, parsed));
  return matches.slice(0, max);
}

function pickerDescription(row: ListedChatModelRow): string | undefined {
  const parts: string[] = [];
  if (row.name && row.name !== row.id) {
    parts.push(row.name.replace(/\s+/g, ' ').trim().slice(0, 60));
  }
  const desc = row.description?.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (desc) parts.push(desc);
  if (parts.length === 0) return undefined;
  return parts.join(' — ').slice(0, 80);
}

function isPickerCancelled(error: unknown): boolean {
  return error instanceof ExitPromptError || error instanceof CancelPromptError;
}

export async function runModelPicker(ctx: ModelPickerContext): Promise<void> {
  try {
    let rows = ctx.getModelRows();
    if (rows.length === 0) {
      rows = await listAggregatedChatModels(listChatModelsEnvFromProcess());
    }

    if (rows.length === 0) {
      printHint('Kullanılabilir model bulunamadı.');
      return;
    }

    const current = ctx.agent.getModelProfile();
    printSection('Model seç');
    printField('Aktif:', `${current.model} (${formatProviderLabel(current.provider)})`);
    printHint(
      'openai.gpt · openrouter.premium... — yazarak filtrele · ↑↓ gez · Enter seç · Esc iptal'
    );
    console.log();

    const selected = await search<string>({
      message: 'Model ara',
      pageSize: 12,
      source: (term) => {
        const matches = searchModels(term ?? '', rows);
        return matches.map((row) => ({
          name: formatModelNamespace(row),
          value: pickerValue(row),
          description: pickerDescription(row),
        }));
      },
    });

    const row = resolvePickerValue(String(selected), rows);
    if (row) {
      await switchModelFromRow(ctx, row);
    }
  } catch (error: unknown) {
    if (isPickerCancelled(error)) {
      printHint('Model seçimi iptal edildi.');
      return;
    }
    throw error;
  }
}
