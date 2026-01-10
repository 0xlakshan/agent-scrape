import { describe, it, expect } from 'vitest';
import { ScrapeError, EngineError, TransformError, ConfigError } from './errors';

describe('Error Classes', () => {
  it('creates ScrapeError with code and cause', () => {
    const cause = new Error('Original error');
    const error = new ScrapeError('Test message', 'TEST_CODE', cause);
    
    expect(error.name).toBe('ScrapeError');
    expect(error.message).toBe('Test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.cause).toBe(cause);
  });

  it('creates EngineError with ENGINE_ERROR code', () => {
    const cause = new Error('Engine failed');
    const error = new EngineError('Engine error message', cause);
    
    expect(error.name).toBe('EngineError');
    expect(error.code).toBe('ENGINE_ERROR');
    expect(error.cause).toBe(cause);
  });

  it('creates TransformError with TRANSFORM_ERROR code', () => {
    const error = new TransformError('Transform failed');
    
    expect(error.name).toBe('TransformError');
    expect(error.code).toBe('TRANSFORM_ERROR');
  });

  it('creates ConfigError with CONFIG_ERROR code', () => {
    const error = new ConfigError('Invalid config');
    
    expect(error.name).toBe('ConfigError');
    expect(error.code).toBe('CONFIG_ERROR');
  });
});
