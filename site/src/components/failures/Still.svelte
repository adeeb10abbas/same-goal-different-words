<script lang="ts">
  import { onMount } from 'svelte';

  /** One recorded frame: a paused, muted video seeked to `t` (s). The source loads only when the still nears the viewport. */
  let {
    src,
    t,
    poster = '',
    aspect,
    label,
    chip = '',
  }: { src: string; t: number; poster?: string; aspect: string; label: string; chip?: string } = $props();

  let box: HTMLDivElement;
  let video = $state<HTMLVideoElement>();
  let near = $state(false);
  let ready = $state(false);

  onMount(() => {
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          near = true;
          io.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    io.observe(box);
    return () => io.disconnect();
  });

  $effect(() => {
    src;
    ready = false;
  });

  $effect(() => {
    if (!video || !ready) return;
    const d = video.duration;
    const target = Number.isFinite(d) ? Math.max(0, Math.min(t, d - 0.02)) : t;
    if (Math.abs(video.currentTime - target) > 1e-3) video.currentTime = target;
  });
</script>

<div class="still" bind:this={box} style:aspect-ratio={aspect}>
  {#key src}
    <video
      bind:this={video}
      src={near ? src : undefined}
      poster={poster || undefined}
      preload={near ? 'auto' : 'none'}
      muted
      playsinline
      disablepictureinpicture
      disableremoteplayback
      tabindex="-1"
      aria-label={label}
      onloadedmetadata={() => (ready = true)}
    ></video>
  {/key}
  {#if chip}<span class="t" data-qa-overlay>{chip}</span>{/if}
</div>

<style>
  .still {
    position: relative;
    width: 100%;
    border-radius: 10px;
    overflow: hidden;
    background: #000;
  }

  video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .t {
    position: absolute;
    top: 8px;
    left: 8px;
    padding: 2px 7px;
    border-radius: 6px;
    background: rgb(13 15 19 / 80%);
    color: #e7eaef;
    font-family: var(--mono);
    font-size: 0.7rem;
    line-height: 1.35;
    letter-spacing: 0.02em;
    white-space: nowrap;
    pointer-events: none;
  }
</style>
