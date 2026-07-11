/**
 * The bus store — the ONLY state source views may render from (convention: UI renders
 * exclusively from slices; a value with no event is missing, never invented).
 */
import { create } from 'zustand';
import {
  emptyState,
  reduce,
  type AccEvent,
  type BusState,
  type Sample,
  type SnapshotFrame,
} from '@ado/shared';

export type Connection = 'connecting' | 'live' | 'reconnecting' | 'offline';

interface BusStore {
  state: BusState;
  seq: number;
  connection: Connection;
  applySnapshot: (frame: SnapshotFrame) => void;
  applyEvent: (seq: number, evt: AccEvent) => void;
  applySample: (sample: Sample) => void;
  setConnection: (c: Connection) => void;
}

export const useBus = create<BusStore>((set) => ({
  state: emptyState(),
  seq: 0,
  connection: 'connecting',
  applySnapshot: (frame) => set({ state: frame.state, seq: frame.seq }),
  applyEvent: (seq, evt) => set((s) => ({ state: reduce(s.state, evt), seq })),
  // Samples fold through the SAME reducer but never touch `seq` (transient channel).
  applySample: (sample) =>
    set((s) => ({ state: reduce(s.state, { type: 'system.sample', ts: sample.ts, payload: sample }) })),
  setConnection: (connection) => set({ connection }),
}));
