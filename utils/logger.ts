import * as Sentry from "@sentry/react-native";
import { IS_E2E } from "./e2e";

type LogContext = Record<string, any>;
type LogLevel = "INFO" | "WARN" | "ERROR";

const SENTRY_LEVELS = {
  INFO: "info",
  WARN: "warning",
  ERROR: "error",
} as const;

let getUserIdProvider = () => "system";
export function configureLoggerUserId(provider: () => string) {
  getUserIdProvider = provider;
}

// The user's own mistakes (wrong password or code, rate limits, not allowed)
// and being offline aren't bugs, so they aren't reported to Sentry
const isExpectedError = (error: any) => {
  const status = error?.status ?? error?.context?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return true;
  }
  return (
    error?.name === "FunctionsFetchError" ||
    error?.name === "AuthRetryableFetchError" ||
    (error instanceof TypeError &&
      error.message === "Network request failed")
  );
};

class Logger {
  private formatMessage(level: LogLevel, event: string, context?: LogContext) {
    const timestamp = new Date().toISOString();
    const userId = getUserIdProvider();
    const fullContext = {
      ...context,
      userId,
    };
    const contextString = fullContext
      ? ` | Payload: ${JSON.stringify(fullContext)}`
      : "";

    return `[${timestamp}] [${level}] [${event}]${contextString}`;
  }

  // Dev and e2e builds log to the console (logcat, for failed flows). Release
  // builds keep the logs as Sentry breadcrumbs instead, so a report shows the
  // user's last steps.
  private log(level: LogLevel, event: string, context?: LogContext) {
    if (__DEV__ || IS_E2E) {
      const message = this.formatMessage(level, event, context);
      if (level === "INFO") console.log(message);
      else if (level === "WARN") console.warn(message);
      else console.error(message);
      return;
    }

    Sentry.addBreadcrumb({
      category: "app",
      level: SENTRY_LEVELS[level],
      message: event,
      data: { ...context, userId: getUserIdProvider() },
    });
  }

  info(event: string, context?: LogContext) {
    this.log("INFO", event, context);
  }

  warn(event: string, context?: LogContext) {
    this.log("WARN", event, context);
  }

  error(event: string, error: any, context?: LogContext) {
    const mergedContext = {
      ...context,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
    this.log("ERROR", event, mergedContext);

    // A no-op while Sentry is off, as it is in dev builds by default
    if (!isExpectedError(error)) {
      Sentry.captureException(error, { extra: { event, ...context } });
    }
  }
}

export const logger = new Logger();
