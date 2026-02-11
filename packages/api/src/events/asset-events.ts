import { EventEmitter } from 'node:events';
import type { AssetStatus } from '../types';

export interface AssetStatusEvent {
  assetId: string;
  userId: string;
  status: AssetStatus;
  message?: string;
  /** 0–100 progress within the current stage */
  progress?: number;
}

type StatusListener = (payload: AssetStatusEvent) => void;

interface TypedEventBus {
  emit(event: 'status', payload: AssetStatusEvent): boolean;
  on(event: 'status', listener: StatusListener): this;
  off(event: 'status', listener: StatusListener): this;
  setMaxListeners(n: number): this;
}

export const assetEvents = new EventEmitter() as TypedEventBus;
assetEvents.setMaxListeners(100);

export function emitAssetStatus(
  userId: string,
  assetId: string,
  status: AssetStatus,
  message?: string
): void {
  assetEvents.emit('status', { assetId, userId, status, message });
}

/** Emit sub-stage progress (0–100) without changing the status */
export function emitAssetProgress(
  userId: string,
  assetId: string,
  status: AssetStatus,
  progress: number,
  message?: string
): void {
  assetEvents.emit('status', {
    assetId,
    userId,
    status,
    progress: Math.round(Math.min(100, Math.max(0, progress))),
    message,
  });
}
