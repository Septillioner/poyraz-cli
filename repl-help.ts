import { REPL_PRIMARY_COMMANDS } from './repl-autocomplete.js';
import { modeCycleHint } from './repl-terminal.js';
import { printHint, printSection, theme } from './repl-theme.js';

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

export function suggestCommand(input: string): string | undefined {
  const token = input.trim().split(/\s+/)[0]?.toLowerCase();
  if (!token?.startsWith('/')) return undefined;

  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const command of REPL_PRIMARY_COMMANDS) {
    const distance = levenshtein(token, command);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = command;
    }
  }
  if (best && bestDistance > 0 && bestDistance <= 3) return best;
  return undefined;
}

export function printUnknownCommand(input: string): void {
  const suggestion = suggestCommand(input);
  if (suggestion) {
    console.log(theme.warning(`Unknown command: ${input}. Did you mean ${suggestion}?`));
  } else {
    console.log(theme.warning(`Unknown command: ${input}`));
  }
  printHint('Try /help');
}

export function printHelp(topic?: string): void {
  const normalized = topic?.trim().toLowerCase();
  if (!normalized) {
    printSection('Help');
    console.log(theme.meta('  /auth /mcp /model /mode /todo /usage /verbose /bye'));
    console.log(theme.meta('  /help keys · /help model · /help mode'));
    console.log(
      theme.meta('  Subagent: /model subagent · one background job · auto-inject')
    );
    return;
  }

  if (normalized === 'keys') {
    printSection('Keyboard');
    console.log(theme.meta(`  ${modeCycleHint()}`));
    console.log(theme.meta('  ↑ / ↓           History'));
    console.log(theme.meta('  Esc             Clear draft'));
    console.log(theme.meta('  Ctrl+C          Clear draft; again within 2s exits'));
    console.log(theme.meta('  Ctrl+C (busy)   Abort reply + cancel subagent'));
    return;
  }

  if (normalized === 'model') {
    printSection('Model');
    console.log(theme.meta('  /model · list · info · subagent · <id> · <provider> <id>'));
    console.log(theme.meta('  /model subagent clear'));
    return;
  }

  if (normalized === 'mode') {
    printSection('Mode');
    console.log(theme.meta('  /mode · list · agent|plan|ask|chat'));
    console.log(theme.meta('  Agent full · Plan read+plan · Ask read · Chat none'));
    return;
  }

  console.log(theme.warning(`Unknown help topic: ${topic}`));
  printHint('Topics: keys, model, mode');
}
