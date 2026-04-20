<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let countdown = 10;

	onMount(() => {
		const interval = setInterval(() => {
			countdown--;
			if (countdown === 0) {
				clearInterval(interval);
				goto('/blog');
			}
		}, 1000);

		return () => clearInterval(interval);
	});
</script>

<svelte:head>
	<title>Registration Successful - UserApp</title>
</svelte:head>

<div class="success-container">
	<div class="success-card">
		<div class="success-icon">
			✅
		</div>
		
		<h1>Account Created Successfully!</h1>
		
		<div class="success-message">
			<p>
				<strong>Thank you for registering!</strong>
			</p>
			<p>
				Your account has been created and is now <strong>pending admin approval</strong>. 
				You will be able to log in once an administrator approves your account.
			</p>
		</div>

		<div class="next-steps">
			<h2>What happens next?</h2>
			<div class="steps">
				<div class="step">
					<span class="step-number">1</span>
					<span class="step-text">Admin reviews your registration</span>
				</div>
				<div class="step">
					<span class="step-number">2</span>
					<span class="step-text">You'll be notified of approval status</span>
				</div>
				<div class="step">
					<span class="step-number">3</span>
					<span class="step-text">Once approved, you can log in</span>
				</div>
			</div>
		</div>

		<div class="action-buttons">
			<a href="/blog" class="primary-btn">
				Explore Blog ({countdown}s)
			</a>
			<a href="/" class="secondary-btn">
				Return to Home
			</a>
		</div>

		<div class="admin-info">
			<h3>Need Help?</h3>
			<p>
				If you have questions about your registration or need immediate access, 
				please contact an administrator.
			</p>
		</div>
	</div>
</div>

<style>
	.success-container {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 80vh;
		padding: 2rem;
	}

	.success-card {
		background: white;
		padding: 3rem 2rem;
		border-radius: 12px;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		max-width: 600px;
		width: 100%;
		text-align: center;
	}

	.success-icon {
		font-size: 4rem;
		margin-bottom: 1rem;
	}

	h1 {
		color: #065f46;
		margin-bottom: 2rem;
		font-size: 2rem;
	}

	.success-message {
		background: #d1fae5;
		border: 1px solid #a7f3d0;
		border-radius: 8px;
		padding: 1.5rem;
		margin-bottom: 2rem;
		color: #065f46;
	}

	.success-message p {
		margin-bottom: 1rem;
		line-height: 1.6;
	}

	.success-message p:last-child {
		margin-bottom: 0;
	}

	.next-steps {
		margin-bottom: 2rem;
	}

	.next-steps h2 {
		color: #374151;
		margin-bottom: 1rem;
		font-size: 1.25rem;
	}

	.steps {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		text-align: left;
		max-width: 400px;
		margin: 0 auto;
	}

	.step {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem;
		background: #f9fafb;
		border-radius: 8px;
	}

	.step-number {
		background: #2563eb;
		color: white;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.875rem;
		font-weight: 600;
		flex-shrink: 0;
	}

	.step-text {
		color: #374151;
		font-size: 0.875rem;
	}

	.action-buttons {
		display: flex;
		gap: 1rem;
		justify-content: center;
		margin-bottom: 2rem;
		flex-wrap: wrap;
	}

	.primary-btn, .secondary-btn {
		padding: 0.75rem 1.5rem;
		border-radius: 6px;
		text-decoration: none;
		font-weight: 500;
		transition: all 0.2s;
		border: 1px solid transparent;
	}

	.primary-btn {
		background: #2563eb;
		color: white;
	}

	.primary-btn:hover {
		background: #1d4ed8;
	}

	.secondary-btn {
		background: white;
		color: #374151;
		border-color: #d1d5db;
	}

	.secondary-btn:hover {
		background: #f9fafb;
	}

	.admin-info {
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		padding: 1.5rem;
		color: #64748b;
	}

	.admin-info h3 {
		color: #374151;
		margin-bottom: 0.5rem;
		font-size: 1rem;
	}

	.admin-info p {
		font-size: 0.875rem;
		line-height: 1.5;
		margin: 0;
	}

	@media (max-width: 640px) {
		.success-container {
			padding: 1rem;
		}

		.success-card {
			padding: 2rem 1rem;
		}

		h1 {
			font-size: 1.5rem;
		}

		.action-buttons {
			flex-direction: column;
		}

		.steps {
			max-width: none;
		}
	}
</style>
