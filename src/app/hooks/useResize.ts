import { MouseEventHandler, useEffect, useState, useCallback } from 'react';

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

export type ResizeState = {
  width: number;
  height: number;
  isResizing: boolean;
  activeHandle: ResizeHandle | null;
};

const INITIAL_RESIZE_STATE: ResizeState = {
  width: 0,
  height: 0,
  isResizing: false,
  activeHandle: null,
};

export const useResize = (
  initialWidth: number = 800,
  initialHeight: number = 600,
  minWidth: number = 200,
  minHeight: number = 200,
  maxWidth: number = 2000,
  maxHeight: number = 2000,
  maintainAspectRatio: boolean = true
) => {
  const [resizeState, setResizeState] = useState<ResizeState>({
    ...INITIAL_RESIZE_STATE,
    width: initialWidth,
    height: initialHeight,
  });

  const [aspectRatio, setAspectRatio] = useState<number>(
    maintainAspectRatio ? initialWidth / initialHeight : 1
  );

  const handleMouseMove = useCallback(
    (evt: MouseEvent) => {
      if (!resizeState.isResizing || !resizeState.activeHandle) return;

      evt.preventDefault();
      evt.stopPropagation();

      setResizeState((prev) => {
        const { width, height, activeHandle } = prev;
        let newWidth = width;
        let newHeight = height;

        // Calculate new dimensions based on the active handle
        switch (activeHandle) {
          case 'se':
            newWidth = Math.max(minWidth, Math.min(maxWidth, width + evt.movementX));
            newHeight = maintainAspectRatio
              ? newWidth / aspectRatio
              : Math.max(minHeight, Math.min(maxHeight, height + evt.movementY));
            break;
          case 'sw':
            newWidth = Math.max(minWidth, Math.min(maxWidth, width - evt.movementX));
            newHeight = maintainAspectRatio
              ? newWidth / aspectRatio
              : Math.max(minHeight, Math.min(maxHeight, height + evt.movementY));
            break;
          case 'ne':
            newWidth = Math.max(minWidth, Math.min(maxWidth, width + evt.movementX));
            newHeight = maintainAspectRatio
              ? newWidth / aspectRatio
              : Math.max(minHeight, Math.min(maxHeight, height - evt.movementY));
            break;
          case 'nw':
            newWidth = Math.max(minWidth, Math.min(maxWidth, width - evt.movementX));
            newHeight = maintainAspectRatio
              ? newWidth / aspectRatio
              : Math.max(minHeight, Math.min(maxHeight, height - evt.movementY));
            break;
          case 'e':
            newWidth = Math.max(minWidth, Math.min(maxWidth, width + evt.movementX));
            newHeight = maintainAspectRatio ? newWidth / aspectRatio : height;
            break;
          case 'w':
            newWidth = Math.max(minWidth, Math.min(maxWidth, width - evt.movementX));
            newHeight = maintainAspectRatio ? newWidth / aspectRatio : height;
            break;
          case 's':
            newHeight = Math.max(minHeight, Math.min(maxHeight, height + evt.movementY));
            newWidth = maintainAspectRatio ? newHeight * aspectRatio : width;
            break;
          case 'n':
            newHeight = Math.max(minHeight, Math.min(maxHeight, height - evt.movementY));
            newWidth = maintainAspectRatio ? newHeight * aspectRatio : width;
            break;
        }

        return {
          ...prev,
          width: newWidth,
          height: newHeight,
        };
      });
    },
    [resizeState.isResizing, resizeState.activeHandle, minWidth, minHeight, maxWidth, maxHeight, maintainAspectRatio, aspectRatio]
  );

  const handleMouseUp = useCallback(
    (evt: MouseEvent) => {
      evt.preventDefault();
      setResizeState((prev) => ({
        ...prev,
        isResizing: false,
        activeHandle: null,
      }));

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    },
    [handleMouseMove]
  );

  const handleMouseDown: MouseEventHandler<HTMLElement> = useCallback(
    (evt) => {
      const handle = evt.currentTarget.getAttribute('data-resize-handle') as ResizeHandle;
      if (!handle) return;

      evt.preventDefault();
      evt.stopPropagation();

      setResizeState((prev) => ({
        ...prev,
        isResizing: true,
        activeHandle: handle,
      }));

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [handleMouseMove, handleMouseUp]
  );

  const resetSize = useCallback(() => {
    setResizeState((prev) => ({
      ...prev,
      width: initialWidth,
      height: initialHeight,
    }));
  }, [initialWidth, initialHeight]);

  const setSize = useCallback((width: number, height: number) => {
    setResizeState((prev) => ({
      ...prev,
      width: Math.max(minWidth, Math.min(maxWidth, width)),
      height: Math.max(minHeight, Math.min(maxHeight, height)),
    }));
  }, [minWidth, minHeight, maxWidth, maxHeight]);

  // Update aspect ratio when dimensions change
  useEffect(() => {
    if (maintainAspectRatio && resizeState.width > 0 && resizeState.height > 0) {
      setAspectRatio(resizeState.width / resizeState.height);
    }
  }, [resizeState.width, resizeState.height, maintainAspectRatio]);

  return {
    width: resizeState.width,
    height: resizeState.height,
    isResizing: resizeState.isResizing,
    activeHandle: resizeState.activeHandle,
    onMouseDown: handleMouseDown,
    resetSize,
    setSize,
  };
};
