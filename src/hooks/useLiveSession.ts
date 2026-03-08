import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useGameStore, type SessionStatus } from '@/store/useGameStore';

/**
 * useLiveSession — single hook that wires up ALL Supabase Realtime subscriptions
 * for a given quiz session. Combines session state + participant changes into one
 * managed lifecycle, with guaranteed cleanup on unmount.
 */
export function useLiveSession(sessionId: string, role: 'teacher' | 'student') {
  const {
    setCurrentQuestionIndex,
    setSessionStatus,
    updateParticipant,
    removeParticipant,
  } = useGameStore();

  useEffect(() => {
    if (!sessionId) return;

    // --- Channel 1: Game State (session status + question index) ---
    // We use a single channel name that won't collide with broadcast channels.
    const sessionChannel = supabase
      .channel(`realtime:session:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const updated = payload.new as Record<string, any>;
          // Only dispatch what actually changed to avoid spurious re-renders
          if (updated.current_question_index !== undefined) {
            setCurrentQuestionIndex(updated.current_question_index as number);
          }
          if (updated.status) {
            setSessionStatus(updated.status as SessionStatus);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] session channel for ${sessionId} is live`);
        }
      });

    // --- Channel 2: Participant roster (joins, score updates, leaves) ---
    const participantChannel = supabase
      .channel(`realtime:participants:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'participants',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => updateParticipant(payload.new as any)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'participants',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => updateParticipant(payload.new as any)
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'participants',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => removeParticipant((payload.old as any).id)
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] participant channel for ${sessionId} is live`);
        }
      });

    // Cleanup: remove both channels on unmount or sessionId/role change
    return () => {
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(participantChannel);
    };
  }, [
    sessionId,
    role,
    setCurrentQuestionIndex,
    setSessionStatus,
    updateParticipant,
    removeParticipant,
  ]);
}
