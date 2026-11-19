<script lang="ts">
  import { page } from '$app/state';
  let { children } = $props();
  const links = [
    { href: '/', label: 'Status' },
    { href: '/settings', label: 'Settings' },
    { href: '/calls', label: 'Calls' },
    { href: '/voicemail', label: 'Voicemail' },
  ];
</script>

<header>
  <strong>CommsCentral</strong>
  <nav>
    {#each links as link (link.href)}
      <a href={link.href} aria-current={page.url.pathname === link.href ? 'page' : undefined}>
        {link.label}
      </a>
    {/each}
  </nav>
</header>

<main>
  {@render children()}
</main>

<style>
  :global(:root) {
    --bg: #fafafa;
    --fg: #1a1a1a;
    --muted: #666;
    --line: #ddd;
    --accent: #2457d6;
    --bad: #b3261e;
    --good: #1e7a3c;
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :global(:root) {
      --bg: #141414;
      --fg: #eee;
      --muted: #999;
      --line: #333;
      --accent: #7aa2ff;
      --bad: #ff8a80;
      --good: #7bd88f;
    }
  }
  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font:
      15px/1.5 system-ui,
      sans-serif;
  }
  :global(table) {
    width: 100%;
    border-collapse: collapse;
  }
  :global(th),
  :global(td) {
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
  }
  :global(th) {
    color: var(--muted);
    font-weight: 500;
  }
  :global(.muted) {
    color: var(--muted);
  }
  :global(.error) {
    color: var(--bad);
  }
  :global(.ok) {
    color: var(--good);
  }
  :global(button) {
    font: inherit;
    padding: 6px 14px;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: white;
    border-radius: 6px;
    cursor: pointer;
  }
  :global(button.secondary) {
    background: transparent;
    color: var(--accent);
  }
  :global(input),
  :global(select),
  :global(textarea) {
    font: inherit;
    padding: 5px 8px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    max-width: 100%;
    box-sizing: border-box;
  }
  header {
    display: flex;
    gap: 24px;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line);
    flex-wrap: wrap;
  }
  nav {
    display: flex;
    gap: 16px;
  }
  nav a {
    color: var(--muted);
    text-decoration: none;
  }
  nav a[aria-current='page'] {
    color: var(--fg);
    font-weight: 600;
  }
  main {
    max-width: 960px;
    margin: 0 auto;
    padding: 16px;
    overflow-x: auto;
  }
</style>
