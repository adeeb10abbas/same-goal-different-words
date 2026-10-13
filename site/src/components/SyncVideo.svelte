<script lang="ts">
  import type { SyncClock } from '../lib/sync';

  /** Crop window in source pixels: [x, y, w, h, sourceW, sourceH]. The parent box should use aspect-ratio w / h. */
  type Crop = [number, number, number, number, number, number];

  let {
    clock,
    src,
    poster = '',
    label = '',
    lazy = true,
    crop = null,
  }: { clock: SyncClock; src: string; poster?: string; label?: string; lazy?: boolean; crop?: Crop | null } = $props();

  let v: HTMLVideoElement;
  let seen = $state(false);
  const near = $derived(seen || !lazy);

  $effect(() => clock.add(v));

  $effect(() => {
    if (near) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          seen = true;
          io.disconnect();
        }
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(v);
    return () => io.disconnect();
  });

  const place = $derived.by(() => {
    if (!crop) return '';
    const [x, y, w, h, W, H] = crop;
    return `position:absolute;width:${(W / w) * 100}%;height:${(H / h) * 100}%;left:${(-x / w) * 100}%;top:${(-y / h) * 100}%;max-width:none`;
  });
</script>

<video
  bind:this={v}
  src={near ? src : undefined}
  {poster}
  muted
  playsinline
  preload={near ? 'auto' : 'none'}
  aria-label={label}
  disablepictureinpicture
  style={place}
></video>

<style>
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: #000;
  }
</style>
