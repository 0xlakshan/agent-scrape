export class ScrapeError extends Error {
  constructor(message: string, public code: string, public cause?: Error) {
    super(message);
    this.name = 'ScrapeError';
  }
}

export class EngineError extends ScrapeError {
  constructor(message: string, cause?: Error) {
    super(message, 'ENGINE_ERROR', cause);
    this.name = 'EngineError';
  }
}

export class TransformError extends ScrapeError {
  constructor(message: string, cause?: Error) {
    super(message, 'TRANSFORM_ERROR', cause);
    this.name = 'TransformError';
  }
}

export class ConfigError extends ScrapeError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}
