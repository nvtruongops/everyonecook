/**
 * Structured Logging Utilities
 *
 * Provides structured JSON logging with correlation IDs and context.
 * Follows CloudWatch Logs best practices.
 *
 * @module utils/logger
 */

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  correlationId: string;
  service: string;
  operation?: string;
  duration?: number;
  userId?: string;
  metadata?: Record<string, any>;
  message: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Logger class for structured logging
 */
export class Logger {
  private serviceName: string;
  private correlationId: string;

  constructor(serviceName: string, correlationId: string) {
    this.serviceName = serviceName;
    this.correlationId = correlationId;
  }

  /**
   * Logs an info message
   */
  info(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * Logs a warning message
   */
  warn(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  /**
   * Logs an error message
   */
  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, {
      ...metadata,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    });
  }

  /**
   * Logs a debug message
   */
  debug(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      correlationId: this.correlationId,
      service: this.serviceName,
      message,
      ...metadata,
    };

    // Output as JSON for CloudWatch Logs
    console.log(JSON.stringify(logEntry));
  }
}

/**
 * Creates a logger instance
 *
 * @param serviceName - Name of the service
 * @param correlationId - Correlation ID for request tracing
 * @returns Logger instance
 */
export const createLogger = (serviceName: string, correlationId: string): Logger => {
  return new Logger(serviceName, correlationId);
};
