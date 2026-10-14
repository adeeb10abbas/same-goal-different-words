type Listener = (t: number, playing: boolean) => void;

const stopFrame = (id: number) => {
  if (id && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(id);
};

/** On its last frame. A shorter video rests there while longer ones finish. */
const atEnd = (v: HTMLVideoElement) =>
  Number.isFinite(v.duration) && v.duration > 0 && v.currentTime >= v.duration - 0.05;

/** Seconds of media buffered contiguously past the current position. */
const ahead = (v: HTMLVideoElement) => {
  const t = v.currentTime;
  const b = v.buffered;
  for (let i = 0; i < b.length; i++) if (b.start(i) <= t + 0.05 && b.end(i) > t) return b.end(i) - t;
  return 0;
};

/**
 * Keeps several <video> elements on one clock. The first unfinished video leads; followers are nudged
 * back when they drift. Seeking and pausing apply to all of them. If any video runs out of downloaded
 * data, the whole group holds its frame and resumes together once each has some playback buffered,
 * so a slow connection pauses the videos instead of making the others run ahead and jump.
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
  /** Holding every video until all have enough data buffered. */
  private buffering = false;
  /** Stalls during playback so far; each one doubles the playback buffered before resuming. */
  private stalls = 0;
  private have = 0;
  private grewAt = 0;

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
      if (this.playing && !this.buffering && !atEnd(v)) v.play().catch(() => {});
      this.emit();
    };
    v.addEventListener('loadedmetadata', meta);
    if (v.readyState >= 1) meta();
    else if (this.playing && !this.buffering) v.play().catch(() => {});
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
    if (!this.buffering) for (const v of this.vids) if (!atEnd(v)) v.play().catch(() => {});
    stopFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
    this.emit();
  }

  pause() {
    clearTimeout(this.holdTimer);
    this.playing = false;
    this.buffering = false;
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

  /** Out of downloaded data (or metadata) before its end. */
  private lacking(v: HTMLVideoElement) {
    return !atEnd(v) && (v.readyState < 3 || !(v.duration > 0));
  }

  /** Cannot keep playing right now. */
  private starved(v: HTMLVideoElement) {
    return v.seeking || this.lacking(v);
  }

  /** Has `want` seconds of media buffered ahead (or nearly everything up to its end). */
  private primed(v: HTMLVideoElement, want: number) {
    if (this.starved(v)) return false;
    return atEnd(v) || ahead(v) >= Math.min(want, v.duration - v.currentTime - 0.3);
  }

  private frame = () => {
    if (!this.playing) return;
    this.raf = requestAnimationFrame(this.frame);
    // Lazy videos without a source yet, and failed ones, must not hold up the rest.
    const vids = this.vids.filter((v) => v.currentSrc && !v.error);
    if (!vids.length) return;
    if (this.buffering) {
      // One second of playback, doubling after each stall (up to 8 s), so a slow connection gets a few
      // longer pauses instead of constant stutter.
      const want = Math.max(0.5, Math.min(8, 2 ** this.stalls) * this.rate);
      const now = performance.now();
      const have = vids.reduce((s, v) => s + ahead(v), 0);
      if (have > this.have + 0.01) {
        this.have = have;
        this.grewAt = now;
      }
      // Some browsers stop downloading paused media: if nothing arrives for 2 s, play what is there.
      const stuck = now - this.grewAt > 2000 && !vids.some((v) => this.starved(v));
      if (stuck || vids.every((v) => this.primed(v, want))) {
        this.buffering = false;
        for (const v of vids) if (!atEnd(v)) v.play().catch(() => {});
        return;
      }
      // Hold the videos that have data. One still missing data stays unpaused so it keeps downloading.
      for (const v of vids) {
        if (this.lacking(v)) {
          if (v.paused) v.play().catch(() => {});
        } else if (!v.paused) v.pause();
      }
      return;
    }
    if (vids.some((v) => this.starved(v))) {
      if (this.t > 0 && !vids.some((v) => v.seeking)) this.stalls++;
      this.buffering = true;
      this.have = -1;
      this.grewAt = performance.now();
      for (const v of vids) if (!this.lacking(v)) v.pause();
      return;
    }
    const lead = vids.find((v) => !atEnd(v)) ?? vids[0];
    if (lead.paused && !atEnd(lead)) lead.play().catch(() => {});
    const t = lead.currentTime;
    const end = this.duration || lead.duration;
    if (atEnd(lead) || (end && t >= end - 0.03)) {
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
    for (const v of vids) {
      if (v === lead || atEnd(v)) continue;
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
