import chalk from 'chalk';

/** Compact semantic colors for the REPL. */
export const theme = {
  meta: (text: string) => chalk.gray(text),
  agent: (text: string) => chalk.white(text),
  agentPrefix: () => chalk.white('Agent> '),
  tool: (text: string) => chalk.yellow(text),
  success: (text: string) => chalk.green(text),
  warning: (text: string) => chalk.yellow(text),
  error: (text: string) => chalk.red(text),
  accent: (text: string) => chalk.cyan(text),
  bold: (text: string) => chalk.bold.white(text),
};

export function printSection(title: string): void {
  console.log(theme.meta(`── ${title}`));
}

export function printLine(value: string): void {
  console.log(`  ${theme.bold(value)}`);
}

export function printField(label: string, value: string | number): void {
  console.log(`  ${theme.meta(label.padEnd(12))}${theme.bold(String(value))}`);
}

export function printHint(text: string): void {
  console.log(theme.warning(text));
}

export function printFieldParts(
  label: string,
  parts: Array<string | number>,
  separator = ' '
): void {
  const value = parts.map((p) => theme.bold(String(p))).join(separator);
  console.log(`  ${theme.meta(label.padEnd(12))}${value}`);
}
