import * as readline from 'readline';
import chalk from 'chalk';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class ReplStatusLine {
  private interval?: ReturnType<typeof setInterval>;
  private label = '';
  private frame = 0;
  private visible = false;

  start(label: string): void {
    this.stop();
    this.label = label;
    this.frame = 0;
    this.render();
    this.interval = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER_FRAMES.length;
      this.render();
    }, 90);
  }

  stop(): void {
    if (this.interval !== undefined) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    if (this.visible) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      this.visible = false;
    }
  }

  private render(): void {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(
      chalk.cyan(`  ${SPINNER_FRAMES[this.frame]} ${this.label}...`)
    );
    this.visible = true;
  }
}
