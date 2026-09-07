import { randomUUID } from 'crypto';
import chalk from 'chalk';
import {
  loadAllEnv,
  loadSessionPrefs,
  mcpClientManager,
  resolveAgentMode,
  templateRegistry,
  resolveModelProfile,
} from 'poyraz';
import { ChatRepl } from './repl.js';
import { ensureWorkspaceTrustAndLogging } from './workspace-trust.js';

loadAllEnv();

function parseCliArgs(): { templateName?: string; model?: string } {
  const args = process.argv.slice(2);
  let templateName: string | undefined;
  let model: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && args[i + 1]) {
      model = args[i + 1];
      i++;
    } else if (!args[i].startsWith('-')) {
      templateName = args[i];
    }
  }

  return { templateName, model };
}

function resolveTemplateName(cliName?: string): { name: string; source: 'cli' | 'env' | 'default' } {
  if (cliName) return { name: cliName, source: 'cli' };

  const envName = process.env.TEMPLATE_NAME || process.env.AGENT_NAME;
  if (envName) return { name: envName, source: 'env' };

  const templates = templateRegistry.list();
  if (templates.length === 0) {
    throw new Error(
      'No templates found. Bundled templates could not be synced to ~/.poyraz/data/configs/templates.'
    );
  }

  const sorted = [...templates].sort((a, b) => {
    const orderA = a.order ?? Number.NEGATIVE_INFINITY;
    const orderB = b.order ?? Number.NEGATIVE_INFINITY;
    if (orderA !== orderB) return orderB - orderA;
    return b.name.localeCompare(a.name);
  });

  return { name: sorted[0].name, source: 'default' };
}

async function main() {
  try {
    await ensureWorkspaceTrustAndLogging();

    const { templateName: cliTemplate, model: cliModel } = parseCliArgs();
    const { name: templateName, source } = resolveTemplateName(cliTemplate);
    const modelProfile = await resolveModelProfile({ cliModel });

    console.log(chalk.cyan(`[INFO] Poyraz CLI`));
    const sourceLabel =
      source === 'cli' ? '(via CLI)' : source === 'env' ? '(via ENV)' : '(default from library)';
    console.log(chalk.cyan(`[INFO] Template: ${chalk.bold(templateName)} ${sourceLabel}`));
    console.log(
      chalk.cyan(
        `[INFO] Model: ${chalk.bold(modelProfile.model)} (${modelProfile.provider})\n`
      )
    );

    const agent = templateRegistry.buildAgent(templateName, modelProfile);
    const prefs = loadSessionPrefs();
    if (prefs.lastMode) {
      const mode = resolveAgentMode(prefs.lastMode);
      if (mode) agent.setMode(mode);
    }
    agent.setSessionId(randomUUID());
    agent.setChatLogSource('cli');
    await agent.init();

    const mcpTools = await mcpClientManager.connectAll();
    if (Object.keys(mcpTools).length > 0) {
      agent.mergeExternalTools(mcpTools);
      const connected = mcpClientManager.listStates().filter((s) => s.status === 'connected');
      console.log(
        chalk.cyan(
          `[INFO] MCP: ${connected.length} sunucu, ${Object.keys(mcpTools).length} araç bağlandı\n`
        )
      );
    }

    const repl = new ChatRepl(agent);
    await repl.start();
  } catch (error: any) {
    console.error(chalk.red('Initialization failed:'), error.message);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red('Initialization failed:'), message);
  process.exit(1);
});
