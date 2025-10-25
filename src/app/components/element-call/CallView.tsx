import React, { useEffect, useRef, useState } from 'react';
import { ClientWidgetApi } from 'matrix-widget-api';
import { Button, Text } from 'folds';
import ElementCall from './ElementCall';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useEventEmitter } from './utils';
import { useIsDirectRoom, useRoom } from '../../hooks/useRoom';
import { useCallOngoing } from '../../hooks/useCallOngoing';
import { useActiveTheme, ThemeKind } from '../../hooks/useTheme';

export enum CallWidgetActions {
  // All of these actions are currently specific to Jitsi and Element Call
  JoinCall = 'io.element.join',
  HangupCall = 'im.vector.hangup',
  Close = 'io.element.close',
}
export function action(type: CallWidgetActions): string {
  return `action:${type}`;
}

const iframeFeatures =
  'microphone; encrypted-media; autoplay; display-capture; clipboard-write; ' +
  'clipboard-read;';
const sandboxFlags =
  'allow-forms allow-popups allow-popups-to-escape-sandbox ' +
  'allow-same-origin allow-scripts allow-presentation allow-downloads';
const iframeStyles = { flex: '1 1', border: 'none' };
const containerStyle = (hidden: boolean): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  height: '100%',
  width: '100%',
  ...(hidden
    ? {
        overflow: 'hidden',
        width: 0,
        height: 0,
      }
    : {}),
});
const closeButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 8,
  zIndex: 100,
  maxWidth: 'fit-content',
};

enum State {
  Preparing = 'preparing',
  Lobby = 'lobby',
  Joined = 'joined',
  HungUp = 'hung_up',
  CanClose = 'can_close',
}

/**
 * Shows a call for this room. Rendering this component will
 * automatically create a call widget and join the call in the room.
 * @returns
 */
export interface IRoomCallViewProps {
  onClose?: () => void;
  onJoin?: () => void;
  onHangup?: (errorMessage?: string) => void;
}

export function CallView({
  onJoin = undefined,
  onClose = undefined,
  onHangup = undefined,
}: IRoomCallViewProps): JSX.Element {
  // Construct required variables
  const room = useRoom();
  const client = useMatrixClient();
  const iframe = useRef<HTMLIFrameElement>(null);
  const activeTheme = useActiveTheme();

  // Model state
  const [elementCall, setElementCall] = useState<ElementCall | null>();
  const [widgetApi, setWidgetApi] = useState<ClientWidgetApi | null>(null);
  const [state, setState] = useState(State.Preparing);

  // Initialization parameters
  const isDirect = useIsDirectRoom();
  const callOngoing = useCallOngoing(room);
  const initialCallOngoing = React.useRef(callOngoing);
  const initialIsDirect = React.useRef(isDirect);
  
  // Update refs when values change (important for refresh recovery)
  React.useEffect(() => {
    initialCallOngoing.current = callOngoing;
  }, [callOngoing]);
  
  React.useEffect(() => {
    initialIsDirect.current = isDirect;
  }, [isDirect]);

  useEffect(() => {
    if (client && room && !elementCall) {
      // Use Cinny's active theme for Element Call to match the current theme
      const theme = activeTheme.kind === ThemeKind.Dark ? 'dark' : 'light';
      const e = new ElementCall(client, room, initialIsDirect.current, initialCallOngoing.current, theme);
      setElementCall(e);
    }
  }, [client, room, setElementCall, elementCall, activeTheme]);

  // Start the messaging over the widget api.
  useEffect(() => {
    if (iframe.current && elementCall) {
      elementCall.startMessaging(iframe.current);
    }
    return () => {
      elementCall?.stopMessaging();
    };
  }, [iframe, elementCall]);

  // Widget api ready
  useEventEmitter(elementCall, 'ready', () => {
    setWidgetApi(elementCall?.widgetApi ?? null);
    setState(State.Lobby);
    
    // Try to disable video after widget is ready
    if (elementCall?.widgetApi) {
      try {
        // Send a message to disable video
        elementCall.widgetApi.transport.send('io.element.setVideoMuted', { muted: true });
        elementCall.widgetApi.transport.send('io.element.setAudioMuted', { muted: false });
        console.log('Sent video disable commands to Element Call widget');
      } catch (error) {
        console.error('Error sending video disable commands:', error);
      }
    }
  });

  // Use widget api to listen for hangup/join/close actions
  useEventEmitter(widgetApi, action(CallWidgetActions.HangupCall), () => {
    setState(State.HungUp);
    onHangup?.();
  });
  useEventEmitter(widgetApi, action(CallWidgetActions.JoinCall), () => {
    setState(State.Joined);
    onJoin?.();
  });
  useEventEmitter(widgetApi, action(CallWidgetActions.Close), () => {
    setState(State.CanClose);
    onClose?.();
  });

  // Force close call when component unmounts or page reloads
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (elementCall) {
        elementCall.forceCleanup();
      }
    };

    const handleVisibilityChange = () => {
      // If page becomes hidden, force cleanup
      if (document.hidden && elementCall) {
        elementCall.forceCleanup();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Clean up call when component unmounts
      if (elementCall) {
        elementCall.forceCleanup();
      }
    };
  }, [elementCall]);

  // Listen for cleanup events from ElementCall
  useEventEmitter(elementCall, 'cleanup', () => {
    setState(State.CanClose);
    onClose?.();
  });

  // render component
  return (
    <div style={containerStyle(state === State.HungUp)}>
      {/* Exit button - always visible to allow closing */}
      <Button
        variant="Secondary"
        onClick={() => {
          console.log('Close button clicked - terminating call');
          // Send hangup action to the widget first
          if (widgetApi) {
            try {
              widgetApi.transport.send(action(CallWidgetActions.HangupCall), {});
              console.log('Sent hangup action to widget');
            } catch (error) {
              console.error('Error sending hangup action:', error);
            }
          }
          // Force cleanup before closing
          if (elementCall) {
            elementCall.forceCleanup();
          }
          setState(State.CanClose);
          onClose?.();
        }}
        style={closeButtonStyle}
      >
        <Text size="B400">Close</Text>
      </Button>
      <iframe
        ref={iframe}
        allow={iframeFeatures}
        sandbox={sandboxFlags}
        style={iframeStyles}
        src={elementCall?.embedUrl}
        title="room call"
      />
    </div>
  );
}
