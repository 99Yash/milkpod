// Minimal ambient types for the `cloudflare:workers` runtime module.
//
// `apps/server/src/worker.ts` + `workflows.ts` are bundled for workerd
// (via Alchemy), where `cloudflare:workers` is provided by the runtime.
// These declarations exist only so `tsc -b` can check the edge entry
// without adding `@cloudflare/workers-types` as a dependency. Shapes
// mirror `@cloudflare/workers-types@5.20260907.1` (subset actually used).

declare module 'cloudflare:workers' {
  export type WorkflowDurationLabel =
    | 'second'
    | 'minute'
    | 'hour'
    | 'day'
    | 'week'
    | 'month'
    | 'year';
  export type WorkflowSleepDuration =
    | `${number} ${WorkflowDurationLabel}${'s' | ''}`
    | number;
  export type WorkflowBackoff = 'constant' | 'linear' | 'exponential';

  export interface WorkflowStepConfig {
    retries?: {
      limit: number;
      delay: WorkflowSleepDuration | number;
      backoff?: WorkflowBackoff;
    };
    timeout?: WorkflowSleepDuration | number;
  }

  export interface WorkflowEvent<T = unknown> {
    payload: Readonly<T>;
    timestamp: Date;
    instanceId: string;
    workflowName: string;
  }

  export abstract class WorkflowStep {
    do<T>(
      name: string,
      config: WorkflowStepConfig,
      callback: () => Promise<T>,
    ): Promise<T>;
    do<T>(name: string, callback: () => Promise<T>): Promise<T>;
    sleep(name: string, duration: WorkflowSleepDuration): Promise<void>;
    sleepUntil(name: string, timestamp: Date | number): Promise<void>;
  }

  export abstract class WorkflowEntrypoint<Env = unknown, Params = unknown> {
    protected ctx: ExecutionContext;
    protected env: Env;
    constructor(ctx: ExecutionContext, env: Env);
    run(
      event: Readonly<WorkflowEvent<Params>>,
      step: WorkflowStep,
    ): Promise<unknown>;
  }
}
