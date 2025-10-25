import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, config } from 'folds';
import { EventType, Room } from 'matrix-js-sdk';
import { ReactEditor } from 'slate-react';
import { isKeyHotkey } from 'is-hotkey';
import { useStateEvent } from '../../hooks/useStateEvent';
import { StateEvent } from '../../../types/matrix/room';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useEditor } from '../../components/editor';
import { RoomInputPlaceholder } from './RoomInputPlaceholder';
import { RoomTimeline } from './RoomTimeline';
import { RoomViewTyping } from './RoomViewTyping';
import { RoomTombstone } from './RoomTombstone';
import { RoomInput } from './RoomInput';
import { RoomViewFollowing, RoomViewFollowingPlaceholder } from './RoomViewFollowing';
import { Page } from '../../components/page';
import { RoomViewHeader } from './RoomViewHeader';
import { useKeyDown } from '../../hooks/useKeyDown';
import { editableActiveElement } from '../../utils/dom';
import { settingsAtom } from '../../state/settings';
import { useSetting } from '../../state/hooks/settings';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useCallOngoing } from '../../hooks/useCallOngoing';
import { useIsDirectRoom } from '../../hooks/useRoom';
import { DraggableCallWindow } from '../../components/element-call/DraggableCallWindow';
import { useCallContext } from '../../contexts/CallContext';

const FN_KEYS_REGEX = /^F\d+$/;
const shouldFocusMessageField = (evt: KeyboardEvent): boolean => {
  const { code } = evt;
  if (evt.metaKey || evt.altKey || evt.ctrlKey) {
    return false;
  }

  // do not focus on F keys
  if (FN_KEYS_REGEX.test(code)) return false;

  // do not focus on numlock/scroll lock
  if (
    code.startsWith('OS') ||
    code.startsWith('Meta') ||
    code.startsWith('Shift') ||
    code.startsWith('Alt') ||
    code.startsWith('Control') ||
    code.startsWith('Arrow') ||
    code.startsWith('Page') ||
    code.startsWith('End') ||
    code.startsWith('Home') ||
    code === 'Tab' ||
    code === 'Space' ||
    code === 'Enter' ||
    code === 'NumLock' ||
    code === 'ScrollLock'
  ) {
    return false;
  }

  return true;
};

export function RoomView({ room, eventId }: { room: Room; eventId?: string }) {
  const roomInputRef = useRef<HTMLDivElement>(null);
  const roomViewRef = useRef<HTMLDivElement>(null);

  const [hideActivity] = useSetting(settingsAtom, 'hideActivity');

  const { roomId } = room;
  const editor = useEditor();

  const mx = useMatrixClient();

  const tombstoneEvent = useStateEvent(room, StateEvent.RoomTombstone);
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);

  const [callJoined, setCallJoined] = useState(false);
  const permissions = useRoomPermissions(creators, powerLevels);
  const canMessage = permissions.event(EventType.RoomMessage, mx.getSafeUserId());
  const callOngoing = useCallOngoing(room);
  const isDirect = useIsDirectRoom();
  // Temporarily disabled CallContext to debug error
  // const { callState, startCall, endCall, updateCallEventSent } = useCallContext();
  const callState = { isActive: false, roomId: null, callStartTime: null, lastCallEventSent: null };
  const startCall = (roomId: string) => {};
  const endCall = () => {};
  const updateCallEventSent = (event: 'started' | 'ended') => {};

  // Format duration in human-readable format
  const formatCallDuration = useCallback((durationMs: number): string => {
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return hours === 1 ? '1 hour' : `${hours} hours`;
    } else if (minutes > 0) {
      return minutes === 1 ? '1 minute' : `${minutes} minutes`;
    } else {
      return seconds <= 1 ? '1 second' : `${seconds} seconds`;
    }
  }, []);

  const handleCallStart = useCallback(() => {
    // Don't allow starting a call if one is already ongoing
    if (callOngoing) {
      return;
    }
    
    startCall(roomId);
  }, [callOngoing, startCall, roomId]);

  const handleCallClose = useCallback(() => {
    // If we have an active call, send the ended message first
    if (callState.callStartTime && callState.lastCallEventSent !== 'ended' && canMessage) {
      const duration = Date.now() - callState.callStartTime;
      const durationText = formatCallDuration(duration);
      const content = {
        call_ended: true,
        duration: durationText,
        timestamp: Date.now(),
      };
      console.log('Sending call ended state event on close:', content);
      mx.sendStateEvent(roomId, 'org.matrix.msc3401.call' as any, content, 'call_status').then((result) => {
        console.log('Call ended state event sent successfully on close:', result);
        updateCallEventSent('ended');
      }).catch((error) => {
        console.error('Failed to send call ended state event on close:', error);
      });
    }
    
    // Force terminate the RTC session
    try {
      const session = mx.matrixRTC.getRoomSession(room);
      if (session.memberships.length > 0) {
        console.log('Terminating RTC session on close');
        // Try to leave the session by removing our membership
        const ourUserId = mx.getSafeUserId();
        const ourMembership = session.memberships.find(m => m.sender === ourUserId);
        if (ourMembership) {
          console.log('Removing our membership from RTC session');
          // The Matrix SDK should handle this automatically when the widget is closed
          // But we can try to explicitly remove our membership
          session.memberships = session.memberships.filter(m => m.sender !== ourUserId);
        }
      }
    } catch (error) {
      console.error('Error terminating RTC session:', error);
    }
    
    setCallJoined(false);
    endCall();
  }, [callState.callStartTime, callState.lastCallEventSent, canMessage, mx, roomId, formatCallDuration, room, updateCallEventSent, endCall]);

  // Listen for actual call session start to send system notification and set start time
  useEffect(() => {
    // Only send started event if we haven't already sent one and we have a valid call session
    if (callOngoing && !callState.callStartTime && callState.lastCallEventSent !== 'started') {
      const session = mx.matrixRTC.getRoomSession(room);
      const hasActiveRTCSession = session.memberships.length > 0;
      
      if (hasActiveRTCSession) {
        startCall(roomId);
        
        // Send a system state event for call start
        if (canMessage) {
          const content = {
            call_started: true,
            timestamp: Date.now(),
          };
          console.log('Sending call started state event:', content);
          mx.sendStateEvent(roomId, 'org.matrix.msc3401.call' as any, content, 'call_status').then((result) => {
            console.log('Call started state event sent successfully:', result);
            updateCallEventSent('started');
          }).catch((error) => {
            console.error('Failed to send call started state event:', error);
          });
        }
      }
    } else if (!callOngoing && callState.callStartTime && callState.lastCallEventSent !== 'ended') {
      // Call session ended, send end notification and reset state
      if (canMessage) {
        const duration = Date.now() - callState.callStartTime;
        const durationText = formatCallDuration(duration);
        const content = {
          call_ended: true,
          duration: durationText,
          timestamp: Date.now(),
        };
        console.log('Sending call ended state event:', content);
        mx.sendStateEvent(roomId, 'org.matrix.msc3401.call' as any, content, 'call_status').then((result) => {
          console.log('Call ended state event sent successfully:', result);
          updateCallEventSent('ended');
        }).catch((error) => {
          console.error('Failed to send call ended state event:', error);
        });
      }
      endCall();
    }
  }, [callOngoing, callState.callStartTime, callState.lastCallEventSent, canMessage, mx, roomId, formatCallDuration, room, startCall, updateCallEventSent, endCall]);

  // Handle page reload/unload to clean up call state
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Force close call on page reload/unload
      if (callOngoing) {
        setCallJoined(false);
        endCall();
      }
    };

    // Only cleanup on actual page unload, not tab switching
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [callOngoing, endCall]);

  useKeyDown(
    window,
    useCallback(
      (evt) => {
        if (editableActiveElement()) return;
        const portalContainer = document.getElementById('portalContainer');
        if (portalContainer && portalContainer.children.length > 0) {
          return;
        }
        if (shouldFocusMessageField(evt) || isKeyHotkey('mod+v', evt)) {
          ReactEditor.focus(editor);
        }
      },
      [editor]
    )
  );

  return (
    <Page ref={roomViewRef}>
      <RoomViewHeader onCallClick={handleCallStart} callJoined={callJoined} callOngoing={callOngoing} />
      <Box grow="Yes" direction="Row">
        {/* Temporarily disabled draggable call window to debug error */}
        {false && callOngoing && (
          <DraggableCallWindow
            onClose={handleCallClose}
            roomName={room.name || room.roomId}
          />
        )}
        <Box grow="Yes" direction="Column" style={{ width: 350 }}>
          <Box grow="Yes" direction="Column">
            <RoomTimeline
              room={room}
              eventId={eventId}
              roomInputRef={roomInputRef}
              editor={editor}
            />
            <RoomViewTyping room={room} />
          </Box>
          <Box shrink="No" direction="Column">
            <div style={{ padding: `0 ${config.space.S400}` }}>
              {tombstoneEvent ? (
                <RoomTombstone
                  roomId={roomId}
                  body={tombstoneEvent.getContent().body}
                  replacementRoomId={tombstoneEvent.getContent().replacement_room}
                />
              ) : (
                <>
                  {canMessage && (
                    <RoomInput
                      room={room}
                      editor={editor}
                      roomId={roomId}
                      fileDropContainerRef={roomViewRef}
                      ref={roomInputRef}
                    />
                  )}
                  {!canMessage && (
                    <RoomInputPlaceholder
                      style={{ padding: config.space.S200 }}
                      alignItems="Center"
                      justifyContent="Center"
                    >
                      <Text align="Center">You do not have permission to post in this room</Text>
                    </RoomInputPlaceholder>
                  )}
                </>
              )}
            </div>
            {hideActivity ? <RoomViewFollowingPlaceholder /> : <RoomViewFollowing room={room} />}
          </Box>
        </Box>
      </Box>
    </Page>
  );
}
