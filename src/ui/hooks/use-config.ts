import { useAppContext } from '../context/app-context.js';
import type { ResolvedConfig } from '../../core/types.js';

export function useConfig(): ResolvedConfig {
  const { config } = useAppContext();
  return config;
}
