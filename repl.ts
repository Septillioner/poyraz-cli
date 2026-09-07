import chalk from 'chalk';
import {
  Agent,
  AgentStreamEvent,
  applyStreamEvent,
  ChatAbortedError,
  createActivityTracker,
  formatProviderLabel,
  formatTodoTable,
  getLifecycleLabel,
  mcpClientManager,
  nextAgentMode,
  type ListedChatModelRow,
  type ToolActivityView,
  stripMarkersFromCodeEdit,
} from 'poyraz';
import { renderEditFrame } from './repl-edit-frame.js';
import {
  formatReplCommandHint,
  handleReplCommand,
  switchAgentModeQuiet,
  type ReplCommandContext,
} from './repl-commands.js';
import { runAuthPanel } from './repl-auth.js';
import { runMcpPanel } from './repl-mcp.js';
import { buildInputMessage, isExitCommand, isPromptCancelled, replInputTheme } from './repl-input.js';
import replMainInput from './repl-main-input.js';
import { modeCycleHint } from './repl-terminal.js';
import { runModePicker } from './repl-mode-picker.js';
import { runModelPicker } from './repl-model-picker.js';
import { prefetchModels, refreshModels } from './repl-models.js';
import { printHint } from './repl-theme.js';
import { ReplStatusLine } from './repl-status.js';

type ReplContext = ReplCommandContext & {
  getModelRows: () => ListedChatModelRow[];
};

export class ChatRepl {
  private busy = false;
  private abortRequested = false;
  private tracker = createActivityTracker();
  private exiting = false;
  private modelRows: ListedChatModelRow[] = [];
  private chatAbort?: AbortController;
  private statusLine = new ReplStatusLine();
  private chatSigIntHandler?: () => void;

  constructor(private agent: Agent) {}

  private commandContext(): ReplContext {
    return {
      agent: this.agent,
      getModelRows: () => this.modelRows,
      onModelsRefreshed: () => refreshModels(this.modelRows),
      onAuthChanged: async () => {
        const profile = this.agent.getModelProfile();
        this.agent.setModelProfile(profile);
        await refreshModels(this.modelRows);
      },
      onMcpChanged: async () => {
        this.agent.removeExternalTools();
        const tools = await mcpClientManager.connectAll();
        if (Object.keys(tools).length > 0) this.agent.mergeExternalTools(tools);
      },
    };
  }

  async start(): Promise<void> {
    this.printBanner();
    void prefetchModels(this.modelRows).catch(() => {});

    while (!this.exiting) {
      let text: string;
      try {
        text = await replMainInput({
          message: buildInputMessage(this.agent),
          theme: replInputTheme,
          onModeCycle: () => {
            const next = nextAgentMode(this.agent.getMode());
            switchAgentModeQuiet(this.commandContext(), next);
            return buildInputMessage(this.agent);
          },
        });
      } catch (error: unknown) {
        if (isPromptCancelled(error)) {
          await this.close();
          return;
        }
        throw error;
      }

      const trimmed = text.trim();
      if (!trimmed) continue;
      if (isExitCommand(trimmed)) {
        await this.close();
        return;
      }

      if (trimmed.startsWith('/')) {
        await this.runCommand(trimmed);
      } else {
        await this.handleMessage(trimmed);
      }
    }
  }

  private async runCommand(text: string): Promise<void> {
    try {
      if (text === '/model') {
        await runModelPicker(this.commandContext());
        return;
      }

      if (text === '/auth') {
        await runAuthPanel(this.commandContext());
        return;
      }

      if (text === '/mode') {
        await runModePicker(this.commandContext());
        return;
      }

      if (text === '/mcp') {
        await runMcpPanel(this.commandContext());
        return;
      }

      const handled = await handleReplCommand(text, this.commandContext());
      if (!handled) {
        console.log(chalk.yellow(`Bilinmeyen komut: ${text}`));
        printHint(`Komutlar: ${formatReplCommandHint()}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`\nHata: ${message}`));
    }
  }

  private printBanner(): void {
    const tools = this.agent.getTools();
    const profile = this.agent.getModelProfile();

    console.log(chalk.cyan('─'.repeat(50)));
    console.log(
      chalk.bold.white(`Template: ${this.agent.getName()}`),
      chalk.white(`| Model: ${profile.model} (${formatProviderLabel(profile.provider)})`)
    );
    if (tools.length) {
      console.log(chalk.white(`Tools: ${tools.join(', ')}`));
    }
    console.log(
      chalk.white(
        `Komutlar: ${formatReplCommandHint()} — ${modeCycleHint()} · /model · Ctrl+C iptal · /bye cikis`
      )
    );
    console.log(
      chalk.white('/auth — API anahtarlari (~/.poyraz) · /mode — mod secici · /model — model secici')
    );
    console.log(chalk.white('/mcp — custom MCP sunucu yonetimi (~/.poyraz/mcp.json)'));
    console.log(chalk.white('/model <provider> <id> — dogrudan model degistir'));
    console.log(chalk.cyan('─'.repeat(50)));
  }

  private abortActiveChat(): void {
    if (!this.busy) return;
    if (this.abortRequested) {
      this.statusLine.stop();
      return;
    }
    this.abortRequested = true;
    process.stdout.write('\n');
    this.statusLine.stop();
    this.chatAbort?.abort();
  }

  private chatWithAbort(
    text: string,
    handlers: { onEvent: (event: AgentStreamEvent) => void; signal: AbortSignal }
  ) {
    const signal = handlers.signal;
    return Promise.race([
      this.agent.chat(text, handlers),
      new Promise<never>((_, reject) => {
        if (signal.aborted) {
          reject(new ChatAbortedError());
          return;
        }
        signal.addEventListener('abort', () => reject(new ChatAbortedError()), { once: true });
      }),
    ]);
  }

  private enableChatInterrupt(): void {
    const onInterrupt = () => {
      if (this.busy) this.abortActiveChat();
    };
    this.chatSigIntHandler = onInterrupt;
    process.on('SIGINT', onInterrupt);
  }

  private disableChatInterrupt(): void {
    if (!this.chatSigIntHandler) return;
    process.removeListener('SIGINT', this.chatSigIntHandler);
    this.chatSigIntHandler = undefined;
  }

  private async close(): Promise<void> {
    if (this.exiting) return;
    this.exiting = true;
    console.log(chalk.white('\nGörüşmek üzere.'));
    await mcpClientManager.disconnectAll().catch(() => {});
    process.exit(0);
  }

  private printEditFrame(view: ToolActivityView): void {
    const codeEdit = view.args?.code_edit;
    const targetFile = view.args?.target_file;
    if (typeof codeEdit !== 'string' || typeof targetFile !== 'string') return;

    const code = stripMarkersFromCodeEdit(codeEdit);
    if (!code.trim()) return;

    const ranges =
      (view.resultMeta?.changed_ranges as
        | Array<{ start_line: number; lines_added: number; lines_removed: number }>
        | undefined) ?? [];
    const hasRanges = ranges.length > 0;
    const linesAdded = ranges.reduce((sum, r) => sum + r.lines_added, 0);
    const linesRemoved = ranges.reduce((sum, r) => sum + r.lines_removed, 0);

    console.log(
      renderEditFrame({
        filePath: targetFile,
        code,
        startLine: hasRanges ? ranges[0].start_line : 1,
        linesAdded: hasRanges ? linesAdded : undefined,
        linesRemoved: hasRanges ? linesRemoved : undefined,
      })
    );
  }

  private async handleMessage(text: string): Promise<void> {
    this.busy = true;
    this.abortRequested = false;
    this.tracker = createActivityTracker();
    this.chatAbort = new AbortController();
    this.chatAbort.signal.addEventListener(
      'abort',
      () => {
        this.statusLine.stop();
      },
      { once: true }
    );

    let fullResponse = '';
    let isStreaming = false;
    let isReasoningStreaming = false;

    const clearStatus = () => {
      this.statusLine.stop();
    };

    const endReasoningStream = () => {
      if (!isReasoningStreaming) return;
      process.stdout.write('\n');
      isReasoningStreaming = false;
    };

    this.enableChatInterrupt();

    const handleEvent = (event: AgentStreamEvent) => {
      if (event.type === 'lifecycle') {
        if (event.phase === 'summarized') {
          clearStatus();
          return;
        }
        const label = getLifecycleLabel(event.phase);
        if (label) this.statusLine.start(label);
        return;
      }

      if (event.type === 'reasoning.delta') {
        clearStatus();
        if (!isReasoningStreaming) {
          process.stdout.write(chalk.gray('Thinking> '));
          isReasoningStreaming = true;
        }
        process.stdout.write(chalk.gray(event.delta));
        return;
      }

      if (event.type === 'text.delta') {
        clearStatus();
        endReasoningStream();
        if (!isStreaming) {
          process.stdout.write(chalk.magenta('Agent> '));
          isStreaming = true;
        }
        fullResponse += event.delta;
        process.stdout.write(event.delta);
        return;
      }

      const view = applyStreamEvent(this.tracker, event);
      if (!view) return;

      if (event.type === 'tool.call.start') {
        clearStatus();
        endReasoningStream();
        console.log(chalk.yellow(`\n[tool] ${view.label}${view.detail ? `: ${view.detail}` : ''}`));
        if (view.toolName === 'edit_file' && view.args) {
          const instructions = view.args.instructions;
          if (typeof instructions === 'string' && instructions.trim()) {
            console.log(chalk.gray(`       instructions: ${instructions}`));
          }
        }
        if (isStreaming) process.stdout.write(chalk.magenta('Agent> '));
        return;
      }

      if (event.type === 'tool.call.result') {
        clearStatus();
        endReasoningStream();
        const tag =
          view.status === 'error'
            ? chalk.red('[error]')
            : view.status === 'blocked'
              ? chalk.yellow('[blocked]')
              : chalk.green('[ok]');
        console.log(`\n${tag} ${view.toolName}`);
        if (view.resultPreview) console.log(chalk.white(`   ${view.resultPreview}`));
        if (view.status === 'success' && view.toolName === 'todo_write') {
          console.log(chalk.cyan('\n' + formatTodoTable(this.agent.getCachedTodoSnapshot())));
        }
        if (view.status === 'success' && view.toolName === 'edit_file') {
          this.printEditFrame(view);
        }
        if (view.toolName === 'run_terminal_cmd' && typeof view.resultMeta?.cwd === 'string') {
          console.log(chalk.gray(`   cwd: ${view.resultMeta.cwd}`));
        }
        if (isStreaming) process.stdout.write(chalk.magenta('Agent> '));
      }
    };

    try {
      const result = await this.chatWithAbort(text, {
        onEvent: handleEvent,
        signal: this.chatAbort.signal,
      });

      clearStatus();
      endReasoningStream();

      if (!isStreaming && result.content) {
        console.log(chalk.magenta('Agent> ') + result.content);
      } else if (isStreaming) {
        process.stdout.write('\n');
      }

      if (result.usage?.totalTokens) {
        console.log(chalk.cyan(`  (${result.usage.totalTokens} tokens)`));
      }

      try {
        const snapshot = await this.agent.getTodoSnapshot();
        if (snapshot.totalCount > 0) {
          console.log(chalk.cyan('\n' + formatTodoTable(snapshot)));
        }
      } catch {
        // Non-fatal
      }
    } catch (error: unknown) {
      clearStatus();
      if (error instanceof ChatAbortedError) {
        console.log(chalk.yellow('Yanıt durduruldu.'));
      } else {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`\nHata: ${message}`));
      }
    } finally {
      this.disableChatInterrupt();
      clearStatus();
      this.chatAbort = undefined;
      this.busy = false;
      this.abortRequested = false;
      console.log();
    }
  }
}
