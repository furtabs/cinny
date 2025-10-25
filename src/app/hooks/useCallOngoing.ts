import { Room } from 'matrix-js-sdk';
import { useEffect, useState } from 'react';

import { MatrixRTCSessionManagerEvents } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSessionManager';

export const useCallOngoing = (room: Room) => {
  const [callOngoing, setCallOngoing] = useState(
    room.client.matrixRTC.getRoomSession(room).memberships.length > 0
  );

  useEffect(() => {
    const start = (roomId: string) => {
      if (roomId !== room.roomId) return;
      setCallOngoing(true);
    };
    const end = (roomId: string) => {
      if (roomId !== room.roomId) return;
      setCallOngoing(false);
    };
    room.client.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionStarted, start);
    room.client.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionEnded, end);
    return () => {
      room.client.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionStarted, start);
      room.client.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionEnded, end);
    };
  }, [room]);

  return callOngoing;
};
