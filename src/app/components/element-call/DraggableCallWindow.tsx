import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Box, Button, Icon, Icons, Text } from 'folds';
import { CallView } from './CallView';

interface DraggableCallWindowProps {
  onClose: () => void;
  onMinimize?: () => void;
  roomName?: string;
}

export const DraggableCallWindow: React.FC<DraggableCallWindowProps> = ({
  onClose,
  onMinimize,
  roomName = 'Call',
}) => {
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('button')) {
      return; // Don't drag if clicking on buttons
    }
    
    setIsDragging(true);
    const rect = windowRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;
    
    // Keep window within viewport bounds
    const maxX = window.innerWidth - 400; // window width
    const maxY = window.innerHeight - 300; // window height
    
    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    });
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleMinimize = () => {
    setIsMinimized(!isMinimized);
    onMinimize?.();
  };

  const windowStyle: React.CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    width: '400px',
    height: isMinimized ? '60px' : '500px',
    backgroundColor: '#1A1A1A',
    border: '1px solid #333',
    borderRadius: '8px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transition: isDragging ? 'none' : 'height 0.2s ease',
  };

  const headerStyle: React.CSSProperties = {
    backgroundColor: '#262626',
    padding: '8px 12px',
    borderBottom: '1px solid #333',
    cursor: isDragging ? 'grabbing' : 'grab',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    userSelect: 'none',
  };

  const contentStyle: React.CSSProperties = {
    flex: 1,
    display: isMinimized ? 'none' : 'flex',
    flexDirection: 'column',
  };

  return (
    <div ref={windowRef} style={windowStyle}>
      {/* Window Header */}
      <div
        style={headerStyle}
        onMouseDown={handleMouseDown}
      >
        <Box alignItems="Center" gap="200">
          <Icon src={Icons.Phone} size="300" />
          <Text size="B300" truncate>
            {roomName}
          </Text>
        </Box>
        
        <Box alignItems="Center" gap="100">
          <Button
            size="300"
            variant="Secondary"
            onClick={handleMinimize}
            radii="300"
          >
            <Icon src={isMinimized ? Icons.ChevronTop : Icons.ChevronBottom} size="200" />
          </Button>
          <Button
            size="300"
            variant="Critical"
            onClick={onClose}
            radii="300"
          >
            <Icon src={Icons.Cross} size="200" />
          </Button>
        </Box>
      </div>

      {/* Window Content */}
      <div style={contentStyle}>
        <CallView
          onClose={onClose}
        />
      </div>
    </div>
  );
};

