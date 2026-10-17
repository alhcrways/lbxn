/** Buffer fast replies while the character finishes its minimum thinking time. */
export class MinimumReplyGate {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active = false;
  private open = false;
  private complete = false;
  private text = '';

  constructor(
    private readonly onText: (text: string) => void,
    private readonly onComplete: () => void,
    private readonly delay = 1000,
  ) {}

  begin() {
    this.cancel();
    this.active = true;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.open = true;
      this.publish();
    }, this.delay);
  }

  update(text: string) {
    if (!this.active) return;
    this.text = text;
    this.publish();
  }

  finish(text: string) {
    if (!this.active) return;
    this.text = text;
    this.complete = true;
    this.publish();
  }

  cancel() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.active = false;
    this.open = false;
    this.complete = false;
    this.text = '';
  }

  private publish() {
    if (!this.active || !this.open) return;
    if (this.text) this.onText(this.text);
    if (this.complete) {
      this.active = false;
      this.onComplete();
    }
  }
}
