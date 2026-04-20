<script>
  import { createEventDispatcher } from 'svelte';
  
  export let isOpen = false;
  export let postTitle = '';
  export let postUrl = '';
  export let postId = '';
  
  const dispatch = createEventDispatcher();
  
  let formData = {
    issueType: '',
    description: '',
    email: '',
    agreedToProcess: false
  };
  
  let loading = false;
  let message = '';
  let messageType = '';
  
  const issueTypes = [
    { value: 'inappropriate', label: 'Inappropriate Content' },
    { value: 'copyright', label: 'Copyright Violation' },
    { value: 'gdpr_removal', label: 'GDPR Data/Content Removal Request' },
    { value: 'privacy', label: 'Privacy Concern' },
    { value: 'spam', label: 'Spam Content' },
    { value: 'misinformation', label: 'Misinformation' },
    { value: 'harassment', label: 'Harassment or Abuse' },
    { value: 'other', label: 'Other Issue' }
  ];
  
  function closeModal() {
    dispatch('close');
    resetForm();
  }
  
  function resetForm() {
    formData = {
      issueType: '',
      description: '',
      email: '',
      agreedToProcess: false
    };
    message = '';
    messageType = '';
  }
  
  async function submitReport() {
    if (!formData.issueType) {
      showMessage('Please select an issue type', 'error');
      return;
    }
    
    if (!formData.description.trim()) {
      showMessage('Please describe the issue', 'error');
      return;
    }
    
    if (!formData.agreedToProcess) {
      showMessage('Please agree to data processing terms', 'error');
      return;
    }
    
    loading = true;
    try {
      const reportData = {
        ...formData,
        postTitle,
        postUrl,
        postId,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
      };
      
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportData)
      });
      
      const result = await response.json();
      
      if (result.success) {
        showMessage('Report submitted successfully. Thank you for helping keep our community safe.', 'success');
        setTimeout(() => {
          closeModal();
        }, 2000);
      } else {
        showMessage(result.error || 'Failed to submit report', 'error');
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      showMessage('Failed to submit report. Please try again.', 'error');
    } finally {
      loading = false;
    }
  }
  
  function showMessage(text, type) {
    message = text;
    messageType = type;
    setTimeout(() => {
      if (type === 'error') {
        message = '';
        messageType = '';
      }
    }, 5000);
  }
  
  function handleOverlayClick(event) {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  }
</script>

{#if isOpen}
  <div class="modal-overlay" on:click={handleOverlayClick}>
    <div class="modal report-modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3>⚠️ Report Content Issue</h3>
        <button class="modal-close" on:click={closeModal}>×</button>
      </div>
      
      <div class="modal-body">
        {#if message}
          <div class="message {messageType}">
            {message}
          </div>
        {/if}
        
        <div class="report-info">
          <p><strong>Reporting:</strong> {postTitle || 'General Content Issue'}</p>
          {#if postUrl}
            <p><strong>URL:</strong> <span class="url-text">{postUrl}</span></p>
          {/if}
        </div>
        
        <form on:submit|preventDefault={submitReport}>
          <div class="form-group">
            <label for="issueType">What type of issue are you reporting? *</label>
            <select 
              id="issueType"
              bind:value={formData.issueType}
              required
              disabled={loading}
            >
              <option value="">Select an issue type...</option>
              {#each issueTypes as type}
                <option value={type.value}>{type.label}</option>
              {/each}
            </select>
          </div>
          
          <div class="form-group">
            <label for="description">Please describe the issue in detail: *</label>
            <textarea 
              id="description"
              bind:value={formData.description}
              placeholder="Provide specific details about the issue you're reporting..."
              rows="4"
              required
              disabled={loading}
            ></textarea>
            <small class="help-text">
              Be as specific as possible. For GDPR requests, please include what data/content you want removed.
            </small>
          </div>
          
          <div class="form-group">
            <label for="email">Your email (optional):</label>
            <input 
              type="email" 
              id="email"
              bind:value={formData.email}
              placeholder="your@email.com (for follow-up if needed)"
              disabled={loading}
            />
            <small class="help-text">
              Optional. Only provide if you want us to follow up on this report.
            </small>
          </div>
          
          <div class="privacy-notice">
            <h4>📋 Privacy Notice</h4>
            <p>
              <strong>Data Processing:</strong> This report will be processed to address content issues and maintain community standards. 
              Reports are stored securely and only accessed by authorized administrators.
            </p>
            <p>
              <strong>Retention:</strong> Reports are kept for up to 2 years for safety and legal compliance, 
              then automatically deleted unless required for ongoing investigations.
            </p>
            <p>
              <strong>Your Rights:</strong> You can request information about your reports or their deletion by contacting us.
            </p>
          </div>
          
          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input 
                type="checkbox" 
                bind:checked={formData.agreedToProcess}
                required
                disabled={loading}
              />
              <span class="checkmark"></span>
              I agree to the processing of this report data as described above *
            </label>
          </div>
          
          <div class="modal-actions">
            <button 
              type="submit" 
              class="btn btn-danger"
              disabled={loading || !formData.agreedToProcess}
            >
              {loading ? '📤 Submitting...' : '📤 Submit Report'}
            </button>
            
            <button 
              type="button" 
              class="btn btn-secondary"
              on:click={closeModal}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal {
    background: white;
    border-radius: 12px;
    width: 100%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 25px rgba(0, 0, 0, 0.1);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-header h3 {
    margin: 0;
    color: #dc2626;
    font-size: 1.25rem;
  }

  .modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #6b7280;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .modal-close:hover {
    color: #374151;
    background: #f3f4f6;
  }

  .modal-body {
    padding: 1.5rem;
  }

  .message {
    padding: 1rem;
    border-radius: 6px;
    margin-bottom: 1.5rem;
    font-weight: 500;
  }

  .message.success {
    background: #d1fae5;
    color: #065f46;
    border: 1px solid #a7f3d0;
  }

  .message.error {
    background: #fee2e2;
    color: #991b1b;
    border: 1px solid #fca5a5;
  }

  .report-info {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }

  .report-info p {
    margin: 0.25rem 0;
    font-size: 0.875rem;
    color: #4b5563;
  }

  .url-text {
    word-break: break-all;
    font-family: monospace;
    background: #f3f4f6;
    padding: 0.125rem 0.25rem;
    border-radius: 3px;
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

  input, select, textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
    box-sizing: border-box;
    transition: border-color 0.2s;
  }

  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  input:disabled, select:disabled, textarea:disabled {
    background: #f3f4f6;
    cursor: not-allowed;
  }

  textarea {
    resize: vertical;
    min-height: 100px;
  }

  .help-text {
    font-size: 0.8rem;
    color: #6b7280;
    margin-top: 0.25rem;
    display: block;
  }

  .privacy-notice {
    background: #fffbeb;
    border: 1px solid #fbbf24;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }

  .privacy-notice h4 {
    margin: 0 0 0.75rem 0;
    color: #92400e;
    font-size: 1rem;
  }

  .privacy-notice p {
    font-size: 0.875rem;
    color: #78350f;
    margin: 0.5rem 0;
    line-height: 1.4;
  }

  .checkbox-group {
    margin-bottom: 2rem;
  }

  .checkbox-label {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    cursor: pointer;
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .checkbox-label input[type="checkbox"] {
    width: auto;
    margin: 0;
  }

  .modal-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid #e5e7eb;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-danger {
    background: #dc2626;
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background: #b91c1c;
  }

  .btn-secondary {
    background: #6b7280;
    color: white;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #5b6470;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .modal {
      margin: 1rem;
      width: calc(100% - 2rem);
    }

    .modal-actions {
      flex-direction: column;
    }

    .checkbox-label {
      font-size: 0.8rem;
    }
  }
</style>