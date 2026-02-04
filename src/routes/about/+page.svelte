<script>
  import { PUBLIC_APP_NAME } from '$env/static/public';
</script>

<svelte:head>
  <title>About - {PUBLIC_APP_NAME}</title>
</svelte:head>

<div class="about-container">
  <h1>About {PUBLIC_APP_NAME}</h1>

  <div class="about-section">
    <h2>🚀 Welcome to Our Platform</h2>
    <p>
      {PUBLIC_APP_NAME} is a modern web application built with SvelteKit, designed to provide 
      a seamless user experience for content creation and management. Our platform combines 
      cutting-edge technology with intuitive design to deliver powerful features.
    </p>
  </div>

  <div class="about-section">
    <h2>✨ Key Features</h2>
    <div class="features-grid">
      <div class="feature-card">
        <h3>👤 User Management</h3>
        <p>Secure user registration, authentication, and profile management with role-based access control.</p>
      </div>
      
      <div class="feature-card">
        <h3>📝 Content Creation</h3>
        <p>Create and manage blog posts with a rich text editor powered by Quill for enhanced writing experience.</p>
      </div>
      
      <div class="feature-card">
        <h3>🔐 Security First</h3>
        <p>Built with security in mind featuring JWT authentication, password hashing, and secure session management.</p>
      </div>
      
      <div class="feature-card">
        <h3>⚡ Modern Technology</h3>
        <p>Powered by SvelteKit, TypeScript, and SQLite for optimal performance and developer experience.</p>
      </div>
      
      <div class="feature-card">
        <h3>👨‍💼 Admin Panel</h3>
        <p>Comprehensive admin dashboard for user management, content moderation, and system administration.</p>
      </div>
      
      <div class="feature-card">
        <h3>📱 Responsive Design</h3>
        <p>Fully responsive interface that works beautifully on desktop, tablet, and mobile devices.</p>
      </div>
    </div>
  </div>

  <div class="about-section">
    <h2>🛠️ Technology Stack</h2>
    <div class="tech-list">
      <div class="tech-category">
        <h4>Frontend</h4>
        <ul>
          <li>SvelteKit 2.0</li>
          <li>Svelte 5</li>
          <li>TypeScript</li>
          <li>Vite</li>
        </ul>
      </div>
      
      <div class="tech-category">
        <h4>Backend</h4>
        <ul>
          <li>Node.js</li>
          <li>SQLite Database</li>
          <li>JWT Authentication</li>
          <li>bcrypt Encryption</li>
        </ul>
      </div>
      
      <div class="tech-category">
        <h4>Tools & Libraries</h4>
        <ul>
          <li>Quill Rich Text Editor</li>
          <li>Docker Support</li>
          <li>Prettier Code Formatting</li>
          <li>Vitest Testing</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="about-section">
    <h2>🎯 Getting Started</h2>
    <div class="getting-started">
      <div class="step">
        <span class="step-number">1</span>
        <div class="step-content">
          <h4>Create Account</h4>
          <p>Sign up for a new account to access all platform features.</p>
        </div>
      </div>
      
      <div class="step">
        <span class="step-number">2</span>
        <div class="step-content">
          <h4>Set Up Profile</h4>
          <p>Complete your profile information and customize your settings.</p>
        </div>
      </div>
      
      <div class="step">
        <span class="step-number">3</span>
        <div class="step-content">
          <h4>Start Creating</h4>
          <p>Begin creating and publishing your content using our intuitive tools.</p>
        </div>
      </div>
    </div>
  </div>

  <div class="about-section">
    <h2>📧 Contact & Support</h2>
    <p>
      Need help or have questions? We're here to assist you with any inquiries about the platform.
    </p>
    <div class="contact-info">
      <p><strong>Platform:</strong> Built with modern web technologies for optimal performance</p>
      <p><strong>Support:</strong> Check your profile page for account management options</p>
      <p><strong>Updates:</strong> Regular feature updates and security enhancements</p>
    </div>
  </div>
</div>

<style>
  .about-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
    line-height: 1.6;
  }

  h1 {
    color: #1f2937;
    font-size: 2.5rem;
    margin-bottom: 2rem;
    text-align: center;
    border-bottom: 3px solid #2563eb;
    padding-bottom: 1rem;
  }

  .about-section {
    background: white;
    border-radius: 12px;
    padding: 2rem;
    margin-bottom: 2rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  h2 {
    color: #2563eb;
    font-size: 1.75rem;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  h3 {
    color: #1f2937;
    font-size: 1.25rem;
    margin-bottom: 1rem;
  }

  h4 {
    color: #374151;
    font-size: 1.125rem;
    margin-bottom: 0.5rem;
    font-weight: 600;
  }

  p {
    color: #4b5563;
    margin-bottom: 1rem;
    font-size: 1.1rem;
  }

  .features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
  }

  .feature-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 1.5rem;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .feature-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
  }

  .feature-card h3 {
    color: #2563eb;
    margin-bottom: 0.75rem;
    font-size: 1.125rem;
  }

  .feature-card p {
    color: #6b7280;
    font-size: 0.95rem;
    margin-bottom: 0;
  }

  .tech-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 2rem;
  }

  .tech-category {
    background: #f1f5f9;
    border-radius: 8px;
    padding: 1.5rem;
  }

  .tech-category h4 {
    color: #2563eb;
    margin-bottom: 1rem;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 0.5rem;
  }

  .tech-category ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .tech-category li {
    color: #4b5563;
    padding: 0.25rem 0;
    font-weight: 500;
  }

  .tech-category li:before {
    content: "▸ ";
    color: #2563eb;
    font-weight: bold;
  }

  .getting-started {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: #f8fafc;
    border-radius: 8px;
    border-left: 4px solid #2563eb;
  }

  .step-number {
    background: #2563eb;
    color: white;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 1.125rem;
    flex-shrink: 0;
  }

  .step-content h4 {
    margin-bottom: 0.5rem;
    color: #1f2937;
  }

  .step-content p {
    margin-bottom: 0;
    font-size: 0.95rem;
    color: #6b7280;
  }

  .contact-info {
    background: #f1f5f9;
    border-radius: 8px;
    padding: 1.5rem;
    margin-top: 1rem;
  }

  .contact-info p {
    margin-bottom: 0.75rem;
    font-size: 1rem;
  }

  .contact-info p:last-child {
    margin-bottom: 0;
  }

  @media (max-width: 768px) {
    .about-container {
      padding: 1rem;
    }

    h1 {
      font-size: 2rem;
    }

    .about-section {
      padding: 1.5rem;
    }

    .features-grid {
      grid-template-columns: 1fr;
    }

    .tech-list {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .step {
      flex-direction: column;
      text-align: center;
      gap: 1rem;
    }

    .step-content {
      text-align: left;
    }
  }
</style>