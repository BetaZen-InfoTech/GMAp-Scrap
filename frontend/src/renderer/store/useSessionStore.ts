import { create } from 'zustand';
import type { SessionState, ProgressPayload, BatchSentPayload, CompletePayload } from '../types';

interface SessionStore {
  sessions: Map<string, SessionState>;
  isLoading: boolean;

  // Actions
  setSessions: (sessions: SessionState[]) => void;
  addSession: (session: SessionState) => void;
  updateProgress: (payload: ProgressPayload) => void;
  updateBatchSent: (payload: BatchSentPayload) => void;
  updateComplete: (payload: CompletePayload) => void;
  loadSessions: () => Promise<void>;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: new Map(),
  isLoading: false,

  setSessions: (sessions) => {
    const map = new Map<string, SessionState>();
    sessions.forEach((s) => map.set(s.id, s));
    set({ sessions: map });
  },

  addSession: (session) => {
    set((state) => {
      const map = new Map(state.sessions);
      map.set(session.id, session);
      return { sessions: map };
    });
  },

  updateProgress: (payload) => {
    set((state) => {
      const map = new Map(state.sessions);
      const session = map.get(payload.sessionId);
      if (session) {
        const updated: SessionState = {
          ...session,
          totalScraped: payload.totalScraped,
          totalUrls: payload.totalUrls ?? session.totalUrls,
          status: payload.status,
          errorMessage: payload.errorMessage ?? session.errorMessage,
        };
        if (payload.record) {
          updated.records = [...session.records, payload.record];
        }
        map.set(payload.sessionId, updated);
      }
      return { sessions: map };
    });
  },

  updateBatchSent: (payload) => {
    set((state) => {
      const map = new Map(state.sessions);
      const session = map.get(payload.sessionId);
      if (session && payload.success) {
        map.set(payload.sessionId, {
          ...session,
          batchesSent: session.batchesSent + 1,
        });
      }
      return { sessions: map };
    });
  },

  updateComplete: (payload) => {
    set((state) => {
      const map = new Map(state.sessions);
      const session = map.get(payload.sessionId);
      if (session) {
        map.set(payload.sessionId, {
          ...session,
          status: 'completed',
          totalScraped: payload.totalScraped,
          excelSent: payload.excelSent,
          excelPath: payload.excelPath,
          errorMessage: payload.error,
          endTime: new Date().toISOString(),
        });
      }
      return { sessions: map };
    });
  },

  loadSessions: async () => {
    set({ isLoading: true });
    try {
      const sessions = await window.electronAPI.getAllSessions();
      get().setSessions(sessions);
    } finally {
      set({ isLoading: false });
    }
  },
}));
