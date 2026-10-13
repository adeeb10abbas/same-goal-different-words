<script lang="ts">
  import { SITE } from '../lib/site';
  import { href } from '../lib/media';

  const H = 26;
</script>

<!-- The affiliation text sits just above, so the logos are decorative. -->
<div class="logos" aria-hidden="true">
  {#each SITE.logos as l (l.src)}
    <img src={href(l.src)} alt="" width={Math.round(H * l.ratio)} height={H} decoding="async" />
  {/each}
</div>

<style>
  .logos {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 26px;
    margin-top: 18px;
  }

  img {
    display: block;
    width: auto;
    height: 26px;
    filter: brightness(0) invert(1);
    opacity: 0.72;
  }

  @media (max-width: 600px) {
    .logos {
      gap: 10px 18px;
      margin-top: 14px;
    }

    img {
      height: 22px;
    }
  }

  @media (max-width: 359px) {
    .logos {
      gap: 8px 14px;
    }

    img {
      height: 20px;
    }
  }
</style>
