type Listener = (t: number, playing: boolean) => void;

const stopFrame = (id: number) => {
  if (id && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(id);
};

/**
 * Keeps several <video> elements on one clock. The first attached video leads; followers are nudged
 * back when they drift. Seeking and pausing apply to all of them.
 */
export class SyncClock {
  t = 0;
  playing = false;
  duration = 0;
  rate = 1;
  loop = true;
  /** Milliseconds to rest on the last frame before looping. */
  hold = 0;
  private holdTimer: ReturnType<typeof setTimeout> | undefined;
  private vids: HTMLVideoElement[] = [];
  private subs = new Set<Listener>();
  private raf = 0;

  add(v: HTMLVideoElement) {
    this.vids.push(v);
    v.muted = true;
    v.playsInline = true;
    // Setting src (lazy videos do so later) resets playbackRate to defaultPlaybackRate, so set both.
    v.defaultPlaybackRate = this.rate;
    v.playbackRate = this.rate;
    const meta = () => {
      v.playbackRate = this.rate;
      this.duration = Math.max(0, ...this.vids.map((x) => (Number.isFinite(x.duration) ? x.duration : 0)));
      if (this.t > 0) this.place(v, this.t);
      if (this.playing) v.play().catch(() => {});
      this.emit();
    };
    v.addEventListener('loadedmetadata', meta);
    if (v.readyState >= 1) meta();
    if (this.playing) v.play().catch(() => {});
    return () => {
      v.removeEventListener('loadedmetadata', meta);
      this.vids = this.vids.filter((x) => x !== v);
    };
  }

  subscribe(fn: Listener) {
    this.subs.add(fn);
    fn(this.t, this.playing);
    return () => {
      this.subs.delete(fn);
    };
  }

  play() {
    clearTimeout(this.holdTimer);
    if (this.duration && this.t >= this.duration - 0.05) this.seek(0);
    this.playing = true;
    for (const v of this.vids) v.play().catch(() => {});
    stopFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
    this.emit();
  }

  pause() {
    clearTimeout(this.holdTimer);
    this.playing = false;
    stopFrame(this.raf);
    for (const v of this.vids) {
      v.pause();
      this.place(v, this.t);
    }
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(t: number) {
    clearTimeout(this.holdTimer);
    this.t = Math.max(0, Math.min(t, this.duration || t));
    for (const v of this.vids) this.place(v, this.t);
    this.emit();
  }

  setRate(r: number) {
    this.rate = r;
    for (const v of this.vids) {
      v.defaultPlaybackRate = r;
      v.playbackRate = r;
    }
  }

  destroy() {
    clearTimeout(this.holdTimer);
    stopFrame(this.raf);
    this.subs.clear();
    this.vids = [];
  }

  private place(v: HTMLVideoElement, t: number) {
    if (v.readyState < 1) return;
    const d = Number.isFinite(v.duration) ? v.duration : t;
    v.currentTime = Math.min(t, Math.max(0, d - 0.02));
  }

  private emit() {
    for (const fn of this.subs) fn(this.t, this.playing);
  }

  private frame = () => {
    if (!this.playing) return;
    this.raf = requestAnimationFrame(this.frame);
    const lead = this.vids.find((v) => v.readyState >= 2) ?? this.vids[0];
    if (!lead) return;
    if (lead.paused && lead.readyState >= 2) lead.play().catch(() => {});
    const t = lead.currentTime;
    const end = this.duration || lead.duration;
    if (lead.ended || (end && t >= end - 0.03)) {
      if (this.loop && this.hold > 0) {
        stopFrame(this.raf);
        this.t = end;
        this.emit();
        this.holdTimer = setTimeout(() => {
          if (this.playing) this.play();
        }, this.hold);
      } else if (this.loop) {
        this.seek(0);
        for (const v of this.vids) v.play().catch(() => {});
      } else {
        this.t = end;
        this.pause();
      }
      return;
    }
    this.t = t;
    for (const v of this.vids) {
      if (v === lead || v.readyState < 2) continue;
      if (Math.abs(v.currentTime - t) > 0.12) v.currentTime = t;
      if (v.paused) v.play().catch(() => {});
    }
    this.emit();
  };
}

/** Run `fn(true/false)` as the node enters/leaves the viewport. */
export function onVisible(node: Element, fn: (visible: boolean) => void, threshold = 0.25) {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => fn(e.isIntersecting)), { threshold });
  io.observe(node);
  return () => io.disconnect();
}

export const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
