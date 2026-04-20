<script>
    import ConfluenceExplorer from '$lib/components/ConfluenceExplorer.svelte';

    export let data;
  </script>

  <svelte:head>
    <title>Content Explorer</title>
  </svelte:head>

  <ConfluenceExplorer user={data.user} />