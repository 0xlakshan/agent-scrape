import { ContentProcessor, PluginRegistry, PluginConfig } from './types';

export class PluginManager {
  private registry: PluginRegistry = {};

  register(processor: ContentProcessor, config: PluginConfig = { enabled: true }): void {
    this.registry[processor.name] = { processor, config };
  }

  unregister(name: string): void {
    delete this.registry[name];
  }

  getProcessor(name: string): ContentProcessor | undefined {
    const plugin = this.registry[name];
    return plugin?.config.enabled ? plugin.processor : undefined;
  }

  getEnabledProcessors(): ContentProcessor[] {
    return Object.values(this.registry)
      .filter(plugin => plugin.config.enabled)
      .map(plugin => plugin.processor);
  }

  isEnabled(name: string): boolean {
    return this.registry[name]?.config.enabled ?? false;
  }

  configure(name: string, config: PluginConfig): void {
    if (this.registry[name]) {
      this.registry[name].config = config;
    }
  }

  list(): string[] {
    return Object.keys(this.registry);
  }
}
