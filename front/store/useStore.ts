import { create } from "zustand";

// 예시: 카운터 스토어
interface CounterState {
  count: number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
}

export const useCounterStore = create<CounterState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: state.count - 1 })),
  reset: () => set({ count: 0 }),
}));

// UI store: shared entry state so the hero can begin its reveal exactly when
// the preloader curtain lifts (decouples timing from a magic delay constant).
interface UiState {
  entered: boolean;
  setEntered: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  entered: false,
  setEntered: (v) => set({ entered: v }),
}));
