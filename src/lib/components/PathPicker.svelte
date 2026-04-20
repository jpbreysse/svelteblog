<script>
    import { onMount } from 'svelte';
    import { createEventDispatcher } from 'svelte';
    
    export let selectedPathId = null;
    export let placeholder = 'Select a folder...';
    export let allowNull = true;
    export let flatPaths = [];
    
    const dispatch = createEventDispatcher();
    
    let loading = true;
    
    onMount(async () => {
      if (flatPaths.length === 0) {
        await loadPaths();
      }
      loading = false;
    });
    
    async function loadPaths() {
      try {
        const response = await fetch('/api/paths?format=flat');
        const data = await response.json();
        if (data.success) {
          flatPaths = data.paths;
        }
      } catch (error) {
        console.error('Error loading paths:', error);
      }
    }
    
    function handleChange(event) {
      const value = event.target.value;
      selectedPathId = value === '' ? null : parseInt(value);
      dispatch('change', selectedPathId);
    }
    
    function getDisplayName(path) {
      const indent = '  '.repeat(path.level - 1);
      return `${indent}${path.icon || '📁'} ${path.name}`;
    }
  </script>
  
  <div class="path-picker">
    {#if loading}
      <select disabled class="path-select">
        <option>Loading...</option>
      </select>
    {:else}
      <select 
        class="path-select" 
        value={selectedPathId || ''}
        on:change={handleChange}
      >
        {#if allowNull}
          <option value="">{placeholder}</option>
        {/if}
        
        {#each flatPaths as path}
          <option value={path.id}>
            {getDisplayName(path)}
          </option>
        {/each}
      </select>
    {/if}
  </div>
  
  <style>
    .path-picker {
      width: 100%;
    }
    
    .path-select {
      width: 100%;
      padding: 0.5rem 0.75rem;
      font-size: 0.875rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      background-color: white;
      cursor: pointer;
      transition: border-color 0.15s ease;
    }
    
    .path-select:hover {
      border-color: #9ca3af;
    }
    
    .path-select:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }
    
    .path-select:disabled {
      background-color: #f3f4f6;
      cursor: not-allowed;
    }
    
    .path-select option {
      padding: 0.5rem;
    }
  </style>