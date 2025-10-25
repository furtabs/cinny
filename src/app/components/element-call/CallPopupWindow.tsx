import React, { useEffect, useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MatrixClient, Room } from 'matrix-js-sdk';
import { CallView } from './CallView';
import { MatrixClientProvider } from '../../hooks/useMatrixClient';
import { RoomProvider } from '../../hooks/useRoom';

interface CallPopupWindowProps {
  client: MatrixClient;
  room: Room;
  isDirect: boolean;
  callOngoing: boolean;
  onClose: () => void;
}

export const CallPopupWindow: React.FC<CallPopupWindowProps> = ({
  client,
  room,
  isDirect,
  callOngoing,
  onClose,
}) => {
  const [popupWindow, setPopupWindow] = useState<Window | null>(null);
  const [popupRoot, setPopupRoot] = useState<Root | null>(null);
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    if (callOngoing && !popupWindow) {
      openCallPopup();
    } else if (!callOngoing && popupWindow) {
      closeCallPopup();
    }
  }, [callOngoing]);

  const openCallPopup = () => {
    try {
      // Create popup window
      const popup = window.open(
        '',
        'cinny-call-popup',
        'width=800,height=600,resizable=yes,scrollbars=no,menubar=no,toolbar=no,location=no,status=no'
      );

      if (!popup) {
        console.error('Failed to open popup window - popup blocked?');
        return;
      }

      // Set up popup content
      popup.document.title = `Call - ${room.name || room.roomId}`;
      popup.document.body.style.margin = '0';
      popup.document.body.style.padding = '0';
      popup.document.body.style.overflow = 'hidden';
      popup.document.body.style.backgroundColor = '#1A1A1A'; // Cinny dark theme

      // Create root container
      const container = popup.document.createElement('div');
      container.id = 'call-popup-root';
      container.style.width = '100%';
      container.style.height = '100vh';
      popup.document.body.appendChild(container);

      // Create React root
      const root = createRoot(container);
      
      // Render CallView in popup with providers
      root.render(
        <ClientProvider value={client}>
          <RoomProvider value={room}>
            <CallView
              onClose={() => {
                closeCallPopup();
                onClose();
              }}
            />
          </RoomProvider>
        </ClientProvider>
      );

      // Handle popup close
      const handlePopupClose = () => {
        console.log('Popup window closed');
        closeCallPopup();
        onClose();
      };

      popup.addEventListener('beforeunload', handlePopupClose);
      popup.addEventListener('unload', handlePopupClose);

      setPopupWindow(popup);
      setPopupRoot(root);
      popupRef.current = popup;

      console.log('Call popup window opened');
    } catch (error) {
      console.error('Error opening call popup:', error);
    }
  };

  const closeCallPopup = () => {
    if (popupRoot) {
      popupRoot.unmount();
      setPopupRoot(null);
    }
    
    if (popupWindow) {
      popupWindow.close();
      setPopupWindow(null);
      popupRef.current = null;
    }
    
    console.log('Call popup window closed');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeCallPopup();
    };
  }, []);

  // Don't render anything in the main window when popup is open
  return null;
};