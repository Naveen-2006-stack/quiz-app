import { create } from 'zustand';

export type SessionStatus = 'waiting' | 'active' | 'finished';

interface Participant {
  id: string;
  display_name: string;
  score: number;
  streak: number;
  cheat_flags: number;
  last_active?: string;
}

interface GameState {
  sessionStatus: SessionStatus;
  currentQuestionIndex: number;
  participants: Record<string, Participant>;

  // Actions
  setSessionStatus: (status: SessionStatus) => void;
  setCurrentQuestionIndex: (index: number) => void;
  updateParticipant: (participant: Participant) => void;
  setParticipants: (participants: Participant[]) => void;
  removeParticipant: (id: string) => void;
  incrementCheatFlag: (participantId: string) => void;
}

export const useGameStore = create<GameState>((set) => ({
  sessionStatus: 'waiting',
  currentQuestionIndex: 0,
  participants: {},

  setSessionStatus: (status) => set({ sessionStatus: status }),
  
  setCurrentQuestionIndex: (index) => set({ currentQuestionIndex: index }),
  
  updateParticipant: (participant) => set((state) => {
    const prev = state.participants[participant.id];
    const merged = {
      ...participant,
      cheat_flags: Math.max(participant.cheat_flags || 0, prev?.cheat_flags || 0),
    };
    return {
      participants: {
        ...state.participants,
        [participant.id]: merged,
      },
    };
  }),

  setParticipants: (participantsList) => set((state) => {
    const map: Record<string, Participant> = {};
    participantsList.forEach((p) => {
      const prev = state.participants[p.id];
      map[p.id] = {
        ...p,
        cheat_flags: Math.max(p.cheat_flags || 0, prev?.cheat_flags || 0),
      };
    });
    return { participants: map };
  }),

  removeParticipant: (id) => set((state) => {
    const newParticipants = { ...state.participants };
    delete newParticipants[id];
    return { participants: newParticipants };
  }),

  incrementCheatFlag: (participantId) => set((state) => {
    const p = state.participants[participantId];
    if (!p) return state;
    return {
      participants: {
        ...state.participants,
        [participantId]: { ...p, cheat_flags: (p.cheat_flags || 0) + 1 },
      },
    };
  }),
}));
