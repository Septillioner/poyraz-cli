import chalk from 'chalk';
import {
  printField,
  printFieldParts,
  printHint,
  printLine,
  printSection,
} from './repl-theme.js';
import {
  AGENT_MODES,
  Agent,
  fetchModelInfo,
  fetchModelInfoForId,
  findModelProfile,
  formatProviderLabel,
  formatTodoProgressSummary,
  formatTodoTable,
  groupModelsByProvider,
  groupOpenRouterByTier,
  listAggregatedChatModels,
  listChatModelsEnvFromProcess,
  resolveAgentMode,
  rowToModelProfile,
  saveLastMode,
  saveLastModelProfile,
  type AgentMode,
  type ListedChatModelRow,
  type ModelProfile,
  type OpenRouterTier,
} from 'poyraz';
import { handleAuthCommand, type AuthPanelContext } from './repl-auth.js';
import { handleMcpCommand } from './repl-mcp.js';

const MODEL_PROVIDER_TOKENS = ['ollama', 'openai', 'groq', 'gemini', 'openrouter'] as const;
const OPENROUTER_TIER_ORDER: OpenRouterTier[] = ['free', 'premium'];
const MODEL_LIST_GROUP_LIMIT = 20;
const DESCRIPTION_MAX_LEN = 200;

function stripOpenRouterTierFromModelPart(modelPart: string): string {
  for (const tier of OPENROUTER_TIER_ORDER) {
    const slashPrefix = `${tier}/`;
    if (modelPart.startsWith(slashPrefix)) {
      return modelPart.slice(slashPrefix.length);
    }
    const spacePrefix = `${tier} `;
    if (modelPart.startsWith(spacePrefix)) {
      return modelPart.slice(spacePrefix.length);
    }
    if (modelPart === tier) return '';
  }
  return modelPart;
}

export function resolveModelIdFromCommandArgs(args: string): string {
  const trimmed = args.trim();
  const tokens = trimmed.split(/\s+/);
  if (
    tokens.length >= 2 &&
    MODEL_PROVIDER_TOKENS.includes(tokens[0] as (typeof MODEL_PROVIDER_TOKENS)[number])
  ) {
    const modelPart = tokens.slice(1).join(' ');
    if (tokens[0] === 'openrouter') {
      return stripOpenRouterTierFromModelPart(modelPart);
    }
    return modelPart;
  }
  return trimmed;
}

function printOpenRouterTierRows(
  rows: ListedChatModelRow[],
  indent: string,
  limit: number
): void {
  const byTier = groupOpenRouterByTier(rows);
  const itemPrefix = limit === Infinity ? '- ' : '';
  for (const tier of OPENROUTER_TIER_ORDER) {
    const tierRows = byTier.get(tier) ?? [];
    if (tierRows.length === 0) continue;
    console.log(chalk.cyan(`${indent}${tier}`));
    const shown = tierRows.slice(0, limit);
    for (const row of shown) {
      console.log(chalk.gray(`${indent}  ${itemPrefix}${row.id}`));
    }
    const more = tierRows.length - shown.length;
    if (more > 0) {
      console.log(chalk.gray(`${indent}  ... +${more} daha`));
    }
  }
}

export const REPL_COMMANDS = [
  '/auth',
  '/mode',
  '/model',
  '/mcp',
  '/todo',
  '/todos',
  '/usage',
  '/stats',
  '/bye',
  '/exit',
  '/quit',
] as const;

export function formatReplCommandHint(): string {
  return REPL_COMMANDS.join(', ');
}

export interface ReplCommandContext {
  agent: Agent;
  onModelChange?: (profile: ModelProfile) => void;
  onAuthChanged?: () => void | Promise<void>;
  onModeChanged?: () => void | Promise<void>;
  onModelsRefreshed?: () => void | Promise<void>;
  onMcpChanged?: () => void | Promise<void>;
  getModelRows?: () => ListedChatModelRow[];
}

function formatModelLabel(profile: ModelProfile, tier?: OpenRouterTier): string {
  const provider = formatProviderLabel(profile.provider);
  if (tier) return `${profile.model}  (${provider} · ${tier})`;
  return `${profile.model}  (${provider})`;
}

function printTokenBlock(usage: {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
}): void {
  printField('Prompt:', usage.promptTokens.toLocaleString());
  printField('Completion:', usage.completionTokens.toLocaleString());
  printField('Total:', usage.totalTokens.toLocaleString());
  if (usage.cachedTokens) {
    printField('Cached:', usage.cachedTokens.toLocaleString());
  }
}

function printRuntimeContext(agent: Agent): void {
  const context = agent.getContextUsage();
  const memory = agent.getMemoryUsage();
  const breakdown = agent.getUsageBreakdown();

  printSection('Runtime context');
  printFieldParts('Tokens:', [
    context.used.toLocaleString(),
    '/',
    context.total.toLocaleString(),
    `(${context.percentage}%)`,
  ]);
  printFieldParts('Turns:', [
    memory.current,
    '/',
    memory.limit,
    `(${memory.percentage}%)`,
  ]);

  printSection('Context distribution');
  const roles = ['system', 'user', 'assistant', 'tool'] as const;
  for (const role of roles) {
    const tokens = breakdown.byRole[role];
    if (tokens === 0 && breakdown.messageCounts[role] === 0) continue;
    printFieldParts(`${role}:`, [tokens.toLocaleString(), `(${breakdown.percentages[role]}%)`]);
  }

  printSection('Messages');
  const counts = breakdown.messageCounts;
  printLine(
    `user=${counts.user}  assistant=${counts.assistant}  tool=${counts.tool}  system=${counts.system}`
  );
}

export async function printUsage(agent: Agent): Promise<void> {
  const profile = agent.getModelProfile();
  const models = await listAggregatedChatModels(listChatModelsEnvFromProcess());
  const row = models.find(
    (m) => m.id === profile.model && m.provider === profile.provider
  );
  const context = agent.getContextUsage();
  const memory = agent.getMemoryUsage();
  const stats = agent.getStats();

  printSection('Model');
  printLine(formatModelLabel(profile, row?.tier));
  printField('Host:', profile.host);

  const mode = agent.getMode();
  printSection('Mode');
  printField('Active:', `${AGENT_MODES[mode].label} (${mode})`);
  printField('Tools:', agent.getTools().join(', ') || '(yok)');

  printSection('Context');
  printFieldParts('Tokens:', [
    context.used.toLocaleString(),
    '/',
    context.total.toLocaleString(),
    `(${context.percentage}%)`,
  ]);
  printFieldParts('Turns:', [
    memory.current,
    '/',
    memory.limit,
    `(${memory.percentage}%)`,
  ]);

  printSection('Session tokens');
  printTokenBlock(stats.session);

  printSection('Last turn');
  printTokenBlock(stats.current);

  const apiKey = agent.getApiKeyPreview();
  if (apiKey) {
    printSection('API key');
    printLine(apiKey);
  }
}

export async function printModelInfo(agent: Agent, modelId?: string): Promise<void> {
  const env = listChatModelsEnvFromProcess();
  const info = modelId
    ? await fetchModelInfoForId(modelId, env)
    : await fetchModelInfo(agent.getModelProfile(), env);

  if (!info) {
    console.log(chalk.red(`Model bulunamadı: ${modelId}`));
    printHint('Kullanılabilir modeller için: /model list');
    return;
  }

  printSection('Model');
  printField('ID:', info.id);
  if (info.displayName && info.displayName !== info.id) {
    printField('Name:', info.displayName);
  }
  printField('Provider:', formatProviderLabel(info.provider));
  printField('Host:', info.host);
  if (info.tier) printField('Tier:', info.tier);
  if (info.contextLength) {
    printField('Context:', `${info.contextLength.toLocaleString()} tokens`);
  }
  if (info.pricing) {
    printLine(
      `prompt=${info.pricing.prompt}  completion=${info.pricing.completion} (USD/token)`
    );
  }
  if (info.ollama) {
    if (info.ollama.family) printField('Family:', info.ollama.family);
    if (info.ollama.parameterSize) printField('Params:', info.ollama.parameterSize);
    if (info.ollama.quantization) printField('Quant:', info.ollama.quantization);
  }
  if (info.description) {
    const compact = info.description.replace(/\s+/g, ' ').trim();
    const desc =
      compact.length > DESCRIPTION_MAX_LEN
        ? `${compact.slice(0, DESCRIPTION_MAX_LEN)}...`
        : compact;
    printField('About:', desc);
  }
  if (info.limitedMetadata) {
    printHint('(Ek provider metadata mevcut degil)');
  }

  if (!modelId) {
    printRuntimeContext(agent);
  }
}

export function printModel(agent: Agent): void {
  const profile = agent.getModelProfile();
  printField('Model:', profile.model);
  printField('Provider:', formatProviderLabel(profile.provider));
  printField('Host:', profile.host);
}

function printModelGroupRows(
  rows: ListedChatModelRow[],
  indent: string,
  limit: number
): void {
  const shown = rows.slice(0, limit);
  for (const row of shown) {
    console.log(chalk.gray(`${indent}- ${row.id}`));
  }
  const more = rows.length - shown.length;
  if (more > 0) {
    console.log(chalk.gray(`${indent}... +${more} daha`));
  }
}

export async function printModelList(): Promise<void> {
  const models = await listAggregatedChatModels(listChatModelsEnvFromProcess());

  if (models.length === 0) {
    console.log(chalk.yellow('Kullanılabilir model bulunamadı.'));
    return;
  }

  const groups = groupModelsByProvider(models);
  const breakdown = [...groups]
    .map(([provider, rows]) => `${formatProviderLabel(provider)}: ${rows.length}`)
    .join(', ');
  console.log(chalk.white(`Toplam: ${models.length} model (${breakdown})`));
  console.log();

  for (const [provider, rows] of groups) {
    const host = rows[0]?.host ?? '';
    console.log(
      chalk.cyan(`${formatProviderLabel(provider)} (${host}) — ${rows.length} model`)
    );
    if (provider === 'openrouter') {
      printOpenRouterTierRows(rows, '  ', MODEL_LIST_GROUP_LIMIT);
      continue;
    }
    printModelGroupRows(rows, '  ', MODEL_LIST_GROUP_LIMIT);
  }
}

function commitModelSwitch(ctx: ReplCommandContext, profile: ModelProfile): boolean {
  ctx.agent.setModelProfile(profile);
  saveLastModelProfile(profile);
  ctx.onModelChange?.(profile);
  void ctx.onModelsRefreshed?.();

  console.log(
    chalk.green(
      `Model değiştirildi: ${profile.model} (${formatProviderLabel(profile.provider)})`
    )
  );
  return true;
}

export function switchModelFromRow(
  ctx: ReplCommandContext,
  row: ListedChatModelRow
): boolean {
  return commitModelSwitch(ctx, rowToModelProfile(row));
}

export function printModeList(agentMode?: AgentMode): void {
  printSection('Agent modlari');
  for (const def of Object.values(AGENT_MODES)) {
    const active = agentMode === def.id ? chalk.green(' (aktif)') : '';
    console.log(
      `  ${chalk.cyan(def.label.padEnd(8))}${chalk.gray(def.id.padEnd(8))}${def.description}${active}`
    );
  }
}

export function switchAgentModeQuiet(ctx: ReplCommandContext, mode: AgentMode): boolean {
  ctx.agent.setMode(mode);
  saveLastMode(mode);
  void ctx.onModeChanged?.();
  return true;
}

export async function printCurrentTodos(agent: Agent): Promise<void> {
  const snapshot = await agent.getTodoSnapshot();
  console.log(chalk.cyan('\n' + formatTodoTable(snapshot)));
  if (snapshot.totalCount > 0) {
    console.log(chalk.gray(`  ${formatTodoProgressSummary(snapshot)}`));
  }
  console.log();
}

async function printTodoHandoffHint(agent: Agent, mode: AgentMode): Promise<void> {
  if (mode !== 'agent') return;
  try {
    const snapshot = await agent.getTodoSnapshot();
    if (snapshot.totalCount === 0) return;
    console.log(
      chalk.cyan(
        `  Ayni oturumdaki plan devam edecek (${formatTodoProgressSummary(snapshot)}):`
      )
    );
    console.log(chalk.white(formatTodoTable(snapshot)));
  } catch {
    // Non-fatal: mode switch still succeeded.
  }
}

export function switchAgentMode(ctx: ReplCommandContext, mode: AgentMode): boolean {
  switchAgentModeQuiet(ctx, mode);
  console.log(
    chalk.green(`Mod degistirildi: ${AGENT_MODES[mode].label} (${mode})`)
  );
  void printTodoHandoffHint(ctx.agent, mode);
  return true;
}

export async function switchModel(
  ctx: ReplCommandContext,
  modelId: string
): Promise<boolean> {
  const models = await listAggregatedChatModels(listChatModelsEnvFromProcess());

  const profile = findModelProfile(modelId, models);
  if (!profile) {
    console.log(chalk.red(`Model bulunamadı: ${modelId}`));
    console.log(chalk.gray('Kullanılabilir modeller için: /model list'));
    return false;
  }

  return commitModelSwitch(ctx, profile);
}

export async function handleReplCommand(
  text: string,
  ctx: AuthPanelContext
): Promise<boolean> {
  if (text === '/usage' || text === '/stats') {
    await printUsage(ctx.agent);
    return true;
  }

  if (text === '/todo' || text === '/todos') {
    await printCurrentTodos(ctx.agent);
    return true;
  }

  if (text === '/auth' || text.startsWith('/auth ')) {
    return handleAuthCommand(text, ctx);
  }

  if (text === '/mcp' || text.startsWith('/mcp ')) {
    return handleMcpCommand(text, ctx);
  }

  if (text === '/mode list') {
    printModeList(ctx.agent.getMode());
    return true;
  }

  if (text.startsWith('/mode ')) {
    const modeToken = text.slice('/mode '.length).trim().toLowerCase();
    if (!modeToken) {
      console.log(chalk.yellow('Kullanim: /mode list | agent | plan | ask | chat'));
      return true;
    }
    const mode = resolveAgentMode(modeToken);
    if (!mode) {
      console.log(chalk.red(`Bilinmeyen mod: ${modeToken}`));
      printHint('Modlar: agent, plan, ask, chat');
      return true;
    }
    switchAgentMode(ctx, mode);
    return true;
  }

  if (text === '/model list') {
    await printModelList();
    return true;
  }

  if (text.startsWith('/model ')) {
    const args = text.slice('/model '.length).trim();
    if (!args) {
      console.log(
        chalk.yellow(
          'Kullanım: /model list | info | <provider> <id> | <id>'
        )
      );
      return true;
    }
    if (args === 'list') {
      await printModelList();
      return true;
    }
    if (args === 'info') {
      await printModelInfo(ctx.agent);
      return true;
    }
    if (args.startsWith('info ')) {
      const modelId = resolveModelIdFromCommandArgs(args.slice('info '.length));
      await printModelInfo(ctx.agent, modelId);
      return true;
    }
    await switchModel(ctx, resolveModelIdFromCommandArgs(args));
    return true;
  }

  return false;
}

