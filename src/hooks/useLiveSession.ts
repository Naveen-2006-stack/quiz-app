import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useGameStore } from '@/store/useGameStore';

export function useLiveSession(sessionId: string, role: 'teacher' | 'student') {
  const { 
    setCurrentQuestionIndex, 
    setSessionStatus, 
    updateParticipant, 
    removeParticipant 
  } = useGameStore();

  useEffect(() => {
    if (!sessionId) return;

    // 1. Subscribe to Global Game State (questions advancing, game ending)
    const sessionChannel = supabase.channel(`session_global_state:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'live_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          if (payload.new.current_question_index !== undefined) {
            setCurrentQuestionIndex(payload.new.current_question_index);
          }
          if (payload.new.status) {
            setSessionStatus(payload.new.status);
          }
        }
      )
      .subscribe();

    // 2. Subscribe to Participant Changes (joining, scoring, cheating)
    // Only teachers strictly need this for the leaderboard, but students might need it to see others join
    const participantChannel = supabase.channel(`session_participants:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          updateParticipant(payload.new as any);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          updateParticipant(payload.new as any);
        }
      )
      .on(
         'postgres_changes',
         { event: 'DELETE', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` },
         (payload) => {
           removeParticipant(payload.old.id);
         }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(participantChannel);
    };
  }, [sessionId, role, setCurrentQuestionIndex, setSessionStatus, updateParticipant, removeParticipant]);
}
