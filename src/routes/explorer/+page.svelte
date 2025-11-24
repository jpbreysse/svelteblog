<script>
    import PathExplorer from '$lib/components/PathExplorer.svelte';

    export let data;
  </script>

  <svelte:head>
    <title>Content Explorer</title>
  </svelte:head>

  <PathExplorer showPostsList={true} user={data.user} />