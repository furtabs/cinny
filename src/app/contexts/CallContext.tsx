import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Room } from 'matrix-js-sdk';

interface CallState {
  isActive: boolean;
  roomId: string | null;
  callStartTime: number | null;
  lastCallEventSent: 'started' | 'ended' | null;
}

interface CallContextType {
  callState: CallState;
  startCall: (roomId: string) => void;
  endCall: () => void;
  updateCallEventSent: (event: 'started' | 'ended') => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const useCallContext = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCallContext must be used within a CallProvider');
  }
  return context;
};

interface CallProviderProps {
  children: ReactNode;
}

export const CallProvider: React.FC<CallProviderProps> = ({ children }) => {
  const [callState, setCallState] = useState<CallState>(() => {
    // Always start with no active call on page load/refresh
    // This prevents auto-starting calls after refresh
    return {
      isActive: false,
      roomId: null,
      callStartTime: null,
      lastCallEventSent: null,
    };
  });

  const startCall = useCallback((roomId: string) => {
    console.log('CallContext: startCall called with roomId:', roomId);
    const newState = {
      isActive: true,
      roomId,
      callStartTime: Date.now(),
      lastCallEventSent: null,
    };
    console.log('CallContext: Setting call state to:', newState);
    setCallState(newState);
  }, []);

  const endCall = useCallback(() => {
    setCallState({
      isActive: false,
      roomId: null,
      callStartTime: null,
      lastCallEventSent: null,
    });
  }, []);

  const updateCallEventSent = useCallback((event: 'started' | 'ended') => {
    setCallState(prev => ({
      ...prev,
      lastCallEventSent: event,
    }));
  }, []);

  const value: CallContextType = {
    callState,
    startCall,
    endCall,
    updateCallEventSent,
  };

  return (
    <CallContext.Provider value={value}>
      {children}
    </CallContext.Provider>
  );
};
