import {
  createPrompt,
  isBackspaceKey,
  isEnterKey,
  isTabKey,
  makeTheme,
  useEffect,
  useKeypress,
  usePrefix,
  useRef,
  useState,
  type KeypressEvent,
  type Status,
  type Theme,
} from '@inquirer/core';
import type { InquirerReadline } from '@inquirer/type';
import type { PartialDeep } from '@inquirer/type';
import { isModeCycleKey } from './repl-terminal.js';

type ReadlineWithCursor = InquirerReadline & { cursor?: number };

type KeyWithSequence = KeypressEvent & { sequence?: string };

type InputTheme = {
  validationFailureMode: 'keep' | 'clear';
};

const inputTheme: InputTheme = {
  validationFailureMode: 'keep',
};

// Bracketed paste lets the terminal wrap pasted text in start/end markers so a
// multi-line paste is not misread as several separate Enter submissions.
const ENABLE_BRACKETED_PASTE = '\x1b[?2004h';
const DISABLE_BRACKETED_PASTE = '\x1b[?2004l';
const PASTE_START_KEY = 'paste-start';
const PASTE_END_KEY = 'paste-end';

type PasteState = {
  active: boolean;
  buffer: string;
  preLine: string;
  preCursor: number;
  lastWasReturn: boolean;
};

function createPasteState(): PasteState {
  return { active: false, buffer: '', preLine: '', preCursor: 0, lastWasReturn: false };
}

// Rebuilds pasted characters into text while collapsing CR, LF and CRLF (Windows)
// line breaks into a single newline so all lines survive intact.
function appendPastedKey(state: PasteState, key: KeyWithSequence): void {
  if (key.name === 'return') {
    state.buffer += '\n';
    state.lastWasReturn = true;
    return;
  }
  if (key.name === 'enter') {
    if (state.lastWasReturn) {
      state.lastWasReturn = false;
      return;
    }
    state.buffer += '\n';
    return;
  }
  state.lastWasReturn = false;
  state.buffer += key.name === 'tab' ? '\t' : (key.sequence ?? '');
}

export type ReplMainInputConfig = {
  message: string;
  default?: string;
  prefill?: 'tab' | 'editable';
  required?: boolean;
  transformer?: (value: string, meta: { isFinal: boolean }) => string;
  validate?: (value: string) => boolean | string | Promise<boolean | string>;
  theme?: PartialDeep<Theme<InputTheme>>;
  pattern?: RegExp;
  patternError?: string;
  onModeCycle: (draft: string) => string;
};

export default createPrompt<string, ReplMainInputConfig>((config, done) => {
  const { prefill = 'tab' } = config;
  const theme = makeTheme<InputTheme>(inputTheme, config.theme);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState(config.message);
  const [defaultValue, setDefaultValue] = useState(String(config.default ?? ''));
  const [errorMsg, setError] = useState<string>();
  const [value, setValue] = useState('');
  const pasteState = useRef<PasteState>(createPasteState());

  const prefix = usePrefix({ status, theme });

  function validate(answer: string): boolean | string | Promise<boolean | string> {
    const { required, pattern, patternError = 'Invalid input' } = config;
    if (required && !answer) {
      return 'You must provide a value';
    }
    if (pattern && !pattern.test(answer)) {
      return patternError;
    }
    if (typeof config.validate === 'function') {
      return config.validate(answer);
    }
    return true;
  }

  useKeypress((key, rl) => {
    if (status !== 'idle') return;

    const paste = pasteState.current;

    if (key.name === PASTE_START_KEY) {
      const rlLine = rl as ReadlineWithCursor;
      paste.active = true;
      paste.buffer = '';
      paste.preLine = rlLine.line ?? '';
      paste.preCursor = rlLine.cursor ?? paste.preLine.length;
      paste.lastWasReturn = false;
      return;
    }

    if (paste.active) {
      if (key.name === PASTE_END_KEY) {
        const head = paste.preLine.slice(0, paste.preCursor);
        const tail = paste.preLine.slice(paste.preCursor);
        const nextValue = head + paste.buffer + tail;
        const rlLine = rl as ReadlineWithCursor;
        rlLine.line = nextValue;
        rlLine.cursor = head.length + paste.buffer.length;
        pasteState.current = createPasteState();
        setValue(nextValue);
        setDefaultValue('');
        setError(undefined);
        return;
      }
      appendPastedKey(paste, key as KeyWithSequence);
      return;
    }

    if (key.ctrl && key.name === 'c') {
      rl.clearLine(0);
      rl.write('');
      const rlLine = rl as ReadlineWithCursor;
      rlLine.line = '';
      rlLine.cursor = 0;
      setValue('');
      setDefaultValue('');
      setError(undefined);
      return;
    }

    if (isModeCycleKey(key)) {
      const draft = rl.line.replace(/\t/g, '');
      const rlLine = rl as ReadlineWithCursor;
      rlLine.line = draft;
      rlLine.cursor = draft.length;
      setValue(draft);
      setError(undefined);
      setMessage(config.onModeCycle(draft));
      return;
    }

    if (isEnterKey(key)) {
      const answer = value || defaultValue;
      setStatus('loading');
      void Promise.resolve(validate(answer)).then((isValid) => {
        if (isValid === true) {
          setValue(answer);
          setStatus('done');
          done(answer);
          return;
        }
        if (theme.validationFailureMode === 'clear') {
          setValue('');
        } else {
          rl.write(value);
        }
        setError(typeof isValid === 'string' ? isValid : 'Invalid input');
        setStatus('idle');
      });
      return;
    }

    if (isBackspaceKey(key) && !value) {
      setDefaultValue('');
    } else if (isTabKey(key) && !value) {
      setDefaultValue('');
      rl.clearLine(0);
      rl.write(defaultValue);
      setValue(defaultValue);
    } else {
      setValue(rl.line);
      setError(undefined);
    }
  });

  useEffect((rl) => {
    if (prefill === 'editable' && defaultValue) {
      rl.write(defaultValue);
      setValue(defaultValue);
    }
  }, []);

  useEffect(() => {
    const output = process.stdout;
    if (!output.isTTY) return;
    output.write(ENABLE_BRACKETED_PASTE);
    return () => {
      output.write(DISABLE_BRACKETED_PASTE);
    };
  }, []);

  const styledMessage = theme.style.message(message, status);
  let formattedValue = value;
  if (typeof config.transformer === 'function') {
    formattedValue = config.transformer(value, { isFinal: status === 'done' });
  } else if (status === 'done') {
    formattedValue = theme.style.answer(value);
  }

  let defaultStr: string | undefined;
  if (defaultValue && status !== 'done' && !value) {
    defaultStr = theme.style.defaultAnswer(defaultValue);
  }

  let error = '';
  if (errorMsg) {
    error = theme.style.error(errorMsg);
  }

  return [[prefix, styledMessage, defaultStr, formattedValue].filter((v) => v !== undefined).join(' '), error];
});
