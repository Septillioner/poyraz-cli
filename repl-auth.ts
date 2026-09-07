import { confirm, input, password, select } from '@inquirer/prompts';
import { CancelPromptError, ExitPromptError } from '@inquirer/core';
import chalk from 'chalk';
import {
  AUTH_PROVIDER_DEFS,
  collectProjectAuthVars,
  collectProjectEnvPaths,
  importProjectAuthToPoyraz,
  loadPoyrazEnvIntoProcess,
  maskSecret,
  readPoyrazAuthValues,
  resolveAuthProvider,
  resolvePoyrazEnvPath,
  setEnvVar,
  unsetEnvVar,
  type AuthProviderDef,
} from 'poyraz';
import type { ReplCommandContext } from './repl-commands.js';
import { printField, printHint, printSection } from './repl-theme.js';

export type AuthPanelContext = ReplCommandContext;

const PATH_CHOICE = '__path__';
const IMPORT_CHOICE = '__import__';
const EXIT_CHOICE = '__exit__';

function isPromptCancelled(error: unknown): boolean {
  return error instanceof ExitPromptError || error instanceof CancelPromptError;
}

function authEnvPath(): string {
  return resolvePoyrazEnvPath();
}

function readStoredValue(def: AuthProviderDef): string | undefined {
  const fromFile = readPoyrazAuthValues().get(def.envKey);
  if (fromFile !== undefined) return fromFile;
  return process.env[def.envKey];
}

async function reloadAuthInSession(ctx: ReplCommandContext): Promise<void> {
  loadPoyrazEnvIntoProcess();
  await ctx.onAuthChanged?.();
}

function formatProviderStatus(def: AuthProviderDef): string {
  const value = readStoredValue(def);
  const masked = maskSecret(value, def.secret);
  if (!value?.trim()) return chalk.gray('(eksik)');
  return chalk.green(masked);
}

export async function printAuthList(): Promise<void> {
  const envPath = authEnvPath();
  printSection('API Anahtarları');
  printField('Dosya:', envPath);
  console.log();

  for (const def of AUTH_PROVIDER_DEFS) {
    const value = readStoredValue(def);
    const masked = maskSecret(value, def.secret);
    const status = value?.trim() ? chalk.green(masked) : chalk.gray('(eksik)');
    console.log(`  ${chalk.cyan(def.label.padEnd(12))}${status}`);
  }
}

export function printAuthPath(): void {
  printField('Dosya:', authEnvPath());
}

export async function showAuthProvider(providerToken: string): Promise<boolean> {
  const def = resolveAuthProvider(providerToken);
  if (!def) {
    console.log(chalk.red(`Bilinmeyen provider: ${providerToken}`));
    printHint('Provider: openai, groq, gemini, openrouter, ollama');
    return false;
  }

  const value = readStoredValue(def);
  printSection(def.label);
  printField('ENV:', def.envKey);
  printField('Değer:', maskSecret(value, def.secret));
  return true;
}

export async function setAuthProvider(
  ctx: AuthPanelContext,
  providerToken: string,
  rawValue?: string
): Promise<boolean> {
  const def = resolveAuthProvider(providerToken);
  if (!def) {
    console.log(chalk.red(`Bilinmeyen provider: ${providerToken}`));
    printHint('Provider: openai, groq, gemini, openrouter, ollama');
    return false;
  }

  let value = rawValue?.trim();
  if (!value) {
    value = def.secret
      ? await password({ message: `${def.label} API key` })
      : await input({
          message: `${def.label} host`,
          default: readStoredValue(def) ?? 'http://localhost:11434',
        });
  }

  if (!value?.trim()) {
    console.log(chalk.yellow('Değer boş; kayıt yapılmadı.'));
    return false;
  }

  setEnvVar(authEnvPath(), def.envKey, value.trim());
  process.env[def.envKey] = value.trim();
  await reloadAuthInSession(ctx);

  console.log(chalk.green(`${def.label} kaydedildi (${maskSecret(value, def.secret)}).`));
  return true;
}

export async function importAuthFromProject(
  ctx: ReplCommandContext,
  overwrite = false
): Promise<boolean> {
  const sourcePaths = collectProjectEnvPaths();
  if (sourcePaths.length === 0) {
    console.log(chalk.yellow('Proje .env dosyası bulunamadı (cwd → kök).'));
    return false;
  }

  const found = collectProjectAuthVars();
  if (found.size === 0) {
    console.log(chalk.yellow('Proje .env içinde taşınacak API anahtarı yok.'));
    printHint(`Kaynak: ${sourcePaths.join(', ')}`);
    return false;
  }

  const result = importProjectAuthToPoyraz({ overwrite });
  const imported = result.entries.filter((e) => e.action === 'imported');
  const skipped = result.entries.filter((e) => e.action === 'skipped');

  printSection('Proje .env içe aktarma');
  printField('Kaynak:', sourcePaths[0]);
  if (sourcePaths.length > 1) {
    printField('Ek:', `${sourcePaths.length - 1} üst dizin .env`);
  }
  printField('Hedef:', authEnvPath());
  console.log();

  for (const entry of result.entries) {
    const masked = maskSecret(entry.value, entry.def.secret);
    if (entry.action === 'imported') {
      console.log(`  ${chalk.green('[ok]')} ${chalk.cyan(entry.def.label.padEnd(12))}${masked}`);
    } else if (entry.action === 'skipped') {
      console.log(
        `  ${chalk.yellow('[atla]')} ${chalk.cyan(entry.def.label.padEnd(12))}${masked} ${chalk.gray('(~/.poyraz zaten dolu)')}`
      );
    }
  }

  if (imported.length === 0 && skipped.length > 0 && !overwrite) {
    printHint('Üzerine yazmak için: /auth import --overwrite');
    return false;
  }

  if (imported.length > 0) {
    await reloadAuthInSession(ctx);
    console.log(chalk.green(`\n${imported.length} anahtar ~/.poyraz/.env dosyasına aktarıldı.`));
  } else {
    console.log(chalk.gray('\nYeni aktarım yapılmadı.'));
  }

  return imported.length > 0;
}

export async function unsetAuthProvider(
  ctx: ReplCommandContext,
  providerToken: string
): Promise<boolean> {
  const def = resolveAuthProvider(providerToken);
  if (!def) {
    console.log(chalk.red(`Bilinmeyen provider: ${providerToken}`));
    printHint('Provider: openai, groq, gemini, openrouter, ollama');
    return false;
  }

  const removed = unsetEnvVar(authEnvPath(), def.envKey);
  delete process.env[def.envKey];
  await reloadAuthInSession(ctx);

  if (removed) {
    console.log(chalk.green(`${def.label} kaldırıldı.`));
  } else {
    console.log(chalk.yellow(`${def.label} zaten tanımlı değil.`));
  }
  return true;
}

async function runProviderAction(
  ctx: AuthPanelContext,
  def: AuthProviderDef
): Promise<'back' | 'exit'> {
  const action = await select({
    message: def.label,
    choices: [
      { name: 'Göster (maskeli)', value: 'show' },
      { name: 'Ayarla', value: 'set' },
      { name: 'Kaldır', value: 'unset' },
      { name: 'Geri', value: 'back' },
    ],
  });

  if (action === 'back') return 'back';
  if (action === 'show') {
    await showAuthProvider(def.token);
    return 'back';
  }
  if (action === 'set') {
    await setAuthProvider(ctx, def.token);
    return 'back';
  }
  await unsetAuthProvider(ctx, def.token);
  return 'back';
}

export async function runAuthPanel(ctx: AuthPanelContext): Promise<void> {
  try {
    while (true) {
      printSection('API Anahtarları');
      printField('Dosya:', authEnvPath());
      console.log();

      const choice = await select({
        message: 'İşlem seç',
        choices: [
          ...AUTH_PROVIDER_DEFS.map((def) => ({
            name: `${def.label.padEnd(10)} ${formatProviderStatus(def)}`,
            value: def.token,
          })),
          { name: '── Proje .env\'den içe aktar', value: IMPORT_CHOICE },
          { name: '── Yol göster', value: PATH_CHOICE },
          { name: '── Çık', value: EXIT_CHOICE },
        ],
      });

      if (choice === EXIT_CHOICE) return;
      if (choice === IMPORT_CHOICE) {
        const found = collectProjectAuthVars();
        if (found.size === 0) {
          console.log(chalk.yellow('Proje .env içinde taşınacak API anahtarı yok.'));
          continue;
        }
        const overwrite = await confirm({
          message: '~/.poyraz içindeki mevcut değerlerin üzerine yazılsın mı?',
          default: false,
        });
        await importAuthFromProject(ctx, overwrite);
        continue;
      }
      if (choice === PATH_CHOICE) {
        printAuthPath();
        continue;
      }

      const result = await runProviderAction(ctx, resolveAuthProvider(choice)!);
      if (result === 'exit') return;
    }
  } catch (error: unknown) {
    if (isPromptCancelled(error)) return;
    throw error;
  }
}

export async function handleAuthCommand(
  text: string,
  ctx: AuthPanelContext
): Promise<boolean> {
  if (text === '/auth') return false;

  if (text === '/auth list') {
    await printAuthList();
    return true;
  }

  if (text === '/auth path') {
    printAuthPath();
    return true;
  }

  if (text === '/auth import' || text === '/auth pull') {
    await importAuthFromProject(ctx, false);
    return true;
  }

  if (text === '/auth import --overwrite' || text === '/auth import overwrite') {
    await importAuthFromProject(ctx, true);
    return true;
  }

  if (text.startsWith('/auth show ')) {
    const provider = text.slice('/auth show '.length).trim();
    await showAuthProvider(provider);
    return true;
  }

  if (text.startsWith('/auth set ')) {
    const rest = text.slice('/auth set '.length).trim();
    const space = rest.indexOf(' ');
    if (space === -1) {
      await setAuthProvider(ctx, rest);
    } else {
      const provider = rest.slice(0, space);
      const value = rest.slice(space + 1);
      await setAuthProvider(ctx, provider, value);
    }
    return true;
  }

  if (text.startsWith('/auth unset ')) {
    const provider = text.slice('/auth unset '.length).trim();
    await unsetAuthProvider(ctx, provider);
    return true;
  }

  if (text.startsWith('/auth ')) {
    console.log(
      chalk.yellow(
        'Kullanım: /auth list | path | import [--overwrite] | set <provider> [değer] | unset <provider> | show <provider>'
      )
    );
    return true;
  }

  return false;
}
