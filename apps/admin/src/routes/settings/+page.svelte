<script lang="ts">
  import { enhance } from '$app/forms';
  let { data, form } = $props();
  const s = $derived(data.settings);
  const ringApp = $derived(s?.inbound.targets.some((t) => t.kind === 'sip' && t.enabled) ?? true);
  const ringMobile = $derived(
    s?.inbound.targets.some((t) => t.kind === 'pstn' && t.enabled) ?? false,
  );
  const greeting = $derived(s?.voicemail.greeting.kind === 'tts' ? s.voicemail.greeting : null);
  const zones = [
    'Europe/Zurich',
    'Europe/Stockholm',
    'Europe/Istanbul',
    'Europe/London',
    'America/New_York',
    'Asia/Dubai',
    'Asia/Singapore',
  ];
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
</script>

<h1>Settings</h1>

{#if !s}
  <p class="error">The stored settings are not valid. Raw value:</p>
  <pre>{data.raw}</pre>
{:else}
  {#if form?.saved}<p class="ok">Saved. Takes effect on the next call.</p>{/if}
  {#if form?.errors}
    <ul class="error">
      {#each form.errors as e (e)}<li>{e}</li>{/each}
    </ul>
  {/if}

  <form
    method="POST"
    use:enhance={() =>
      ({ update }) =>
        update({ reset: false })}
  >
    <fieldset>
      <legend>Incoming calls</legend>
      <label>
        <input type="radio" name="mode" value="ring" checked={s.inbound.mode === 'ring'} /> Ring
      </label>
      <label>
        <input
          type="radio"
          name="mode"
          value="voicemail"
          checked={s.inbound.mode === 'voicemail'}
        />
        Straight to voicemail
      </label>
      <p>
        <label>
          <input type="checkbox" name="ringApp" checked={ringApp} /> Ring the phone app
        </label><br />
        <label>
          <input type="checkbox" name="ringMobile" checked={ringMobile} /> Also ring my mobile SIM ({s
            .owner.mobile}), with "press 1 to accept"
        </label>
        <br /><span class="muted">
          Costs about 0.18 USD/min when answered. Leave off while travel mode forwarding is on.
        </span>
      </p>
      <label>
        Ring for
        <input
          type="number"
          name="ringTimeoutSec"
          min="5"
          max="120"
          value={s.inbound.ringTimeoutSec}
        />
        seconds, then voicemail
      </label>
    </fieldset>

    <fieldset>
      <legend>Outbound calls from the app</legend>
      <label>
        Caller ID
        <select name="outboundCallerId">
          <option value="mobile" selected={s.owner.outboundCallerId === 'mobile'}>
            My mobile ({s.owner.mobile}), must be verified
          </option>
          <option value="twilio" selected={s.owner.outboundCallerId === 'twilio'}>
            The CommsCentral number
          </option>
        </select>
      </label>
      <p>
        <label>
          Allowed country prefixes<br />
          <input name="allowedPrefixes" size="40" value={s.outbound.allowedPrefixes.join(', ')} />
        </label>
        <br /><span class="muted">
          Countries also have to be enabled in Twilio's geo permissions, which
          <code>pnpm bootstrap</code> manages.
        </span>
      </p>
    </fieldset>

    <fieldset>
      <legend>Voicemail</legend>
      <label>
        Greeting<br />
        <textarea name="greetingText" rows="3" cols="60">{greeting?.text ?? ''}</textarea>
      </label>
      <p>
        <label>
          Language <input name="greetingLanguage" size="8" value={greeting?.language ?? 'en-GB'} />
        </label>
        <label>
          Voice <input name="greetingVoice" size="16" value={greeting?.voice ?? 'Polly.Amy'} />
        </label>
        <br /><span class="muted">
          For example de-CH with Polly.Marlene, en-GB with Polly.Amy, sv-SE with Polly.Astrid.
        </span>
      </p>
      <label>
        Max length
        <input
          type="number"
          name="maxLengthSec"
          min="10"
          max="600"
          value={s.voicemail.maxLengthSec}
        />
        seconds
      </label>
      <p>
        <label>
          Email to
          <input type="email" name="notifyEmail" size="30" value={s.voicemail.notify.email ?? ''} />
        </label>
        <br />
        <label>
          <input type="checkbox" name="notifySms" checked={s.voicemail.notify.sms} /> Also send an SMS
        </label>
        <span class="muted">(SMS is always used when email is off or fails)</span>
        <br />
        <label>
          <input type="checkbox" name="notifyMissed" checked={s.voicemail.notify.missedCalls} /> Tell
          me about missed calls without a message
        </label>
      </p>
    </fieldset>

    <fieldset>
      <legend>Quiet hours</legend>
      <label>
        <input type="checkbox" name="quietEnabled" checked={s.quietHours.enabled} /> Send calls straight
        to voicemail
      </label>
      from <input name="quietFrom" size="5" value={s.quietHours.from} />
      to <input name="quietTo" size="5" value={s.quietHours.to} />
      <p>
        <label>
          Time zone
          <input name="quietTimeZone" size="20" list="zones" value={s.quietHours.timeZone} />
        </label>
        <datalist id="zones">
          {#each zones as z (z)}<option value={z}></option>{/each}
        </datalist>
        <br /><span class="muted">
          Set this to where you are when travelling, e.g. Europe/Istanbul. Your browser says: {browserZone}
        </span>
      </p>
    </fieldset>

    <fieldset>
      <legend>Screening</legend>
      <label>
        Hidden numbers
        <select name="anonymous">
          <option value="ring" selected={s.screening.anonymous === 'ring'}>Ring as usual</option>
          <option value="voicemail" selected={s.screening.anonymous === 'voicemail'}>
            Straight to voicemail
          </option>
          <option value="reject" selected={s.screening.anonymous === 'reject'}>
            Reject (busy)
          </option>
        </select>
      </label>
      <p>
        <label>
          Blocked numbers or prefixes, one per line (they hear a busy signal)<br />
          <textarea name="blocked" rows="4" cols="30">{s.screening.blocked.join('\n')}</textarea>
        </label>
      </p>
    </fieldset>

    <button>Save</button>
  </form>
{/if}

<style>
  fieldset {
    border: 1px solid var(--line);
    border-radius: 8px;
    margin: 0 0 16px;
    padding: 12px 16px;
  }
  legend {
    font-weight: 600;
  }
</style>
