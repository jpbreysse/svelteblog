<script>
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';
	import { PUBLIC_APP_NAME } from '$env/static/public';
	
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
	  <a href="/">{PUBLIC_APP_NAME}</a>
	</div>
	
	<div class="nav-links">
	  {#if data.user}
		<!-- Links for logged-in users -->
		<a href="/blog" class:active={$page.url.pathname === '/blog'}>📝 Blog</a>
		<a href="/about" class:active={$page.url.pathname === '/about'}>ℹ️ About</a>
		<span class="user-info">Welcome, {data.user.display_name}!</span>
		<a href="/profile" class:active={$page.url.pathname === '/profile'}>👤 Profile</a>
		{#if data.user.role === 'admin'}
		  <a href="/admin" class:active={$page.url.pathname === '/admin'}>⚙️ Admin Panel</a>
		{/if}
		<button on:click={logout} class="logout-btn">🚪 Logout</button>
	  {:else}
		<!-- Links for non-logged-in users -->
		<a href="/blog" class:active={$page.url.pathname === '/blog'}>📝 Blog</a>
		<a href="/about" class:active={$page.url.pathname === '/about'}>ℹ️ About</a>
		<a href="/login" class:active={$page.url.pathname === '/login'}>🔐 Sign In</a>
		<a href="/register" class:active={$page.url.pathname === '/register'}>📝 Register</a>
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
	  flex-wrap: wrap;
	}
	
	.user-info {
	  color: white;
	  font-size: 0.875rem;
	  margin: 0 0.5rem;
	  font-weight: 500;
	  background: rgba(255, 255, 255, 0.1);
	  padding: 0.25rem 0.75rem;
	  border-radius: 12px;
	  border: 1px solid rgba(255, 255, 255, 0.2);
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
	  white-space: nowrap;
	}
	
	.nav-links a:hover, .logout-btn:hover {
	  background: rgba(255, 255, 255, 0.1);
	}
	
	.nav-links a.active {
	  background: rgba(255, 255, 255, 0.2);
	  border-color: rgba(255, 255, 255, 0.3);
	  font-weight: 600;
	}
	
	.logout-btn {
	  border: 1px solid rgba(255, 255, 255, 0.3);
	  font-weight: 500;
	  background: rgba(220, 38, 38, 0.2);
	}
	
	.logout-btn:hover {
	  background: rgba(220, 38, 38, 0.3);
	  border-color: rgba(255, 255, 255, 0.5);
	}
	
	.logout-btn:active {
	  background: rgba(220, 38, 38, 0.4);
	}
	
	main {
	  max-width: 1200px;
	  margin: 2rem auto;
	  padding: 0 2rem;
	}
	
	@media (max-width: 768px) {
	  .navbar {
		padding: 1rem;
		flex-direction: column;
		gap: 1rem;
	  }
	  
	  .nav-brand {
		align-self: flex-start;
	  }
	  
	  .nav-links {
		gap: 0.5rem;
		flex-wrap: wrap;
		justify-content: center;
		width: 100%;
	  }
	  
	  .nav-links a, .logout-btn {
		padding: 0.4rem 0.8rem;
		font-size: 0.8rem;
	  }
	  
	  .user-info {
		font-size: 0.75rem;
		margin: 0.25rem;
		padding: 0.2rem 0.5rem;
	  }
	  
	  main {
		padding: 0 1rem;
		margin: 1rem auto;
	  }
	}
	
	@media (max-width: 480px) {
	  .nav-links {
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
	  }
	  
	  .nav-links a, .logout-btn {
		width: 100%;
		text-align: center;
	  }
	  
	  .user-info {
		order: -1;
		width: fit-content;
		align-self: center;
	  }
	}
  </style>