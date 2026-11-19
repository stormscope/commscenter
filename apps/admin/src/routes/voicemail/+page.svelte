<script lang="ts">
  import { enhance } from '$app/forms';
  let { data } = $props();
  const fmt = (iso: string) => new Date(iso).toLocaleString('de-CH');
  const dur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
</script>

<h1>Voicemail</h1>

<table>
  <thead><tr><th>When</th><th>From</th><th>Length</th><th>Play</th><th></th></tr></thead>
  <tbody>
    {#each data.voicemails as v (v.sid)}
      <tr>
        <td>{fmt(v.date)}</td>
        <td>{v.from}</td>
        <td>{dur(v.duration)}</td>
        <td><audio controls preload="none" src={`/voicemail/${v.sid}/audio`}></audio></td>
        <td>
          <form method="POST" action="?/delete" use:enhance>
            <input type="hidden" name="sid" value={v.sid} />
            <button class="secondary">Delete</button>
          </form>
        </td>
      </tr>
    {:else}
      <tr><td colspan="5" class="muted">No voicemails.</td></tr>
    {/each}
  </tbody>
</table>
