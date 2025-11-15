<script>
    import PathManager from '$lib/components/PathManager.svelte';
  </script>
  
  <svelte:head>
    <title>Manage Folders - Admin</title>
  </svelte:head>
  
  <div class="admin-page">
    <header class="page-header">
      <h1>📁 Folder Management</h1>
      <p>Organize your content with hierarchical folders</p>
    </header>
    
    <PathManager />
  </div>
  
  <style>
    .admin-page {
      min-height: 100vh;
      padding: 2rem;
      background-color: #f9fafb;
    }
    
    .page-header {
      margin-bottom: 2rem;
    }
    
    .page-header h1 {
      font-size: 2rem;
      margin: 0 0 0.5rem 0;
    }
    
    .page-header p {
      color: #6b7280;
      margin: 0;
    }
  </style>