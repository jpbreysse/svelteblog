<script>
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';
	import { PUBLIC_APP_NAME } from '$env/static/public';

	export let data;

	let showUserMenu = false;
	let showAdminMenu = false;

	function closeMenus() {
		showUserMenu = false;
		showAdminMenu = false;
	}

	async function logout() {
		closeMenus();
		try {
			const response = await fetch('/api/logout', { method: 'POST' });
			if (response.ok) {
				await invalidateAll();
				goto('/');
			} else {
				console.error('Logout failed');
			}
		} catch (error) {
			console.error('Logout error:', error);
			goto('/');
		}
	}
</script>

<svelte:window on:click={closeMenus} />

<nav class="navbar">
	<div class="nav-brand">
		<a href="/">{PUBLIC_APP_NAME}</a>
	</div>

	<div class="nav-links">
		{#if data.user}
			<!-- Main navigation for logged-in users -->
			<a href="/blog" class:active={$page.url.pathname === '/blog'}>📰 Blog</a>
			<a href="/explorer" class:active={$page.url.pathname === '/explorer'}>📁 Folders</a>
			<a href="/groups" class:active={$page.url.pathname.startsWith('/groups')}>🔐 Access</a>
			<a href="/tickets" class:active={$page.url.pathname === '/tickets'}>🎫 Tickets</a>
			<a href="/chat" class:active={$page.url.pathname === '/chat'}>💬 Chat</a>

			{#if data.user.role === 'admin'}
				<!-- Admin dropdown -->
				<div class="dropdown">
					<button
						class="dropdown-toggle"
						class:active={$page.url.pathname.startsWith('/admin')}
						on:click|stopPropagation={() => { showAdminMenu = !showAdminMenu; showUserMenu = false; }}
					>
						⚙️ Admin ▾
					</button>
					{#if showAdminMenu}
						<div class="dropdown-menu">
							<a href="/admin" on:click={closeMenus}>📊 Dashboard</a>
							<a href="/admin/groups" on:click={closeMenus}>👥 Groups</a>
							<a href="/admin/paths" on:click={closeMenus}>📁 Paths</a>
							<a href="/admin/reports" on:click={closeMenus}>🚨 Reports</a>
						</div>
					{/if}
				</div>
			{/if}

			<!-- User dropdown -->
			<div class="dropdown">
				<button
					class="dropdown-toggle user-toggle"
					on:click|stopPropagation={() => { showUserMenu = !showUserMenu; showAdminMenu = false; }}
				>
					👤 {data.user.display_name} ▾
				</button>
				{#if showUserMenu}
					<div class="dropdown-menu">
						<a href="/profile" on:click={closeMenus}>👤 Profile</a>
						<a href="/about" on:click={closeMenus}>ℹ️ About</a>
						<hr />
						<button on:click={logout} class="dropdown-item logout">🚪 Logout</button>
					</div>
				{/if}
			</div>
		{:else}
			<!-- Links for non-logged-in users -->
			<a href="/blog" class:active={$page.url.pathname === '/blog'}>📰 Blog</a>
			<a href="/explorer" class:active={$page.url.pathname === '/explorer'}>📁 Folders</a>
			<a href="/about" class:active={$page.url.pathname === '/about'}>ℹ️ About</a>
			<a href="/login" class="nav-btn login-btn">🔐 Sign In</a>
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
		padding: 0.75rem 2rem;
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
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.nav-links a, .dropdown-toggle {
		color: white;
		text-decoration: none;
		padding: 0.5rem 0.875rem;
		border: 1px solid transparent;
		border-radius: 6px;
		background: transparent;
		cursor: pointer;
		font-size: 0.875rem;
		font-family: inherit;
		transition: all 0.2s;
		white-space: nowrap;
	}

	.nav-links a:hover, .dropdown-toggle:hover {
		background: rgba(255, 255, 255, 0.15);
	}

	.nav-links a.active, .dropdown-toggle.active {
		background: rgba(255, 255, 255, 0.2);
		border-color: rgba(255, 255, 255, 0.3);
		font-weight: 600;
	}

	.login-btn {
		background: rgba(255, 255, 255, 0.15);
		border: 1px solid rgba(255, 255, 255, 0.3);
	}

	/* Dropdown styles */
	.dropdown {
		position: relative;
	}

	.dropdown-toggle {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.user-toggle {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.dropdown-menu {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 0.5rem;
		background: white;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		min-width: 160px;
		z-index: 1000;
		overflow: hidden;
	}

	.dropdown-menu a, .dropdown-menu button.dropdown-item {
		display: block;
		width: 100%;
		padding: 0.75rem 1rem;
		color: #374151;
		text-decoration: none;
		font-size: 0.875rem;
		text-align: left;
		border: none;
		background: none;
		cursor: pointer;
		transition: background 0.2s;
	}

	.dropdown-menu a:hover, .dropdown-menu button.dropdown-item:hover {
		background: #f3f4f6;
	}

	.dropdown-menu hr {
		margin: 0.25rem 0;
		border: none;
		border-top: 1px solid #e5e7eb;
	}

	.dropdown-menu .logout {
		color: #dc2626;
	}

	.dropdown-menu .logout:hover {
		background: #fef2f2;
	}

	main {
		max-width: 1200px;
		margin: 2rem auto;
		padding: 0 2rem;
	}

	@media (max-width: 768px) {
		.navbar {
			padding: 0.75rem 1rem;
			flex-direction: column;
			gap: 0.75rem;
		}

		.nav-brand {
			align-self: flex-start;
		}

		.nav-links {
			gap: 0.375rem;
			flex-wrap: wrap;
			justify-content: center;
			width: 100%;
		}

		.nav-links a, .dropdown-toggle {
			padding: 0.4rem 0.6rem;
			font-size: 0.8rem;
		}

		main {
			padding: 0 1rem;
			margin: 1rem auto;
		}
	}

	@media (max-width: 480px) {
		.nav-links {
			flex-direction: column;
			gap: 0.375rem;
			width: 100%;
		}

		.nav-links a, .dropdown-toggle {
			width: 100%;
			text-align: center;
			justify-content: center;
		}

		.dropdown {
			width: 100%;
		}

		.dropdown-menu {
			left: 0;
			right: 0;
		}
	}
</style>
