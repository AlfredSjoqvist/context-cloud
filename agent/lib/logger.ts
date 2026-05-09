export type EventLevel = "info" | "warn" | "finding" | "action";

export interface EventPayload {
  level: EventLevel;
  message: string;
  cycleNumber?: number;
  metadata?: Record<string, unknown>;
}

export type EventSink = (payload: EventPayload) => Promise<void>;

export interface LoggerOptions {
  sink: EventSink;
  cycleNumber?: number;
}

export class Logger {
  constructor(private readonly opts: LoggerOptions) {}

  async info(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.emit("info", message, metadata);
  }

  async warn(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.emit("warn", message, metadata);
  }

  async finding(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.emit("finding", message, metadata);
  }

  async action(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.emit("action", message, metadata);
  }

  private async emit(
    level: EventLevel,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.opts.sink({
        level,
        message,
        cycleNumber: this.opts.cycleNumber,
        metadata,
      });
    } catch (err) {
      // Never let logging crash the agent. Mirror to stderr for visibility.
      // eslint-disable-next-line no-console
      console.error("[logger] sink failed:", err, { level, message });
    }
  }
}
