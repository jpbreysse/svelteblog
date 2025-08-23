<script>
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';
	
	export let data;
	
	async function logout() {
	  try {
		const response = await fetch('/api/logout', { method: 'POST' });
		if (response.ok) {
		  // Clear local data and redirect
		  await invalidateAll();
		  goto('/');
		} else {
		  console.error('Logout failed');
		}
	  } catch (error) {
		console.error('Logout error:', error);
		// Even if API fails, clear local state
		goto('/');
	  }
	}
  </script>
  
  <nav class="navbar">
	<div class="nav-brand">
	  <a href="/">UserApp</a>
	</div>
	
	<div class="nav-links">
	  {#if data.user}
		<span class="user-info">Welcome, {data.user.first_name}!</span>
		{#if data.user.role === 'admin'}
		  <a href="/admin" class:active={$page.url.pathname === '/admin'}>Admin Panel</a>
		{/if}
		<button on:click={logout} class="logout-btn">Logout</button>
	  {:else}
		<a href="/login" class:active={$page.url.pathname === '/login'}>Sign In</a>
		<a href="/register" class:active={$page.url.pathname === '/register'}>Register</a>
	  {/if}
	</div>
  </nav>
  
  <main>
	<slot />
  </main>
  
  <style>
	:global(body) {
	  margin: 0;
	  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
	  background-color: #f5f5f5;
	}
	
	.navbar {
	  background: #2563eb;
	  color: white;
	  padding: 1rem 2rem;
	  display: flex;
	  justify-content: space-between;
	  align-items: center;
	  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}
	
	.nav-brand a {
	  color: white;
	  text-decoration: none;
	  font-size: 1.5rem;
	  font-weight: bold;
	}
	
	.nav-links {
	  display: flex;
	  gap: 1rem;
	  align-items: center;
	}
	
	.user-info {
	  color: #e0e7ff;
	  font-size: 0.875rem;
	  margin-right: 0.5rem;
	}
	
	.nav-links a, .logout-btn {
	  color: white;
	  text-decoration: none;
	  padding: 0.5rem 1rem;
	  border: 1px solid transparent;
	  border-radius: 4px;
	  background: transparent;
	  cursor: pointer;
	  font-size: 0.875rem;
	  font-family: inherit;
	  transition: all 0.2s;
	}
	
	.nav-links a:hover, .logout-btn:hover {
	  background: rgba(255, 255, 255, 0.1);
	}
	
	.nav-links a.active {
	  background: rgba(255, 255, 255, 0.2);
	  border-color: rgba(255, 255, 255, 0.3);
	}
	
	.logout-btn {
	  border: 1px solid rgba(255, 255, 255, 0.3);
	  font-weight: 500;
	}
	
	.logout-btn:hover {
	  background: rgba(255, 255, 255, 0.15);
	  border-color: rgba(255, 255, 255, 0.5);
	}
	
	.logout-btn:active {
	  background: rgba(255, 255, 255, 0.2);
	}
	
	main {
	  max-width: 1200px;
	  margin: 2rem auto;
	  padding: 0 2rem;
	}
	
	@media (max-width: 768px) {
	  .navbar {
		padding: 1rem;
		flex-wrap: wrap;
	  }
	  
	  .nav-links {
		gap: 0.5rem;
		flex-wrap: wrap;
	  }
	  
	  .nav-links a, .logout-btn {
		padding: 0.4rem 0.8rem;
		font-size: 0.8rem;
	  }
	  
	  .user-info {
		font-size: 0.75rem;
		margin-right: 0.25rem;
	  }
	  
	  main {
		padding: 0 1rem;
		margin: 1rem auto;
	  }
	}
  </style>