/** 可测试的定时提醒：关闭本次后从关闭时重新计时；不可交互时延后显示。 */
export class BreakReminder {
  enabled = true;
  intervalMinutes = 60;
  active = false;
  nextReminderAt: number | null;
  constructor(now = Date.now()) { this.nextReminderAt = now + 60 * 60_000; }
  configure(enabled: boolean, intervalMinutes: number, now: number) {
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) return false;
    this.enabled = enabled;
    this.intervalMinutes = intervalMinutes;
    // 修改间隔不会结束正在显示的提醒，双击确认后才进入下一轮计时。
    if (!enabled || !this.active) this.dismiss(now);
    return true;
  }
  tick(now: number, available: boolean) {
    if (this.enabled && !this.active && available && this.nextReminderAt !== null && now >= this.nextReminderAt) {
      this.active = true;
      this.nextReminderAt = null;
    }
    return this.active;
  }
  dismiss(now: number) {
    this.active = false;
    this.nextReminderAt = this.enabled ? now + this.intervalMinutes * 60_000 : null;
  }
}
