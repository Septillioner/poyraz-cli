import chalk from 'chalk';

export function printSection(title: string): void {
  console.log(chalk.bold.cyan(`── ${title} ──`));
}

export function printLine(value: string): void {
  console.log(chalk.bold.white(`  ${value}`));
}

export function printField(label: string, value: string | number): void {
  console.log(`  ${chalk.cyan(label.padEnd(12))}${chalk.bold.white(String(value))}`);
}

export function printHint(text: string): void {
  console.log(chalk.yellow(text));
}

export function printFieldParts(
  label: string,
  parts: Array<string | number>,
  separator = ' '
): void {
  const value = parts.map((p) => chalk.bold.white(String(p))).join(separator);
  console.log(`  ${chalk.cyan(label.padEnd(12))}${value}`);
}
