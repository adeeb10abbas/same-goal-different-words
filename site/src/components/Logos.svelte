<script lang="ts">
  import { SITE } from '../lib/site';
  import { href } from '../lib/media';

  const H = 42;
</script>

<!-- The affiliation text sits just above, so the logos are decorative. -->
<div class="logos" aria-hidden="true">
  {#each SITE.logos as l (l.src)}
    <img src={href(l.src)} alt="" width={Math.round(H * l.ratio)} height={H} style:--r={l.ratio} decoding="async" />
  {/each}
</div>

<style>
  .logos {
    --h: 42px;
    display: flex;
    align-items: center;
    gap: 38px;
    margin-top: 22px;
  }

  /* Widths follow each logo's aspect ratio, so in a column narrower than the row both logos shrink by the same
     fraction and stay on one line at equal heights. */
  img {
    display: block;
    flex: 0 1 auto;
    min-width: 0;
    width: calc(var(--h) * var(--r));
    height: auto;
    filter: brightness(0) invert(1);
    opacity: 0.72;
  }

  @media (max-width: 600px) {
    .logos {
      --h: 34px;
      gap: 30px;
      margin-top: 18px;
    }
  }

  @media (max-width: 359px) {
    .logos {
      --h: 30px;
      gap: 24px;
    }
  }
</style>
