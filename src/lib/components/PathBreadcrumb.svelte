<script>
    import { createEventDispatcher } from 'svelte';
    
    export let breadcrumbs = []; // Array from pathsDB.getBreadcrumbs()
    export let showHome = true;
    
    const dispatch = createEventDispatcher();
    
    function navigate(path) {
      dispatch('navigate', path);
    }
  </script>
  
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <ol class="breadcrumb-list">
      {#if showHome}
        <li class="breadcrumb-item">
          <button class="breadcrumb-link home" on:click={() => navigate(null)}>
            🏠 Home
          </button>
        </li>
      {/if}
      
      {#each breadcrumbs as crumb, index}
        <li class="breadcrumb-item">
          <span class="breadcrumb-separator">/</span>
          <button 
            class="breadcrumb-link"
            class:current={index === breadcrumbs.length - 1}
            on:click={() => navigate(crumb)}
          >
            {crumb.name}
          </button>
        </li>
      {/each}
    </ol>
  </nav>
  
  <style>
    .breadcrumb {
      font-size: 0.875rem;
      color: #6b7280;
    }
    
    .breadcrumb-list {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      list-style: none;
      padding: 0;
      margin: 0;
      flex-wrap: wrap;
    }
    
    .breadcrumb-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .breadcrumb-separator {
      color: #d1d5db;
    }
    
    .breadcrumb-link {
      background: none;
      border: none;
      padding: 0.25rem 0.5rem;
      cursor: pointer;
      color: #6b7280;
      border-radius: 0.25rem;
      transition: all 0.15s ease;
      text-decoration: none;
    }
    
    .breadcrumb-link:hover {
      color: #374151;
      background-color: rgba(0, 0, 0, 0.05);
    }
    
    .breadcrumb-link.home {
      font-weight: 500;
    }
    
    .breadcrumb-link.current {
      color: #111827;
      font-weight: 600;
      cursor: default;
    }
    
    .breadcrumb-link.current:hover {
      background: none;
    }
    
    @media (prefers-color-scheme: dark) {
      .breadcrumb-link:hover {
        background-color: rgba(255, 255, 255, 0.05);
      }
    }
  </style>