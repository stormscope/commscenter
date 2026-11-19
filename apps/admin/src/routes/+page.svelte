<script lang="ts">
  let { data } = $props();
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('de-CH') : '');
</script>

<h1>Status</h1>

{#if data.settingsError}
  <p class="error">Could not read settings: {data.settingsError}</p>
{/if}

<table>
  <tbody>
    <tr><th>Number</th><td>{data.info.number}</td></tr>
    <tr>
      <th>Incoming calls</th>
      <td>
        {#if data.settings?.inbound.mode === 'voicemail'}
          Straight to voicemail
        {:else if data.settings}
          Ring {data.settings.inbound.targets
            .filter((t) => t.enabled)
            .map((t) => (t.kind === 'sip' ? 'the app' : `mobile ${t.address}`))
            .join(' and ') || 'nothing (voicemail)'} for {data.settings.inbound.ringTimeoutSec} s, then
          voicemail
        {/if}
      </td>
    </tr>
    <tr>
      <th>Quiet hours</th>
      <td>
        {#if data.settings?.quietHours.enabled}
          {data.settings.quietHours.from} to {data.settings.quietHours.to}
          ({data.settings.quietHours.timeZone})
        {:else}
          Off
        {/if}
      </td>
    </tr>
    <tr>
      <th>Outbound caller ID</th>
      <td>
        {#if data.settings}
          {data.settings.owner.outboundCallerId === 'mobile'
            ? `Your mobile (${data.settings.owner.mobile})`
            : `CommsCentral number (${data.info.number})`}
        {/if}
      </td>
    </tr>
    <tr>
      <th>Allowed countries</th>
      <td>{data.settings?.outbound.allowedPrefixes.join(', ')}</td>
    </tr>
    <tr>
      <th>Spend this month</th>
      <td>
        {data.spend ? `${data.spend.amount.toFixed(2)} ${data.spend.unit.toUpperCase()}` : 'n/a'}
      </td>
    </tr>
    <tr><th>Voicemails today</th><td>{data.voicemailsToday ?? 'n/a'}</td></tr>
    <tr>
      <th>Phone app</th>
      <td>
        {data.info.sipUsername}@{data.info.sipDomain}
        <span class="muted">(password: pnpm infra:sip-creds)</span>
      </td>
    </tr>
    <tr>
      <th>Travel mode</th>
      <td>On: <code>**21*{data.info.number}#</code> &nbsp; Off: <code>##21#</code></td>
    </tr>
  </tbody>
</table>

<h2>Recent calls</h2>
<table>
  <thead><tr><th>When</th><th>From</th><th>To</th><th>Status</th></tr></thead>
  <tbody>
    {#each data.recentCalls as call (call.sid)}
      <tr>
        <td>{fmt(call.start)}</td><td>{call.from}</td><td>{call.to}</td><td>{call.status}</td>
      </tr>
    {:else}
      <tr><td colspan="4" class="muted">No calls yet.</td></tr>
    {/each}
  </tbody>
</table>
