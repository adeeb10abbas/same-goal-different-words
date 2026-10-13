import { SyncClock, onVisible, reducedMotion } from './sync';

/** A SyncClock plus reactive playback state for Svelte components. */
export function createClock(rate = 1, hold = 0) {
  const clock = new SyncClock();
  clock.setRate(rate);
  clock.hold = hold;
  const state = $state({ t: 0, playing: false, dur: 0 });
  const unsub = clock.subscribe((t, playing) => {
    state.t = t;
    state.playing = playing;
    state.dur = clock.duration;
  });
  return {
    clock,
    state,
    destroy() {
      unsub();
      clock.destroy();
    },
  };
}

/** Attachment: play while the node is on screen (unless reduced motion or `allow()` is false), pause otherwise. */
export function autoplay(clock: SyncClock, allow: () => boolean = () => true, threshold = 0.3) {
  return (node: Element) =>
    onVisible(
      node,
      (visible) => {
        if (visible && allow() && !reducedMotion()) clock.play();
        else if (!visible && clock.playing) clock.pause();
      },
      threshold,
    );
}
