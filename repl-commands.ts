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
  readSubagentModelId,
  resolveAgentMode,
  resolvePoyrazEnvPath,
  rowToModelProfile,
  saveLastMode,
  saveLastModelProfile,
  setEnvVar,
  SUBAGENT_MODEL_ENV,
  unsetEnvVar,
  type AgentMode,
  type ListedChatModelRow,
  type ModelProfile,
  type OpenRouterTier,
} from 'poyraz';
import { handleAuthCommand, type AuthPanelContext } from './repl-auth.js';
import { handleMcpCommand } from './repl-mcp.js';
import { REPL_PRIMARY_COMMANDS } from './repl-autocomplete.js';

export {
  REPL_COMMANDS,
  REPL_PRIMARY_COMMANDS,
  REPL_COMMAND_ALIASES,
} from './repl-autocomplete.js';

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
      console.log(chalk.gray(`${indent}  ... +${more} more`));
    }
  }
}

export function formatReplCommandHint(): string {
  return REPL_PRIMARY_COMMANDS.join(', ');
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
  printField('Subagent:', readSubagentModelId() ?? '(off)');

  const mode = agent.getMode();
  printSection('Mode');
  printField('Active:', `${AGENT_MODES[mode].label} (${mode})`);
  printField('Tools:', agent.getTools().join(', ') || '(none)');

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
    console.log(chalk.red(`Model not found: ${modelId}`));
    printHint('List models with: /model list');
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
    printHint('(Additional provider metadata is unavailable)');
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
    console.log(chalk.gray(`${indent}... +${more} more`));
  }
}

export async function printModelList(): Promise<void> {
  const models = await listAggregatedChatModels(listChatModelsEnvFromProcess());

  if (models.length === 0) {
    console.log(chalk.yellow('No models available.'));
    return;
  }

  const groups = groupModelsByProvider(models);
  const breakdown = [...groups]
    .map(([provider, rows]) => `${formatProviderLabel(provider)}: ${rows.length}`)
    .join(', ');
  console.log(chalk.white(`Total: ${models.length} models (${breakdown})`));
  console.log();

  for (const [provider, rows] of groups) {
    const host = rows[0]?.host ?? '';
    console.log(
      chalk.cyan(`${formatProviderLabel(provider)} (${host}) — ${rows.length} models`)
    );
    if (provider === 'openrouter') {
      printOpenRouterTierRows(rows, '  ', MODEL_LIST_GROUP_LIMIT);
      continue;
    }
    printModelGroupRows(rows, '  ', MODEL_LIST_GROUP_LIMIT);
  }
}

function commitModelSwitch(ctx: ReplCommandContext, profile: ModelProfile): boolean {
  const current = ctx.agent.getModelProfile();
  if (current.model === profile.model && current.provider === profile.provider) {
    console.log(
      chalk.gray(
        `Already using ${profile.model} (${formatProviderLabel(profile.provider)})`
      )
    );
    return true;
  }

  ctx.agent.setModelProfile(profile);
  saveLastModelProfile(profile);
  ctx.onModelChange?.(profile);
  void ctx.onModelsRefreshed?.();

  console.log(
    chalk.green(
      `Model → ${profile.model} (${formatProviderLabel(profile.provider)})`
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
  printSection('Agent modes');
  for (const def of Object.values(AGENT_MODES)) {
    const active = agentMode === def.id ? chalk.green(' (active)') : '';
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
        `  Continuing the current plan (${formatTodoProgressSummary(snapshot)}):`
      )
    );
    console.log(chalk.white(formatTodoTable(snapshot)));
  } catch {
    // Non-fatal: mode switch still succeeded.
  }
}

export function switchAgentMode(ctx: ReplCommandContext, mode: AgentMode): boolean {
  const current = ctx.agent.getMode();
  if (current === mode) {
    console.log(chalk.gray(`Already in ${AGENT_MODES[mode].label} mode`));
    return true;
  }
  switchAgentModeQuiet(ctx, mode);
  console.log(chalk.green(`Mode → ${AGENT_MODES[mode].label}`));
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
    console.log(chalk.red(`Model not found: ${modelId}`));
    console.log(chalk.gray('List models with: /model list'));
    return false;
  }

  return commitModelSwitch(ctx, profile);
}

export function printSubagentModel(): void {
  const current = readSubagentModelId();
  printSection('Subagent model');
  printField('Model:', current ?? '(off)');
  printField('ENV:', SUBAGENT_MODEL_ENV);
  printField('File:', resolvePoyrazEnvPath());
  if (!current) {
    printHint('Set with /model subagent, or /model subagent <id>');
  }
}

export function setSubagentModel(ctx: ReplCommandContext, modelId: string): boolean {
  const trimmed = modelId.trim();
  if (!trimmed) {
    console.log(chalk.yellow('Usage: /model subagent <id> | <provider> <id>'));
    return false;
  }

  const current = readSubagentModelId();
  if (current === trimmed) {
    console.log(chalk.gray(`Subagent model already set to ${trimmed}`));
    return true;
  }

  setEnvVar(resolvePoyrazEnvPath(), SUBAGENT_MODEL_ENV, trimmed);
  process.env[SUBAGENT_MODEL_ENV] = trimmed;
  ctx.agent.syncDelegationTool();
  console.log(chalk.green(`Subagent model → ${trimmed}`));
  return true;
}

export function clearSubagentModel(ctx: ReplCommandContext): boolean {
  const current = readSubagentModelId();
  if (!current) {
    console.log(chalk.gray('Subagent model already cleared (delegate_task disabled)'));
    return true;
  }

  unsetEnvVar(resolvePoyrazEnvPath(), SUBAGENT_MODEL_ENV);
  delete process.env[SUBAGENT_MODEL_ENV];
  ctx.agent.syncDelegationTool();
  console.log(chalk.green('Subagent model cleared (delegate_task disabled)'));
  return true;
}

export async function switchSubagentModel(
  ctx: ReplCommandContext,
  modelId: string
): Promise<boolean> {
  const models = await listAggregatedChatModels(listChatModelsEnvFromProcess());
  const profile = findModelProfile(modelId, models);
  if (!profile) {
    console.log(chalk.red(`Model not found: ${modelId}`));
    console.log(chalk.gray('List models with: /model list'));
    return false;
  }
  return setSubagentModel(ctx, profile.model);
}

export function switchSubagentModelFromRow(
  ctx: ReplCommandContext,
  row: ListedChatModelRow
): boolean {
  return setSubagentModel(ctx, row.id);
}

function looksLikeModelSubcommandTypo(args: string): boolean {
  const token = args.trim().toLowerCase();
  if (!token || token.includes(' ')) return false;
  const known = ['list', 'info', 'subagent'];
  return known.some((item) => {
    if (token === item) return false;
    if (Math.abs(token.length - item.length) > 2) return false;
    let distance = 0;
    const max = Math.max(token.length, item.length);
    for (let i = 0; i < max; i++) {
      if (token[i] !== item[i]) distance += 1;
    }
    return distance > 0 && distance <= 2;
  });
}

async function handleModelSubagentCommand(
  args: string,
  ctx: AuthPanelContext
): Promise<boolean> {
  const rest = args.slice('subagent'.length).trim();
  if (!rest) {
    // Bare `/model subagent` is handled by the router (picker).
    return false;
  }

  const lower = rest.toLowerCase();
  if (lower === 'clear' || lower === 'unset') {
    clearSubagentModel(ctx);
    return true;
  }
  if (lower === 'show' || lower === 'status') {
    printSubagentModel();
    return true;
  }

  await switchSubagentModel(ctx, resolveModelIdFromCommandArgs(rest));
  return true;
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
      console.log(chalk.yellow('Usage: /mode list | agent | plan | ask | chat'));
      return true;
    }
    const mode = resolveAgentMode(modeToken);
    if (!mode) {
      console.log(chalk.red(`Unknown mode: ${modeToken}`));
      printHint('Modes: agent, plan, ask, chat');
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
          'Usage: /model list | info | subagent | <provider> <id> | <id>'
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
    if (args === 'subagent' || args.startsWith('subagent ')) {
      return handleModelSubagentCommand(args, ctx);
    }
    if (looksLikeModelSubcommandTypo(args)) {
      console.log(
        chalk.yellow(
          'Usage: /model list | info | subagent | <provider> <id> | <id>'
        )
      );
      return true;
    }
    await switchModel(ctx, resolveModelIdFromCommandArgs(args));
    return true;
  }

  return false;
}

