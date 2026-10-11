import { globalPluginRegistry } from '../core/pluginRegistry';
import { SerializedRunRecord, SimulationKernel } from '../core/kernel';
import { registerBuiltInWorlds } from '../worlds';

registerBuiltInWorlds();

export type WorkerRequestMessage =
  | {
      id: string;
      type: 'INIT_RUN';
      record: SerializedRunRecord;
    }
  | {
      id: string;
      type: 'STEP_BATCH';
      steps: number;
      maxBudgetMs: number;
    }
  | {
      id: string;
      type: 'ENQUEUE_COMMAND';
      command: {
        tick?: number;
        type: string;
        label: string;
        payload: Record<string, unknown>;
      };
    }
  | {
      id: string;
      type: 'EXPORT_RECORD';
    };

export type WorkerResponseMessage =
  | {
      id: string;
      ok: true;
      type: 'STEP_BATCH_RESULT';
      tick: number;
      stepsExecuted: number;
      stateHash: string;
      metrics: Record<string, number>;
      stepDurationMs: number;
      record: SerializedRunRecord;
    }
  | {
      id: string;
      ok: true;
      type: 'ACK';
      record: SerializedRunRecord;
    }
  | {
      id: string;
      ok: false;
      error: string;
    };

let activeWorkerKernel: SimulationKernel<any, any> | null = null;

if (typeof self !== 'undefined' && typeof self.onmessage !== 'undefined') {
  self.onmessage = (event: MessageEvent<WorkerRequestMessage>) => {
    const msg = event.data;
    if (!msg || typeof msg.id !== 'string') return;

    try {
      switch (msg.type) {
        case 'INIT_RUN': {
          const plugin = globalPluginRegistry.get(msg.record.worldId);
          activeWorkerKernel = SimulationKernel.fromRunRecord(msg.record, plugin);
          const resp: WorkerResponseMessage = {
            id: msg.id,
            ok: true,
            type: 'ACK',
            record: activeWorkerKernel.exportRunRecord(),
          };
          self.postMessage(resp);
          break;
        }

        case 'STEP_BATCH': {
          if (!activeWorkerKernel) {
            throw new Error('Worker kernel is not initialized');
          }
          const t0 = performance.now();
          const res = activeWorkerKernel.stepMany(msg.steps, msg.maxBudgetMs);
          const elapsed = performance.now() - t0;
          const resp: WorkerResponseMessage = {
            id: msg.id,
            ok: true,
            type: 'STEP_BATCH_RESULT',
            tick: res.tick,
            stepsExecuted: res.stepsExecuted,
            stateHash: res.stateHash,
            metrics: activeWorkerKernel.getLatestMetrics(),
            stepDurationMs: elapsed / Math.max(1, res.stepsExecuted),
            record: activeWorkerKernel.exportRunRecord(),
          };
          self.postMessage(resp);
          break;
        }

        case 'ENQUEUE_COMMAND': {
          if (!activeWorkerKernel) {
            throw new Error('Worker kernel is not initialized');
          }
          activeWorkerKernel.enqueueCommand(msg.command);
          activeWorkerKernel.flushCurrentTickCommands();
          const resp: WorkerResponseMessage = {
            id: msg.id,
            ok: true,
            type: 'ACK',
            record: activeWorkerKernel.exportRunRecord(),
          };
          self.postMessage(resp);
          break;
        }

        case 'EXPORT_RECORD': {
          if (!activeWorkerKernel) {
            throw new Error('Worker kernel is not initialized');
          }
          const resp: WorkerResponseMessage = {
            id: msg.id,
            ok: true,
            type: 'ACK',
            record: activeWorkerKernel.exportRunRecord(),
          };
          self.postMessage(resp);
          break;
        }
      }
    } catch (err) {
      const resp: WorkerResponseMessage = {
        id: msg.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
      self.postMessage(resp);
    }
  };
}
