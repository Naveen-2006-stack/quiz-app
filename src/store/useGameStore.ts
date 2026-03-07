import { create } from 'zustand';

export type SessionStatus = 'waiting' | 'active' | 'finished';

interface Participant {
  id: string;
  display_name: string;
  score: number;
  streak: number;
  cheat_flags: number;
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
}

export const useGameStore = create<GameState>((set) => ({
  sessionStatus: 'waiting',
  currentQuestionIndex: 0,
  participants: {},

  setSessionStatus: (status) => set({ sessionStatus: status }),
  
  setCurrentQuestionIndex: (index) => set({ currentQuestionIndex: index }),
  
  updateParticipant: (participant) => set((state) => ({
    participants: {
      ...state.participants,
      [participant.id]: participant
    }
  })),

  setParticipants: (participantsList) => set(() => {
    const map: Record<string, Participant> = {};
    participantsList.forEach(p => map[p.id] = p);
    return { participants: map };
  }),

  removeParticipant: (id) => set((state) => {
    const newParticipants = { ...state.participants };
    delete newParticipants[id];
    return { participants: newParticipants };
  }),
}));
