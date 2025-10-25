/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
import React, { useEffect, useRef } from 'react';
import FileSaver from 'file-saver';
import classNames from 'classnames';
import { Box, Chip, Header, Icon, IconButton, Icons, Text, as } from 'folds';
import * as css from './ImageViewer.css';
import { useZoom } from '../../hooks/useZoom';
import { usePan } from '../../hooks/usePan';
import { useResize } from '../../hooks/useResize';
import { downloadMedia } from '../../utils/matrix';

export type ImageViewerProps = {
  alt: string;
  src: string;
  requestClose: () => void;
};

export const ImageViewer = as<'div', ImageViewerProps>(
  ({ className, alt, src, requestClose, ...props }, ref) => {
    const { zoom, zoomIn, zoomOut, setZoom } = useZoom(0.2);
    const { pan, cursor, onMouseDown } = usePan(zoom !== 1);
    const { width, height, isResizing, onMouseDown: onResizeMouseDown, resetSize } = useResize(
      800, 600, 200, 200, 2000, 2000, true
    );
    const imageRef = useRef<HTMLImageElement>(null);

    const handleDownload = async () => {
      const fileContent = await downloadMedia(src);
      FileSaver.saveAs(fileContent, alt);
    };

    // Reset resize when zoom changes
    useEffect(() => {
      if (zoom === 1) {
        resetSize();
      }
    }, [zoom, resetSize]);

    return (
      <Box
        className={classNames(css.ImageViewer, className)}
        direction="Column"
        {...props}
        ref={ref}
      >
        <Header className={css.ImageViewerHeader} size="400">
          <Box grow="Yes" alignItems="Center" gap="200">
            <IconButton size="300" radii="300" onClick={requestClose}>
              <Icon size="50" src={Icons.ArrowLeft} />
            </IconButton>
            <Text size="T300" truncate>
              {alt}
            </Text>
          </Box>
          <Box shrink="No" alignItems="Center" gap="200">
            <IconButton
              variant={zoom < 1 ? 'Success' : 'SurfaceVariant'}
              outlined={zoom < 1}
              size="300"
              radii="Pill"
              onClick={zoomOut}
              aria-label="Zoom Out"
            >
              <Icon size="50" src={Icons.Minus} />
            </IconButton>
            <Chip variant="SurfaceVariant" radii="Pill" onClick={() => setZoom(zoom === 1 ? 2 : 1)}>
              <Text size="B300">{Math.round(zoom * 100)}%</Text>
            </Chip>
            <IconButton
              variant={zoom > 1 ? 'Success' : 'SurfaceVariant'}
              outlined={zoom > 1}
              size="300"
              radii="Pill"
              onClick={zoomIn}
              aria-label="Zoom In"
            >
              <Icon size="50" src={Icons.Plus} />
            </IconButton>
            <IconButton
              variant={isResizing ? 'Success' : 'SurfaceVariant'}
              outlined={isResizing}
              size="300"
              radii="Pill"
              onClick={resetSize}
              aria-label="Reset Size"
            >
              <Icon size="50" src={Icons.Setting} />
            </IconButton>
            <Chip
              variant="Primary"
              onClick={handleDownload}
              radii="300"
              before={<Icon size="50" src={Icons.Download} />}
            >
              <Text size="B300">Download</Text>
            </Chip>
          </Box>
        </Header>
        <Box
          grow="Yes"
          className={css.ImageViewerContent}
          justifyContent="Center"
          alignItems="Center"
        >
          <div
            className={css.ImageViewerContainer}
            style={{
              width: `${width}px`,
              height: `${height}px`,
              transform: `scale(${zoom}) translate(${pan.translateX}px, ${pan.translateY}px)`,
            }}
          >
            <img
              ref={imageRef}
              className={css.ImageViewerImg}
              style={{
                cursor: isResizing ? 'grabbing' : cursor,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
              src={src}
              alt={alt}
              onMouseDown={onMouseDown}
            />
            
            {/* Resize handles */}
            <div
              className={css.ResizeHandleNW}
              data-resize-handle="nw"
              onMouseDown={onResizeMouseDown}
            />
            <div
              className={css.ResizeHandleNE}
              data-resize-handle="ne"
              onMouseDown={onResizeMouseDown}
            />
            <div
              className={css.ResizeHandleSW}
              data-resize-handle="sw"
              onMouseDown={onResizeMouseDown}
            />
            <div
              className={css.ResizeHandleSE}
              data-resize-handle="se"
              onMouseDown={onResizeMouseDown}
            />
            <div
              className={css.ResizeHandleN}
              data-resize-handle="n"
              onMouseDown={onResizeMouseDown}
            />
            <div
              className={css.ResizeHandleS}
              data-resize-handle="s"
              onMouseDown={onResizeMouseDown}
            />
            <div
              className={css.ResizeHandleE}
              data-resize-handle="e"
              onMouseDown={onResizeMouseDown}
            />
            <div
              className={css.ResizeHandleW}
              data-resize-handle="w"
              onMouseDown={onResizeMouseDown}
            />
          </div>
        </Box>
      </Box>
    );
  }
);
