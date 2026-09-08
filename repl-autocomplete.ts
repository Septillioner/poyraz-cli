export const REPL_PRIMARY_COMMANDS = [
  '/help',
  '/auth',
  '/model',
  '/mode',
  '/mcp',
  '/todo',
  '/usage',
  '/verbose',
  '/bye',
] as const;

export const REPL_COMMAND_ALIASES = [
  '/todos',
  '/stats',
  '/exit',
  '/quit',
] as const;

/** Commands shown in help/autocomplete (aliases excluded). */
export const REPL_COMMANDS = REPL_PRIMARY_COMMANDS;

const SUBCOMMANDS: Record<string, readonly string[]> = {
  '/help': ['keys', 'model', 'mode'],
  '/model': ['list', 'info', 'subagent'],
  '/mode': ['list', 'agent', 'plan', 'ask', 'chat'],
  '/auth': ['list', 'path', 'import', 'pull', 'show', 'set', 'unset'],
  '/mcp': ['list', 'path', 'reload', 'add', 'remove', 'enable', 'disable'],
  '/verbose': ['on', 'off'],
};

const NESTED_SUBCOMMANDS: Record<string, readonly string[]> = {
  '/model subagent': ['clear', 'unset', 'show'],
};

export type CompletionResult = {
  line: string;
  cursor: number;
  applied: string;
  /** All candidates when Tab is cycling among several matches. */
  matches?: readonly string[];
};

export function longestCommonPrefix(values: readonly string[]): string {
  if (values.length === 0) return '';
  let prefix = values[0];
  for (let i = 1; i < values.length; i++) {
    const value = values[i];
    while (!value.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return '';
    }
  }
  return prefix;
}

function cycleMatch(
  matches: readonly string[],
  currentToken: string,
  cycleFrom?: string
): string {
  if (matches.length === 1) return matches[0];

  const common = longestCommonPrefix(matches);
  if (common.length > currentToken.length) return common;

  const current =
    cycleFrom && matches.includes(cycleFrom) ? cycleFrom : currentToken;
  const index = matches.indexOf(current);
  if (index === -1) return matches[0];
  return matches[(index + 1) % matches.length];
}

/**
 * Completes slash text at the cursor. Returns null when there is nothing to apply.
 */
export function completeAtCursor(
  line: string,
  cursor: number,
  commands: readonly string[] = REPL_PRIMARY_COMMANDS,
  cycleFrom?: string
): CompletionResult | null {
  const sanitized = line.replace(/\t/g, '');
  const safeCursor = Math.min(Math.max(0, cursor), sanitized.length);
  const before = sanitized.slice(0, safeCursor);
  const after = sanitized.slice(safeCursor);

  if (!before.startsWith('/')) return null;

  const spaceIndex = before.indexOf(' ');
  if (spaceIndex === -1) {
    const matches = commands.filter((command) => command.startsWith(before));
    if (matches.length === 0) return null;
    const completed = cycleMatch(matches, before, cycleFrom);
    const lineNext = completed + after;
    return {
      line: lineNext,
      cursor: completed.length,
      applied: completed,
      matches: matches.length > 1 ? matches : undefined,
    };
  }

  const command = before.slice(0, spaceIndex);
  const argBefore = before.slice(spaceIndex + 1);

  const nestedKey = Object.keys(NESTED_SUBCOMMANDS).find((key) =>
    before.startsWith(`${key} `)
  );
  if (nestedKey) {
    const nestedOptions = NESTED_SUBCOMMANDS[nestedKey];
    const nestedArg = before.slice(nestedKey.length + 1);
    if (nestedArg.includes(' ')) return null;
    const matches = nestedOptions
      .filter((option) => option.startsWith(nestedArg))
      .map((option) => `${nestedKey} ${option}`);
    if (matches.length === 0) return null;
    const currentFull = `${nestedKey} ${nestedArg}`;
    const completed = cycleMatch(matches, currentFull, cycleFrom);
    const lineNext = completed + after;
    return {
      line: lineNext,
      cursor: completed.length,
      applied: completed,
      matches: matches.length > 1 ? matches : undefined,
    };
  }

  if (argBefore.includes(' ')) return null;

  const options = SUBCOMMANDS[command];
  if (!options) return null;

  const matches = options
    .filter((option) => option.startsWith(argBefore))
    .map((option) => `${command} ${option}`);
  if (matches.length === 0) return null;

  const currentFull = `${command} ${argBefore}`;
  const completed = cycleMatch(matches, currentFull, cycleFrom);
  const lineNext = completed + after;
  return {
    line: lineNext,
    cursor: completed.length,
    applied: completed,
    matches: matches.length > 1 ? matches : undefined,
  };
}

/**
 * Completes a slash command draft (legacy whole-line helper).
 */
export function completeReplCommand(
  draft: string,
  commands: readonly string[] = REPL_PRIMARY_COMMANDS,
  cycleFrom?: string
): string | null {
  const result = completeAtCursor(draft.replace(/\t/g, ''), draft.length, commands, cycleFrom);
  return result?.line ?? null;
}
