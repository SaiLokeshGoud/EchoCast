/**
 * Structured logger for EchoCast server
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

const ANSI_COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString().substring(11, 23); // HH:mm:ss.sss
}

class Logger {
  private context: string;

  constructor(context: string = 'EchoCast') {
    this.context = context;
  }

  public forContext(context: string): Logger {
    return new Logger(context);
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
  }

  private log(level: LogLevel, color: string, message: string, meta?: unknown) {
    if (!this.shouldLog(level)) return;

    const time = `${ANSI_COLORS.gray}${formatTimestamp()}${ANSI_COLORS.reset}`;
    const levelStr = `${color}[${level.toUpperCase().padEnd(5)}]${ANSI_COLORS.reset}`;
    const tag = `${ANSI_COLORS.magenta}[${this.context}]${ANSI_COLORS.reset}`;

    if (meta !== undefined) {
      if (meta instanceof Error) {
        console.log(`${time} ${levelStr} ${tag} ${message}\n${ANSI_COLORS.red}${meta.stack || meta.message}${ANSI_COLORS.reset}`);
      } else {
        const metaStr = typeof meta === 'object' ? JSON.stringify(meta) : String(meta);
        console.log(`${time} ${levelStr} ${tag} ${message} ${ANSI_COLORS.gray}${metaStr}${ANSI_COLORS.reset}`);
      }
    } else {
      console.log(`${time} ${levelStr} ${tag} ${message}`);
    }
  }

  debug(message: string, meta?: unknown) {
    this.log('debug', ANSI_COLORS.cyan, message, meta);
  }

  info(message: string, meta?: unknown) {
    this.log('info', ANSI_COLORS.green, message, meta);
  }

  warn(message: string, meta?: unknown) {
    this.log('warn', ANSI_COLORS.yellow, message, meta);
  }

  error(message: string, meta?: unknown) {
    this.log('error', ANSI_COLORS.red, message, meta);
  }
}

export const logger = new Logger('Server');
