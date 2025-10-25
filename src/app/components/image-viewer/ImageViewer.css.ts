import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config } from 'folds';

export const ImageViewer = style([
  DefaultReset,
  {
    height: '100%',
  },
]);

export const ImageViewerHeader = style([
  DefaultReset,
  {
    paddingLeft: config.space.S200,
    paddingRight: config.space.S200,
    borderBottomWidth: config.borderWidth.B300,
    flexShrink: 0,
    gap: config.space.S200,
  },
]);

export const ImageViewerContent = style([
  DefaultReset,
  {
    backgroundColor: color.Background.Container,
    color: color.Background.OnContainer,
    overflow: 'hidden',
  },
]);

export const ImageViewerImg = style([
  DefaultReset,
  {
    objectFit: 'contain',
    width: 'auto',
    height: 'auto',
    maxWidth: '100%',
    maxHeight: '100%',
    backgroundColor: color.Surface.Container,
    transition: 'transform 100ms linear',
  },
]);

export const ImageViewerContainer = style([
  DefaultReset,
  {
    position: 'relative',
    display: 'inline-block',
  },
]);

export const ResizeHandle = style([
  DefaultReset,
  {
    position: 'absolute',
    backgroundColor: color.Primary.Main,
    opacity: 0.7,
    transition: 'opacity 200ms ease',
    ':hover': {
      opacity: 1,
    },
  },
]);

export const ResizeHandleCorner = style([
  ResizeHandle,
  {
    width: '12px',
    height: '12px',
  },
]);

export const ResizeHandleEdge = style([
  ResizeHandle,
  {
    backgroundColor: color.Primary.Main,
  },
]);

export const ResizeHandleNW = style([
  ResizeHandleCorner,
  {
    top: '-6px',
    left: '-6px',
    cursor: 'nw-resize',
  },
]);

export const ResizeHandleNE = style([
  ResizeHandleCorner,
  {
    top: '-6px',
    right: '-6px',
    cursor: 'ne-resize',
  },
]);

export const ResizeHandleSW = style([
  ResizeHandleCorner,
  {
    bottom: '-6px',
    left: '-6px',
    cursor: 'sw-resize',
  },
]);

export const ResizeHandleSE = style([
  ResizeHandleCorner,
  {
    bottom: '-6px',
    right: '-6px',
    cursor: 'se-resize',
  },
]);

export const ResizeHandleN = style([
  ResizeHandleEdge,
  {
    top: '-3px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '20px',
    height: '6px',
    cursor: 'n-resize',
  },
]);

export const ResizeHandleS = style([
  ResizeHandleEdge,
  {
    bottom: '-3px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '20px',
    height: '6px',
    cursor: 's-resize',
  },
]);

export const ResizeHandleE = style([
  ResizeHandleEdge,
  {
    right: '-3px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '6px',
    height: '20px',
    cursor: 'e-resize',
  },
]);

export const ResizeHandleW = style([
  ResizeHandleEdge,
  {
    left: '-3px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '6px',
    height: '20px',
    cursor: 'w-resize',
  },
]);