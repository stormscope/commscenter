<script lang="ts">
  import { enhance } from '$app/forms';
  let { data, form } = $props();
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('de-CH') : '');
  const dur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const total = $derived(data.calls.reduce((sum, c) => sum + (c.price ?? 0), 0));
</script>

<h1>Calls</h1>
<p class="muted">
  Last {data.calls.length} call legs. A forwarded or app call has two legs (in and out), each billed.
  Total shown: {total.toFixed(2)} USD.
</p>

{#if form?.blocked}<p class="ok">Blocked {form.blocked}. They now hear a busy signal.</p>{/if}
{#if form?.error}<p class="error">{form.error}</p>{/if}

<table>
  <thead>
    <tr>
      <th>When</th><th>From</th><th>To</th><th>Direction</th><th>Status</th><th>Length</th><th>
        Cost
      </th><th></th>
    </tr>
  </thead>
  <tbody>
    {#each data.calls as c (c.sid)}
      <tr>
        <td>{fmt(c.start)}</td>
        <td>{c.from}</td>
        <td>{c.to}</td>
        <td>{c.parent ? '  ↳ ' : ''}{c.direction}</td>
        <td>{c.status}</td>
        <td>{dur(c.duration)}</td>
        <td>{c.price === null ? '' : `${c.price.toFixed(3)} ${c.unit?.toUpperCase() ?? ''}`}</td>
        <td>
          {#if c.direction === 'inbound' && !c.parent}
            <form method="POST" action="?/block" use:enhance>
              <input type="hidden" name="number" value={c.from} />
              <button class="secondary" title="Block {c.from}">Block</button>
            </form>
          {/if}
        </td>
      </tr>
    {:else}
      <tr><td colspan="8" class="muted">No calls yet.</td></tr>
    {/each}
  </tbody>
</table>
