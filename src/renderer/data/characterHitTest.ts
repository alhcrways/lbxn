// 按当前可见帧的不透明像素判断人物热区，排除图片内的透明留白和阴影。
const masks = new WeakMap<HTMLImageElement, { src: string; pixels: ImageData }>();

export function hitsCharacter(root: HTMLElement, clientX: number, clientY: number): boolean {
  for (const image of root.querySelectorAll('img')) {
    const style = getComputedStyle(image);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
    if (!image.complete || !image.naturalWidth) continue;
    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    const x = Math.floor((clientX - rect.left - (rect.width - width) / 2) / scale);
    const y = Math.floor((clientY - rect.top - (rect.height - height) / 2) / scale);
    if (x < 0 || y < 0 || x >= image.naturalWidth || y >= image.naturalHeight) continue;
    let mask = masks.get(image);
    if (!mask || mask.src !== image.currentSrc) {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) continue;
      try {
        context.drawImage(image, 0, 0);
        mask = { src: image.currentSrc, pixels: context.getImageData(0, 0, canvas.width, canvas.height) };
        masks.set(image, mask);
      } catch { continue; }
    }
    if (mask.pixels.data[(y * mask.pixels.width + x) * 4 + 3] > 16) return true;
  }
  // 资源缺失时内置 SVG 也按实际绘制的图形判定。
  for (const shape of root.querySelectorAll('svg *')) {
    if (!(shape instanceof SVGGeometryElement)) continue;
    const matrix = shape.getScreenCTM();
    if (!matrix) continue;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    const style = getComputedStyle(shape);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if ((style.fill !== 'none' && shape.isPointInFill(point)) ||
        (style.stroke !== 'none' && shape.isPointInStroke(point))) return true;
  }
  return false;
}
