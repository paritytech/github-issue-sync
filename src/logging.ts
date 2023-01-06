import { inspect } from "util";

enum LoggingLevel {
  debug,
  info,
  warn,
  error,
}
type LoggingLevels = keyof typeof LoggingLevel;

export type LogFormat = "json" | "none";

const setFormattedKeyValue = (source: any, output: any, key: any, previousObjects: unknown[]) => {
  if (previousObjects.indexOf(source[key]) !== -1) {
    return "[Circular]";
  }

  const value = formatValue(source[key], previousObjects);
  if (value === undefined) {
    return;
  }

  output[key] = value;
};

const formatValue = (value: unknown, previousObjects: unknown[] = []) => {
  if (value === undefined) {
    return value;
  }

  switch (typeof value) {
    case "boolean":
    case "number":
    case "string": {
      return value;
    }
    case "symbol": {
      return value.toString();
    }
    case "object": {
      if (value === null) {
        return;
      }

      previousObjects = previousObjects.concat([value]);

      const isArray = Array.isArray(value);
      const isIterable = !isArray && Symbol.iterator in value;
      const objAsArray = isArray ? value : isIterable ? Array.from(value as Iterable<unknown>) : undefined;

      if (objAsArray === undefined && !(value instanceof Error)) {
        const asString =
          typeof value.toString === "function" && value.toString.length === 0 ? value.toString() : undefined;
        if (typeof asString === "string" && asString !== "[object Object]") {
          return asString;
        }
      }

      const { container, output } = (() => {
        if (isIterable) {
          const iteratorContainer = { type: value.constructor.name, items: [] };
          return { container: iteratorContainer, output: iteratorContainer.items };
        }

        const arrayOutput = objAsArray === undefined ? {} : [];
        return { container: arrayOutput, output: arrayOutput };
      })();

      const sourceObj = objAsArray ?? value;
      for (const key of Object.getOwnPropertyNames(sourceObj)) {
        setFormattedKeyValue(sourceObj, output, key, previousObjects);
      }

      if (Object.keys(output).length > 0) {
        return container;
      }
    }
  }
};

export class Logger {
  constructor(
    public options: {
      name: string;
      logFormat: LogFormat;
      minLogLevel: LoggingLevels;
      context?: Record<string, any>;
    },
  ) {}

  child(context: Record<string, any>) {
    return new Logger({ ...this.options, context: { ...this.options.context, ...context } });
  }

  private log(level: LoggingLevels, item: any, description?: string) {
    if (LoggingLevel[level] < LoggingLevel[this.options.minLogLevel]) {
      return;
    }

    switch (this.options.logFormat) {
      case "json": {
        console.log(
          JSON.stringify({ level, name: this.options.name, msg: item, description, context: this.options.context }),
        );
        break;
      }
      default: {
        const tag = `${level.toUpperCase()} (${this.options.name}):`;
        const fn = item instanceof Error ? console.error : console.log;
        fn(
          tag,
          ...[
            ...(description ? [description] : []),
            ...(this.options.context === undefined
              ? []
              : [inspect(formatValue(this.options.context), { depth: null, colors: true })]),
            inspect(formatValue(item), { depth: null, colors: true }),
          ],
        );
        break;
      }
    }
  }

  private loggerCallback(level: LoggingLevels) {
    return (item: any, message?: string) => this.log(level, item, message);
  }
  debug = this.loggerCallback("debug");
  info = this.loggerCallback("info");
  warn = this.loggerCallback("warn");
  error = this.loggerCallback("error");
}
