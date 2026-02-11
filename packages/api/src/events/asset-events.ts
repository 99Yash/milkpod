import { EventEmitter } from 'node:events';
import type { AssetStatus } from '../types';

export interface AssetStatusEvent {
  assetId: string;
  userId: string;
  status: AssetStatus;
  message?: string;
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
