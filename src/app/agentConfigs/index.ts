import { chatSupervisorScenario } from './chatSupervisor';

import type { RealtimeAgent } from '@openai/agents/realtime';

export const allAgentSets: Record<string, RealtimeAgent[]> = {
  chatSupervisor: chatSupervisorScenario,
};

export const defaultAgentSetKey = 'chatSupervisor';
