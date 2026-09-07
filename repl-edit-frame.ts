import chalk from 'chalk';

const MAX_PREVIEW_LINES = 14;
const MIN_FRAME_WIDTH = 44;
const MAX_FRAME_WIDTH = 100;
const MIN_GUTTER_WIDTH = 2;
const DEFAULT_COLUMNS = 80;
const ELLIPSIS = '…';

export interface EditFrameInput {
  filePath: string;
  code: string;
  startLine?: number;
  linesAdded?: number;
  linesRemoved?: number;
  indent?: string;
}

interface FrameStats {
  plain: string;
  colored: string;
}

function resolveFrameWidth(indentWidth: number): number {
  const columns = process.stdout.columns ?? DEFAULT_COLUMNS;
  const usable = Math.min(MAX_FRAME_WIDTH, columns - indentWidth - 1);
  return Math.max(MIN_FRAME_WIDTH, usable);
}

function truncateEnd(text: string, max: number): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  if (max === 1) return ELLIPSIS;
  return text.slice(0, max - 1) + ELLIPSIS;
}

function truncateStart(text: string, max: number): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  if (max === 1) return ELLIPSIS;
  return ELLIPSIS + text.slice(text.length - (max - 1));
}

function buildStats(linesAdded?: number, linesRemoved?: number): FrameStats | null {
  if (linesAdded === undefined && linesRemoved === undefined) return null;
  const added = linesAdded ?? 0;
  const removed = linesRemoved ?? 0;
  const plain = `+${added} -${removed}`;
  const colored = `${chalk.green(`+${added}`)} ${chalk.red(`-${removed}`)}`;
  return { plain, colored };
}

function buildTopBorder(filePath: string, stats: FrameStats | null, frameWidth: number): string {
  if (stats) {
    const decorationsWidth = 8;
    const maxNameWidth = frameWidth - stats.plain.length - decorationsWidth - 1;
    const name = truncateStart(filePath, Math.max(1, maxNameWidth));
    const fillCount = Math.max(1, frameWidth - name.length - stats.plain.length - decorationsWidth);
    const fill = '─'.repeat(fillCount);
    return chalk.gray(
      `┌─ ${chalk.cyan.bold(name)} ${fill} ${stats.colored} ${chalk.gray('─┐')}`
    );
  }
  const decorationsWidth = 6;
  const maxNameWidth = frameWidth - decorationsWidth - 1;
  const name = truncateStart(filePath, Math.max(1, maxNameWidth));
  const fillCount = Math.max(1, frameWidth - name.length - decorationsWidth);
  const fill = '─'.repeat(fillCount);
  return chalk.gray(`┌─ ${chalk.cyan.bold(name)} ${fill}─┐`);
}

function buildBottomBorder(frameWidth: number): string {
  return chalk.gray(`└${'─'.repeat(frameWidth - 2)}┘`);
}

function buildCodeRow(
  lineNumber: number,
  rawLine: string,
  gutterWidth: number,
  codeWidth: number
): string {
  const gutter = String(lineNumber).padStart(gutterWidth);
  const normalized = rawLine.replace(/\t/g, '  ');
  const code = truncateEnd(normalized, codeWidth).padEnd(codeWidth);
  return (
    chalk.gray('│') +
    ' ' +
    chalk.gray(gutter) +
    ' ' +
    chalk.gray('│') +
    ' ' +
    chalk.white(code) +
    chalk.gray('│')
  );
}

function buildNoteRow(note: string, innerWidth: number): string {
  const content = truncateEnd(` ${note}`, innerWidth).padEnd(innerWidth);
  return chalk.gray('│') + chalk.gray(content) + chalk.gray('│');
}

export function renderEditFrame(input: EditFrameInput): string {
  const indent = input.indent ?? '  ';
  const startLine = input.startLine ?? 1;
  const stats = buildStats(input.linesAdded, input.linesRemoved);

  const allLines = input.code.split('\n');
  const shownLines = allLines.slice(0, MAX_PREVIEW_LINES);
  const hiddenCount = allLines.length - shownLines.length;

  const frameWidth = resolveFrameWidth(indent.length);
  const innerWidth = frameWidth - 2;
  const lastLineNumber = startLine + shownLines.length - 1;
  const gutterWidth = Math.max(MIN_GUTTER_WIDTH, String(lastLineNumber).length);
  const codeWidth = innerWidth - gutterWidth - 4;

  const rows: string[] = [];
  rows.push(buildTopBorder(input.filePath, stats, frameWidth));
  shownLines.forEach((line, i) => {
    rows.push(buildCodeRow(startLine + i, line, gutterWidth, codeWidth));
  });
  if (hiddenCount > 0) {
    const suffix = hiddenCount === 1 ? 'line' : 'lines';
    rows.push(buildNoteRow(`${ELLIPSIS} +${hiddenCount} more ${suffix}`, innerWidth));
  }
  rows.push(buildBottomBorder(frameWidth));

  return rows.map((row) => `${indent}${row}`).join('\n');
}
