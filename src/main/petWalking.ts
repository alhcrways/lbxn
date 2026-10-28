import type { WinBounds } from '../shared/types';
export type WalkDirection = 'left' | 'right';
export interface WalkInput {
  now: number;
  bounds: WinBounds;
  area: WinBounds;
  enabled: boolean;
  blocked: boolean;
  scale: number;
}
/** DIP 坐标下的水平散步；按住人物、拖拽和面板打开时暂停，避免争抢窗口位置。 */
export class PetWalker {
  private lastTime: number | null = null;
  private resumeAt = 0;
  private lane: Pick<WinBounds, 'y' | 'width' | 'height'> | null = null;
  private x: number | null = null;
  private lastX: number | null = null;
  direction: WalkDirection = 'left';
  walking = false;

  /** 重新开启、拖拽放置或缩放后，从新的高度优先向左走。 */
  restart() {
    this.direction = 'left';
    this.walking = false;
    this.x = null;
    this.lastX = null;
    this.lane = null;
    this.lastTime = null;
    this.resumeAt = 0;
  }

  step({ now, bounds, area, enabled, blocked, scale }: WalkInput) {
    const dt = this.lastTime === null ? 0 : Math.max(0, Math.min(50, now - this.lastTime));
    this.lastTime = now;
    const minX = area.x, maxX = area.x + area.width - (this.lane?.width ?? bounds.width);
    if (!enabled || blocked || maxX <= minX) {
      this.walking = false;
      this.lane = null;
      this.resumeAt = now + 5000;
      this.x = bounds.x;
      this.lastX = bounds.x;
      return { bounds, walking: false, direction: this.direction };
    }
    if (this.lastX !== bounds.x || this.x === null) this.x = bounds.x;
    if (!this.walking && now >= this.resumeAt) {
      this.walking = true;
      // 不从下一帧 getBounds() 继承 y/尺寸，避免 Windows DPI 舍入误差累积成斜向移动。
      this.lane = { y: bounds.y, width: bounds.width, height: bounds.height };
    }
    if (!this.walking) return { bounds, walking: false, direction: this.direction };
    if (this.x <= minX) this.direction = 'right';
    if (this.x >= maxX) this.direction = 'left';
    this.x = Math.max(minX, Math.min(maxX, this.x + (this.direction === 'right' ? 1 : -1) * 80 * scale * dt / 1000));
    // 到达边缘的这一帧就切换朝向，左右边缘始终对称折返。
    this.lastX = Math.round(this.x);
    if (this.lastX <= minX) { this.x = minX; this.direction = 'right'; }
    else if (this.lastX >= maxX) { this.x = maxX; this.direction = 'left'; }
    return { bounds: { ...bounds, ...this.lane, x: this.lastX }, walking: true, direction: this.direction };
  }
}
