/**
 * CircuitBreaker.ts — API 429 Quota Recovery Circuit Breaker with Exponential Backoff,
 * Jitter, Offline Request Queuing, and Finite State Machine transitions.
 */

import {
  CircuitBreakerState,
} from './PersistenceTypes.ts';
import type {
  CircuitBreakerOptions,
  QueuedApiRequest,
} from './PersistenceTypes.ts';

export class CircuitBreakerOpenError extends Error {
  public retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class APIQuotaCircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private consecutiveFailures = 0;
  private consecutive429Count = 0;
  private nextAttemptTime = 0;
  private currentBackoffMs = 0;
  private offlineQueue: QueuedApiRequest[] = [];
  private isDraining = false;
  private retryTimer: NodeJS.Timeout | number | null = null;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly jitterRatio: number;
  private readonly maxQueueSize: number;
  private readonly onStateChange?: (from: CircuitBreakerState, to: CircuitBreakerState) => void;
  private readonly onQuotaError?: (error: unknown) => void;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 5000;
    this.initialBackoffMs = options.initialBackoffMs ?? 1000;
    this.maxBackoffMs = options.maxBackoffMs ?? 32000;
    this.jitterRatio = Math.max(0, Math.min(1, options.jitterRatio ?? 0.2));
    this.maxQueueSize = options.maxQueueSize ?? 100;
    this.onStateChange = options.onStateChange;
    this.onQuotaError = options.onQuotaError;
  }

  public getState(): CircuitBreakerState {
    this.checkAutoTransition();
    return this.state;
  }

  public isOpen(): boolean {
    return this.getState() === CircuitBreakerState.OPEN;
  }

  public isClosed(): boolean {
    return this.getState() === CircuitBreakerState.CLOSED;
  }

  public isHalfOpen(): boolean {
    return this.getState() === CircuitBreakerState.HALF_OPEN;
  }

  public getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  public getConsecutive429s(): number {
    return this.consecutive429Count;
  }

  public getQueueLength(): number {
    return this.offlineQueue.length;
  }

  public getBackoffMs(): number {
    return this.currentBackoffMs;
  }

  public getNextAttemptTime(): number {
    return this.nextAttemptTime;
  }

  private setState(newState: CircuitBreakerState): void {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      if (this.onStateChange) {
        this.onStateChange(oldState, newState);
      }
    }
  }

  private checkAutoTransition(): void {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() >= this.nextAttemptTime) {
        this.setState(CircuitBreakerState.HALF_OPEN);
      }
    }
  }

  /**
   * Calculates exponential backoff with uniform jitter and optional Retry-After header.
   */
  public calculateBackoffDelay(retryAfterHeader?: string | number): number {
    let delay: number;

    if (retryAfterHeader !== undefined) {
      const parsedSeconds = typeof retryAfterHeader === 'number'
        ? retryAfterHeader
        : parseFloat(retryAfterHeader);
      if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
        delay = parsedSeconds * 1000;
      } else {
        // Try parsing HTTP date if string
        const parsedDate = Date.parse(String(retryAfterHeader));
        if (!isNaN(parsedDate) && parsedDate > Date.now()) {
          delay = parsedDate - Date.now();
        } else {
          const exponent = Math.max(0, Math.min(this.consecutive429Count - 1, 8));
          delay = this.initialBackoffMs * Math.pow(2, exponent);
        }
      }
    } else {
      const exponent = Math.max(0, Math.min(this.consecutive429Count - 1, 8));
      delay = this.initialBackoffMs * Math.pow(2, exponent);
    }

    delay = Math.min(this.maxBackoffMs, delay);

    // Apply symmetric jitter: delay +/- (delay * jitterRatio * random[-1, 1])
    const jitterMagnitude = delay * this.jitterRatio;
    const jitter = (Math.random() * 2 - 1) * jitterMagnitude;
    const finalDelay = Math.max(50, Math.round(delay + jitter));

    return finalDelay;
  }

  /**
   * Immediate handling of an HTTP 429 Quota Exceeded error.
   * Optionally triggers an emergency state save function before scheduling backoff.
   */
  public handleQuotaError(saveFn?: () => void, error?: unknown): number {
    this.consecutive429Count++;
    this.consecutiveFailures++;

    if (this.onQuotaError) {
      this.onQuotaError(error);
    }

    if (saveFn) {
      try {
        saveFn();
      } catch (err) {
        console.error('CircuitBreaker: Error executing saveFn during 429 quota handling', err);
      }
    }

    // Inspect error for Retry-After header
    let retryAfterHeader: string | number | undefined;
    if (error && typeof error === 'object') {
      const errObj = error as Record<string, unknown>;
      const headers = errObj.headers as Record<string, string> | undefined;
      if (headers) {
        retryAfterHeader = headers['retry-after'] || headers['Retry-After'];
      }
      if (!retryAfterHeader && 'retryAfter' in errObj) {
        retryAfterHeader = errObj.retryAfter as string | number;
      }
    }

    const backoff = this.calculateBackoffDelay(retryAfterHeader);
    this.currentBackoffMs = backoff;
    this.nextAttemptTime = Date.now() + backoff;
    this.setState(CircuitBreakerState.OPEN);

    return backoff;
  }

  public recordSuccess(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer as NodeJS.Timeout);
      this.retryTimer = null;
    }
    this.consecutiveFailures = 0;
    this.consecutive429Count = 0;
    this.currentBackoffMs = 0;
    this.nextAttemptTime = 0;
    this.setState(CircuitBreakerState.CLOSED);

    // Drain queued offline requests
    if (this.offlineQueue.length > 0 && !this.isDraining) {
      void this.drainQueue();
    }
  }

  public recordFailure(error?: unknown): void {
    const is429 = this.isQuotaError(error);

    if (is429) {
      this.handleQuotaError(undefined, error);
      return;
    }

    this.consecutiveFailures++;
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Immediate return to OPEN upon trial failure
      const backoff = this.calculateBackoffDelay();
      this.currentBackoffMs = backoff;
      this.nextAttemptTime = Date.now() + backoff;
      this.setState(CircuitBreakerState.OPEN);
    } else if (this.consecutiveFailures >= this.failureThreshold) {
      this.currentBackoffMs = this.resetTimeoutMs;
      this.nextAttemptTime = Date.now() + this.resetTimeoutMs;
      this.setState(CircuitBreakerState.OPEN);
    }
  }

  private isQuotaError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const err = error as Record<string, unknown>;
    return (
      err.status === 429 ||
      err.statusCode === 429 ||
      err.code === 429 ||
      err.code === 'RESOURCE_EXHAUSTED' ||
      (typeof err.message === 'string' &&
        (err.message.includes('429') ||
          err.message.toLowerCase().includes('quota') ||
          err.message.toLowerCase().includes('rate limit')))
    );
  }

  /**
   * Executes a protected asynchronous API call through the circuit breaker.
   * In OPEN state, enqueues request if queue space is available or rejects.
   */
  public async execute<T>(
    fn: () => Promise<T>,
    options: { queueIfOpen?: boolean } = { queueIfOpen: true }
  ): Promise<T> {
    const currentState = this.getState();

    if (currentState === CircuitBreakerState.OPEN) {
      const waitMs = Math.max(0, this.nextAttemptTime - Date.now());
      if (options.queueIfOpen && this.offlineQueue.length < this.maxQueueSize) {
        return new Promise<T>((resolve, reject) => {
          this.offlineQueue.push({
            id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            execute: fn as () => Promise<unknown>,
            resolve: resolve as (val: unknown) => void,
            reject,
            retries: 0,
            timestamp: Date.now(),
          });
        });
      }

      throw new CircuitBreakerOpenError(
        `API Circuit Breaker is OPEN due to throttling. Retry in ${waitMs}ms.`,
        waitMs
      );
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure(err);
      throw err;
    }
  }

  /**
   * Drains the offline request queue sequentially.
   */
  public async drainQueue(): Promise<number> {
    if (this.isDraining) return 0;
    this.isDraining = true;
    let processedCount = 0;

    try {
      while (this.offlineQueue.length > 0 && this.getState() !== CircuitBreakerState.OPEN) {
        const item = this.offlineQueue.shift();
        if (!item) break;

        try {
          const result = await item.execute();
          item.resolve(result);
          this.recordSuccess();
          processedCount++;
        } catch (err) {
          this.recordFailure(err);
          item.retries++;
          if (this.isQuotaError(err) || item.retries > 3) {
            item.reject(err);
          } else {
            // Re-queue at head
            this.offlineQueue.unshift(item);
            // SEC-01: When re-queuing under non-OPEN state, schedule retry to prevent deadlock
            if (this.getState() !== CircuitBreakerState.OPEN) {
              const retryDelay = Math.min(1000, 100 * Math.pow(2, item.retries - 1));
              if (this.retryTimer) {
                clearTimeout(this.retryTimer as NodeJS.Timeout);
              }
              this.retryTimer = setTimeout(() => {
                this.retryTimer = null;
                void this.drainQueue();
              }, retryDelay);
            }
          }
          break;
        }
      }
    } finally {
      this.isDraining = false;
    }

    return processedCount;
  }

  public clearQueue(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer as NodeJS.Timeout);
      this.retryTimer = null;
    }
    while (this.offlineQueue.length > 0) {
      const item = this.offlineQueue.shift();
      if (item) {
        item.reject(new Error('Circuit breaker queue cleared'));
      }
    }
  }

  public reset(): void {
    this.clearQueue();
    this.state = CircuitBreakerState.CLOSED;
    this.consecutiveFailures = 0;
    this.consecutive429Count = 0;
    this.nextAttemptTime = 0;
    this.currentBackoffMs = 0;
  }
}
