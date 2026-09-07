import { confirm, input, select } from '@inquirer/prompts';
import { CancelPromptError, ExitPromptError } from '@inquirer/core';
import chalk from 'chalk';
import {
  addMcpServer,
  isMcpHttpServerDef,
  listMcpServers,
  mcpClientManager,
  removeMcpServer,
  resolveMcpConfigPath,
  setMcpServerDisabled,
  type McpServerDef,
} from 'poyraz';
import type { ReplCommandContext } from './repl-commands.js';
import { printField, printSection } from './repl-theme.js';

export type McpPanelContext = ReplCommandContext;

const ADD_CHOICE = '__add__';
const PATH_CHOICE = '__path__';
const RELOAD_CHOICE = '__reload__';
const EXIT_CHOICE = '__exit__';

function isPromptCancelled(error: unknown): boolean {
  return error instanceof ExitPromptError || error instanceof CancelPromptError;
}

function mcpConfigPath(): string {
  return resolveMcpConfigPath();
}

function formatServerStatus(id: string): string {
  const state = mcpClientManager.listStates().find((s) => s.id === id);
  if (!state) return chalk.gray('(bağlı değil)');
  if (state.status === 'connected') return chalk.green(`bağlı · ${state.toolCount} araç`);
  if (state.status === 'disabled') return chalk.gray('devre dışı');
  return chalk.red(`hata: ${state.error ?? 'bilinmeyen'}`);
}

export function printMcpList(): void {
  const servers = listMcpServers();
  printSection('MCP Sunucuları');
  printField('Dosya:', mcpConfigPath());
  console.log();

  if (servers.length === 0) {
    console.log(chalk.gray('  Henüz sunucu eklenmedi.'));
    return;
  }

  for (const { id, def } of servers) {
    const target = isMcpHttpServerDef(def) ? def.url : [def.command, ...(def.args ?? [])].join(' ');
    console.log(`  ${chalk.cyan(id.padEnd(16))}${chalk.white(target)}`);
    console.log(`  ${''.padEnd(16)}${formatServerStatus(id)}`);
  }
}

export function printMcpPath(): void {
  printField('Dosya:', mcpConfigPath());
}

async function reloadMcpServers(ctx: McpPanelContext): Promise<void> {
  await ctx.onMcpChanged?.();
}

/** Prompts for KEY=VALUE lines until an empty line; used for both env vars and HTTP headers. */
async function promptKeyValueLines(message: string): Promise<Record<string, string> | undefined> {
  const values: Record<string, string> = {};
  while (true) {
    const line = await input({ message, default: '' });
    if (!line.trim()) break;
    const eq = line.indexOf('=');
    if (eq <= 0) {
      console.log(chalk.yellow('Format: KEY=VALUE'));
      continue;
    }
    values[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return Object.keys(values).length > 0 ? values : undefined;
}

async function promptStdioServerDef(): Promise<McpServerDef | undefined> {
  const command = await input({ message: 'Komut (örn. npx)' });
  if (!command.trim()) {
    console.log(chalk.yellow('Komut boş; eklenmedi.'));
    return undefined;
  }

  const argsLine = await input({
    message: 'Argümanlar (boşlukla ayrılmış, örn. -y @modelcontextprotocol/server-filesystem /path)',
    default: '',
  });
  const args = argsLine.trim() ? argsLine.trim().split(/\s+/) : undefined;

  const wantsEnv = await confirm({ message: 'Ortam değişkeni eklensin mi?', default: false });
  const env = wantsEnv ? await promptKeyValueLines('KEY=VALUE (boş bırak: bitir)') : undefined;

  return { command: command.trim(), args, env };
}

async function promptHttpServerDef(): Promise<McpServerDef | undefined> {
  const url = await input({ message: 'Sunucu URL (örn. https://example.com/mcp)' });
  if (!url.trim()) {
    console.log(chalk.yellow('URL boş; eklenmedi.'));
    return undefined;
  }

  const wantsHeaders = await confirm({ message: 'Header eklensin mi (örn. Authorization)?', default: false });
  const headers = wantsHeaders
    ? await promptKeyValueLines('HEADER=VALUE (boş bırak: bitir)')
    : undefined;

  return { url: url.trim(), headers };
}

export async function addMcpServerInteractive(ctx: McpPanelContext, id: string): Promise<boolean> {
  const trimmedId = id.trim();
  if (!trimmedId) {
    console.log(chalk.yellow('Sunucu id boş olamaz.'));
    return false;
  }

  const transport = await select({
    message: 'Transport türü',
    choices: [
      { name: 'stdio — yerel komut (npx/node ile çalışan sunucu)', value: 'stdio' },
      { name: 'http — uzak sunucu URL (Streamable HTTP)', value: 'http' },
    ],
  });

  const def = transport === 'http' ? await promptHttpServerDef() : await promptStdioServerDef();
  if (!def) return false;

  addMcpServer(trimmedId, def);
  await reloadMcpServers(ctx);

  console.log(chalk.green(`${trimmedId} eklendi.`));
  return true;
}

export async function removeMcpServerCommand(ctx: McpPanelContext, id: string): Promise<boolean> {
  const trimmedId = id.trim();
  const removed = removeMcpServer(trimmedId);
  if (!removed) {
    console.log(chalk.yellow(`Sunucu bulunamadı: ${trimmedId}`));
    return false;
  }
  await mcpClientManager.disconnect(trimmedId);
  await reloadMcpServers(ctx);
  console.log(chalk.green(`${trimmedId} kaldırıldı.`));
  return true;
}

export async function setMcpServerEnabledCommand(
  ctx: McpPanelContext,
  id: string,
  disabled: boolean
): Promise<boolean> {
  const trimmedId = id.trim();
  const updated = setMcpServerDisabled(trimmedId, disabled);
  if (!updated) {
    console.log(chalk.yellow(`Sunucu bulunamadı: ${trimmedId}`));
    return false;
  }
  await reloadMcpServers(ctx);
  console.log(chalk.green(`${trimmedId} ${disabled ? 'devre dışı bırakıldı' : 'etkinleştirildi'}.`));
  return true;
}

async function runServerAction(ctx: McpPanelContext, id: string): Promise<void> {
  const action = await select({
    message: id,
    choices: [
      { name: 'Etkinleştir/Devre dışı bırak', value: 'toggle' },
      { name: 'Kaldır', value: 'remove' },
      { name: 'Geri', value: 'back' },
    ],
  });

  if (action === 'remove') {
    await removeMcpServerCommand(ctx, id);
    return;
  }
  if (action === 'toggle') {
    const servers = listMcpServers();
    const current = servers.find((s) => s.id === id);
    const nextDisabled = !(current?.def.disabled ?? false);
    await setMcpServerEnabledCommand(ctx, id, nextDisabled);
  }
}

export async function runMcpPanel(ctx: McpPanelContext): Promise<void> {
  try {
    while (true) {
      printMcpList();
      console.log();

      const servers = listMcpServers();
      const choice = await select({
        message: 'İşlem seç',
        choices: [
          ...servers.map(({ id }) => ({ name: id, value: id })),
          { name: '── Sunucu ekle', value: ADD_CHOICE },
          { name: '── Yeniden bağlan', value: RELOAD_CHOICE },
          { name: '── Yol göster', value: PATH_CHOICE },
          { name: '── Çık', value: EXIT_CHOICE },
        ],
      });

      if (choice === EXIT_CHOICE) return;
      if (choice === PATH_CHOICE) {
        printMcpPath();
        continue;
      }
      if (choice === RELOAD_CHOICE) {
        await reloadMcpServers(ctx);
        console.log(chalk.green('MCP sunucuları yeniden bağlandı.'));
        continue;
      }
      if (choice === ADD_CHOICE) {
        const id = await input({ message: 'Sunucu id' });
        await addMcpServerInteractive(ctx, id);
        continue;
      }

      await runServerAction(ctx, choice);
    }
  } catch (error: unknown) {
    if (isPromptCancelled(error)) return;
    throw error;
  }
}

export async function handleMcpCommand(text: string, ctx: McpPanelContext): Promise<boolean> {
  if (text === '/mcp') return false;

  if (text === '/mcp list') {
    printMcpList();
    return true;
  }

  if (text === '/mcp path') {
    printMcpPath();
    return true;
  }

  if (text === '/mcp reload') {
    await reloadMcpServers(ctx);
    console.log(chalk.green('MCP sunucuları yeniden bağlandı.'));
    return true;
  }

  if (text.startsWith('/mcp add ')) {
    const id = text.slice('/mcp add '.length).trim();
    await addMcpServerInteractive(ctx, id);
    return true;
  }

  if (text.startsWith('/mcp remove ')) {
    const id = text.slice('/mcp remove '.length).trim();
    await removeMcpServerCommand(ctx, id);
    return true;
  }

  if (text.startsWith('/mcp enable ')) {
    const id = text.slice('/mcp enable '.length).trim();
    await setMcpServerEnabledCommand(ctx, id, false);
    return true;
  }

  if (text.startsWith('/mcp disable ')) {
    const id = text.slice('/mcp disable '.length).trim();
    await setMcpServerEnabledCommand(ctx, id, true);
    return true;
  }

  if (text.startsWith('/mcp ')) {
    console.log(
      chalk.yellow(
        'Kullanım: /mcp list | path | reload | add <id> (stdio veya http seçilir) | remove <id> | enable <id> | disable <id>'
      )
    );
    return true;
  }

  return false;
}
