import { Room } from 'matrix-js-sdk';
import { useEffect, useState, useCallback } from 'react';

import { MatrixRTCSessionManagerEvents } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSessionManager';

export const useCallOngoing = (room: Room) => {
  const [callOngoing, setCallOngoing] = useState(() => {
    // Initialize with current RTC session state
    const session = room.client.matrixRTC.getRoomSession(room);
    return session.memberships.length > 0;
  });

  // Function to check and update call state
  const checkCallState = useCallback(() => {
    const session = room.client.matrixRTC.getRoomSession(room);
    const hasActiveCall = session.memberships.length > 0;
    setCallOngoing(hasActiveCall);
    return hasActiveCall;
  }, [room]);

  useEffect(() => {
    // Check initial state and set up periodic checks for refresh recovery
    checkCallState();

    const start = (roomId: string) => {
      if (roomId !== room.roomId) return;
      console.log('RTC session started for room:', roomId);
      setCallOngoing(true);
    };
    const end = (roomId: string) => {
      if (roomId !== room.roomId) return;
      console.log('RTC session ended for room:', roomId);
      // Add a delay before setting callOngoing to false to handle temporary interruptions
      setTimeout(() => {
        const session = room.client.matrixRTC.getRoomSession(room);
        if (session.memberships.length === 0) {
          setCallOngoing(false);
        }
      }, 2000); // 2 second delay to handle temporary interruptions
    };

    room.client.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionStarted, start);
    room.client.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionEnded, end);

    // Set up periodic state check to recover from refresh scenarios (less frequent to avoid spamming)
    const stateCheckInterval = setInterval(checkCallState, 10000);

    return () => {
      room.client.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionStarted, start);
      room.client.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionEnded, end);
      clearInterval(stateCheckInterval);
    };
  }, [room, checkCallState]);

  return callOngoing;
};
