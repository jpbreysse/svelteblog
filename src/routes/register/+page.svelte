<script>
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	
	export let form;
	export let data;
	
	// Redirect if already logged in  
	if (data.user) {
		goto('/');
	}
	
	let loading = false;
</script>

<svelte:head>
	<title>Register - UserApp</title>
</svelte:head>

<div class="register-container">
	<div class="register-card">
		<h1>Create Account</h1>
		<p>
			Please fill out the form below. Your account will need admin approval before you can log in.
		</p>
		
		{#if form?.error}
			<div class="error-banner">
				❌ {form.error}
			</div>
		{/if}
		
		{#if form?.success}
			<div class="success-banner">
				✅ {form.success}
			</div>
		{/if}
		
		<form
			method="POST"
			use:enhance={() => {
				loading = true;
				console.log('Form submitting...');
				return async ({ result }) => {
					loading = false;
					console.log('Result received:', result);
					if (result.type === 'redirect') {
						goto(result.location);
					}
				};
			}}
		>
			<div class="form-group">
				<label for="email">Email Address</label>
				<input type="email" id="email" name="email" required class:error={form?.errors?.email} />
				{#if form?.errors?.email}
					<span class="error-message">{form.errors.email}</span>
				{/if}
			</div>
			
			<div class="form-group">
				<label for="display_name">Display Name</label>
				<input
					type="text"
					id="display_name"
					name="display_name"
					required
					placeholder="How should we call you?"
					class:error={form?.errors?.display_name}
				/>
				{#if form?.errors?.display_name}
					<span class="error-message">{form.errors.display_name}</span>
				{/if}
				<small class="help-text">This is how your name will appear on your posts and profile.</small>
			</div>

			<div class="form-group">
				<label for="password">Password</label>
				<input
					type="password"
					id="password"
					name="password"
					required
					minlength="6"
					class:error={form?.errors?.password}
				/>
				{#if form?.errors?.password}
					<span class="error-message">{form.errors.password}</span>
				{/if}
			</div>

			<div class="form-group">
				<label for="confirm_password">Confirm Password</label>
				<input
					type="password"
					id="confirm_password"
					name="confirm_password"
					required
					class:error={form?.errors?.confirm_password}
				/>
				{#if form?.errors?.confirm_password}
					<span class="error-message">{form.errors.confirm_password}</span>
				{/if}
			</div>

			<button type="submit" disabled={loading} class="submit-btn">
				{loading ? 'Creating Account...' : 'Create Account'}
			</button>
		</form>

		<p class="login-link">
			Already have an account? <a href="/login">Sign in here</a>
		</p>
	</div>
</div>

<style>
	.register-container {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 80vh;
	}

	.register-card {
		background: white;
		padding: 2rem;
		border-radius: 8px;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		width: 100%;
		max-width: 500px;
	}

	h1 {
		text-align: center;
		color: #1f2937;
		margin-bottom: 0.5rem;
	}

	p {
		text-align: center;
		color: #6b7280;
		margin-bottom: 2rem;
	}
  
	.error-banner {
		background: #fee2e2;
		color: #991b1b;
		padding: 0.75rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
		text-align: center;
		font-size: 0.875rem;
		border: 1px solid #fca5a5;
	}
  
	.success-banner {
		background: #d1fae5;
		color: #065f46;
		padding: 0.75rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
		text-align: center;
		font-size: 0.875rem;
		border: 1px solid #a7f3d0;
	}

	.form-group {
		margin-bottom: 1.5rem;
	}

	label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
		color: #374151;
	}

	input {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		font-size: 1rem;
		box-sizing: border-box;
	}

	input:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	input.error {
		border-color: #ef4444;
	}

	.error-message {
		color: #ef4444;
		font-size: 0.875rem;
		margin-top: 0.25rem;
		display: block;
	}

	.help-text {
		color: #6b7280;
		font-size: 0.875rem;
		margin-top: 0.25rem;
		display: block;
	}

	.submit-btn {
		width: 100%;
		background: #2563eb;
		color: white;
		padding: 0.75rem;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.submit-btn:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.submit-btn:disabled {
		background: #9ca3af;
		cursor: not-allowed;
	}

	.login-link {
		text-align: center;
		margin-top: 1.5rem;
	}

	.login-link a {
		color: #2563eb;
		text-decoration: none;
	}

	.login-link a:hover {
		text-decoration: underline;
	}
</style>
