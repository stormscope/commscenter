<script lang="ts">
  import { page } from '$app/state';
</script>

<h1>Something went wrong</h1>
<p class="error">{page.status}: {page.error?.message}</p>
<p class="muted">
  Usually this means the admin UI can't reach Twilio or its <code>.env</code> is out of date. Run
  <code>pnpm infra:env</code> and restart with <code>pnpm admin</code>.
</p>
