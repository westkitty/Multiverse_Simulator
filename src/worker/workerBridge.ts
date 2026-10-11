import { DEFAULT_RESOURCE_BUDGET } from '../core/contracts';
import { SimulationKernel } from '../core/kernel';
import { WorkerRequestMessage, WorkerResponseMessage } from './simulation.worker';

export interface WorkerDiagnosticsState {
  mode: 'web_worker' | 'main_thread_fallback';
  alive: boolean;
  queueDepth: number;
  maxQueueDepth: number;
  droppedRequestsCount: number;
  crashRecoveryCount: number;
  lastError: string | null;
}

export class BoundedWorkerBridge {
  private worker: Worker | null = null;
  private maxQueueDepth: number;
  private pendingRequests: Map<
    string,
    {
      resolve: (resp: WorkerResponseMessage) => void;
      reject: (err: Error) => void;
    }
  > = new Map();
  private reqCounter = 1;
  private droppedRequestsCount = 0;
  private crashRecoveryCount = 0;
  private lastError: string | null = null;
  private mode: 'web_worker' | 'main_thread_fallback' = 'main_thread_fallback';

  constructor(maxQueueDepth = DEFAULT_RESOURCE_BUDGET.maxWorkerQueueDepth) {
    this.maxQueueDepth = Math.max(4, maxQueueDepth);
    this.initializeWorkerIfSupported();
  }

  private initializeWorkerIfSupported(): void {
    try {
      if (typeof Worker !== 'undefined') {
        const w = new Worker(
          new URL('./simulation.worker.ts', import.meta.url),
          { type: 'module' },
        );
        w.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
          const data = event.data;
          if (!data || !data.id) return;
          const handler = this.pendingRequests.get(data.id);
          if (handler) {
            this.pendingRequests.delete(data.id);
            handler.resolve(data);
          }
        };
        w.onerror = (err) => {
          this.handleWorkerCrash(
            err.message || 'Web Worker runtime exception encountered',
          );
        };
        this.worker = w;
        this.mode = 'web_worker';
      } else {
        this.mode = 'main_thread_fallback';
      }
    } catch {
      this.mode = 'main_thread_fallback';
      this.worker = null;
    }
  }

  getQueueDepth(): number {
    return this.pendingRequests.size;
  }

  getDiagnostics(): WorkerDiagnosticsState {
    return {
      mode: this.mode,
      alive: this.mode === 'web_worker' ? this.worker !== null : true,
      queueDepth: this.pendingRequests.size,
      maxQueueDepth: this.maxQueueDepth,
      droppedRequestsCount: this.droppedRequestsCount,
      crashRecoveryCount: this.crashRecoveryCount,
      lastError: this.lastError,
    };
  }

  /**
   * Simulates or handles an unexpected worker crash, rejecting in-flight requests,
   * terminating the broken worker, and recovering cleanly without crashing the app.
   */
  handleWorkerCrash(reason = 'Simulated Web Worker Crash'): void {
    this.lastError = reason;
    this.crashRecoveryCount += 1;
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // Ignore terminate errors
      }
      this.worker = null;
    }
    for (const [id, pending] of this.pendingRequests.entries()) {
      this.pendingRequests.delete(id);
      pending.reject(new Error(`Worker crashed during request ${id}: ${reason}`));
    }
    // Re-initialize worker or fall back cleanly
    this.initializeWorkerIfSupported();
  }

  async stepKernelWithWorkerOrFallback(
    kernel: SimulationKernel<any, any>,
    steps: number,
    maxBudgetMs = DEFAULT_RESOURCE_BUDGET.maxFastForwardStepBudgetMs,
  ): Promise<{
    stepsExecuted: number;
    usedWorker: boolean;
    droppedByBackpressure: boolean;
  }> {
    if (this.pendingRequests.size >= this.maxQueueDepth) {
      this.droppedRequestsCount += 1;
      return {
        stepsExecuted: 0,
        usedWorker: false,
        droppedByBackpressure: true,
      };
    }

    if (this.mode === 'web_worker' && this.worker && steps >= 5) {
      try {
        const initId = `wreq-${this.reqCounter++}`;
        await this.sendRaw({
          id: initId,
          type: 'INIT_RUN',
          record: kernel.exportRunRecord(),
        });

        const stepId = `wreq-${this.reqCounter++}`;
        const resp = await this.sendRaw({
          id: stepId,
          type: 'STEP_BATCH',
          steps,
          maxBudgetMs,
        });

        if (resp.ok && resp.type === 'STEP_BATCH_RESULT') {
          const restored = SimulationKernel.fromRunRecord(resp.record, kernel.plugin);
          Object.assign(kernel, restored);
          return {
            stepsExecuted: resp.stepsExecuted,
            usedWorker: true,
            droppedByBackpressure: false,
          };
        }
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
      }
    }

    // Deterministic synchronous execution on authoritative kernel
    const res = kernel.stepMany(steps, maxBudgetMs);
    return {
      stepsExecuted: res.stepsExecuted,
      usedWorker: false,
      droppedByBackpressure: false,
    };
  }

  private sendRaw(msg: WorkerRequestMessage): Promise<WorkerResponseMessage> {
    if (!this.worker) {
      return Promise.reject(new Error('Worker not available'));
    }
    if (this.pendingRequests.size >= this.maxQueueDepth) {
      this.droppedRequestsCount += 1;
      return Promise.reject(
        new Error(`Worker queue depth limit (${this.maxQueueDepth}) reached`),
      );
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(msg.id)) {
          this.pendingRequests.delete(msg.id);
          reject(new Error(`Worker request ${msg.id} timed out`));
        }
      }, 4000);

      this.pendingRequests.set(msg.id, {
        resolve: (resp) => {
          clearTimeout(timeout);
          resolve(resp);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.worker!.postMessage(msg);
    });
  }

  dispose(): void {
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error('Worker bridge disposed'));
    }
    this.pendingRequests.clear();
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }
  }
}
