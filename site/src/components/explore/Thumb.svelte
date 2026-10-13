<script lang="ts">
  import type { Snippet } from 'svelte';
  import { lazySprite } from './sprite';

  /** A 12-frame sprite.webp strip, resting on the final frame. `--k` (0–11) on an ancestor picks the frame. An empty id
      renders the box without loading anything (hidden measurement probes). */
  let { id, dim = false, children }: { id: string; dim?: boolean; children?: Snippet } = $props();
</script>

<span class="thumb" class:dim data-strip>
  <i class="img" {@attach id ? lazySprite(id) : null}></i>
  {@render children?.()}
</span>

<style>
  .thumb {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 180 / 181;
    border-radius: 10px;
    overflow: hidden;
    background: #1b1f27;
    isolation: isolate;
  }

  .img {
    position: absolute;
    inset: 0;
    z-index: -1;
    background-repeat: no-repeat;
    background-size: 1200% 100%;
    background-position: calc(var(--k, 11) / 11 * 100%) 0;
    transition: filter 0.2s;
  }

  .dim .img {
    filter: grayscale(1) brightness(0.5);
  }

  /* Keyboard focus plays the strip slowly; a pointer scrub takes over while it moves. */
  :global(button:focus-visible) .img {
    animation: frames 4.8s steps(12, jump-none) infinite;
  }

  :global([data-scrub][data-scrubbing]) .img {
    animation: none;
  }

  @keyframes frames {
    from {
      background-position: 0% 0;
    }

    to {
      background-position: 100% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(button:focus-visible) .img {
      animation: none;
    }
  }
</style>
