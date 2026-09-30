// Shared by the preview and full-resolution export; never distort the source.
export function placement(iw, ih, ow, oh, mode, zoom = 1, x = 0, y = 0) {
  const scale = (mode === 'crop' ? Math.max(ow / iw, oh / ih) * zoom : Math.min(ow / iw, oh / ih));
  const width = iw * scale, height = ih * scale;
  const limitX = Math.max(0, (width - ow) / 2), limitY = Math.max(0, (height - oh) / 2);
  const offsetX = mode === 'crop' ? Math.max(-limitX, Math.min(limitX, x)) : 0;
  const offsetY = mode === 'crop' ? Math.max(-limitY, Math.min(limitY, y)) : 0;
  return {width, height, left: (ow - width) / 2 + offsetX, top: (oh - height) / 2 + offsetY, offsetX, offsetY, scale};
}
