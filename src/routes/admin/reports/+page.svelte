<script>
  import { invalidateAll } from '$app/navigation';
  
  export let data;
  
  let selectedStatus = 'all';
  let selectedType = 'all';
  let showReportModal = false;
  let selectedReport = null;
  let adminResponse = '';
  let updatingStatus = false;
  
  // Issue type labels
  const issueTypeLabels = {
    'inappropriate': 'Inappropriate Content',
    'copyright': 'Copyright Violation', 
    'gdpr_removal': 'GDPR Removal Request',
    'privacy': 'Privacy Concern',
    'spam': 'Spam Content',
    'misinformation': 'Misinformation',
    'harassment': 'Harassment/Abuse',
    'other': 'Other Issue'
  };
  
  // Filter reports
  $: filteredReports = data.reports.filter(report => {
    const statusMatch = selectedStatus === 'all' || report.status === selectedStatus;
    const typeMatch = selectedType === 'all' || report.issue_type === selectedType;
    return statusMatch && typeMatch;
  });
  
  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  function openReportModal(report) {
    selectedReport = report;
    adminResponse = report.admin_response || '';
    showReportModal = true;
  }
  
  function closeReportModal() {
    showReportModal = false;
    selectedReport = null;
    adminResponse = '';
  }
  
  async function updateReportStatus(status) {
    if (!selectedReport) return;
    
    updatingStatus = true;
    try {
      const response = await fetch('/api/admin/reports/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: selectedReport.id,
          status,
          adminResponse: adminResponse.trim() || null
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        await invalidateAll();
        closeReportModal();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error updating report:', error);
      alert('Failed to update report');
    } finally {
      updatingStatus = false;
    }
  }
  
  function getStatusColor(status) {
    switch (status) {
      case 'pending': return '#f59e0b';
      case 'reviewed': return '#3b82f6';
      case 'resolved': return '#10b981';
      case 'dismissed': return '#6b7280';
      default: return '#6b7280';
    }
  }
  
  function getPriorityColor(issueType) {
    switch (issueType) {
      case 'gdpr_removal': return '#dc2626';
      case 'copyright': return '#f59e0b';
      case 'harassment': return '#dc2626';
      case 'inappropriate': return '#f59e0b';
      default: return '#6b7280';
    }
  }
</script>

<svelte:head>
  <title>Content Reports - Admin Panel</title>
</svelte:head>

<div class="admin-container">
  <div class="page-header">
    <h1>📋 Content Reports</h1>
    <a href="/admin" class="back-link">← Back to Admin</a>
  </div>
  
  <!-- Statistics -->
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-number">{data.stats.total}</div>
      <div class="stat-label">Total Reports</div>
    </div>
    <div class="stat-card pending">
      <div class="stat-number">{data.stats.pending}</div>
      <div class="stat-label">Pending Review</div>
    </div>
    <div class="stat-card gdpr">
      <div class="stat-number">{data.stats.gdpr}</div>
      <div class="stat-label">GDPR Requests</div>
    </div>
    <div class="stat-card resolved">
      <div class="stat-number">{data.stats.resolved}</div>
      <div class="stat-label">Resolved</div>
    </div>
  </div>
  
  <!-- Filters -->
  <div class="filters">
    <div class="filter-group">
      <label for="status-filter">Status:</label>
      <select id="status-filter" bind:value={selectedStatus}>
        <option value="all">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="reviewed">Reviewed</option>
        <option value="resolved">Resolved</option>
        <option value="dismissed">Dismissed</option>
      </select>
    </div>
    
    <div class="filter-group">
      <label for="type-filter">Issue Type:</label>
      <select id="type-filter" bind:value={selectedType}>
        <option value="all">All Types</option>
        <option value="gdpr_removal">GDPR Removal</option>
        <option value="copyright">Copyright</option>
        <option value="harassment">Harassment</option>
        <option value="inappropriate">Inappropriate</option>
        <option value="spam">Spam</option>
        <option value="misinformation">Misinformation</option>
        <option value="privacy">Privacy</option>
        <option value="other">Other</option>
      </select>
    </div>
  </div>
  
  <!-- Reports Table -->
  <div class="reports-table">
    {#if filteredReports.length === 0}
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>No reports found</h3>
        <p>
          {selectedStatus === 'all' && selectedType === 'all' 
            ? 'No content reports have been submitted yet.' 
            : 'No reports match the selected filters.'}
        </p>
      </div>
    {:else}
      <table>
        <thead>
          <tr>
            <th>Issue Type</th>
            <th>Content</th>
            <th>Reporter</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredReports as report (report.id)}
            <tr class="report-row" class:high-priority={report.issue_type === 'gdpr_removal' || report.issue_type === 'harassment'}>
              <td>
                <div class="issue-type">
                  <span 
                    class="priority-dot" 
                    style="background-color: {getPriorityColor(report.issue_type)}"
                  ></span>
                  {issueTypeLabels[report.issue_type]}
                </div>
              </td>
              
              <td>
                <div class="content-info">
                  {#if report.post_title}
                    <div class="post-title">{report.post_title}</div>
                    {#if report.post_url}
                      <div class="post-url">
                        <a href={report.post_url} target="_blank" rel="noopener">
                          View Post →
                        </a>
                      </div>
                    {/if}
                  {:else}
                    <span class="general-report">General Content Issue</span>
                  {/if}
                </div>
              </td>
              
              <td>
                <div class="reporter-info">
                  {#if report.reporter_email}
                    <div class="email">{report.reporter_email}</div>
                  {:else}
                    <span class="anonymous">Anonymous</span>
                  {/if}
                  {#if report.reporter_ip}
                    <div class="ip">{report.reporter_ip}</div>
                  {/if}
                </div>
              </td>
              
              <td>
                <span 
                  class="status-badge" 
                  style="background-color: {getStatusColor(report.status)}20; color: {getStatusColor(report.status)}"
                >
                  {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                </span>
              </td>
              
              <td class="date-cell">
                {formatDate(report.created_at)}
              </td>
              
              <td>
                <button 
                  class="action-btn view-btn"
                  on:click={() => openReportModal(report)}
                >
                  View Details
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<!-- Report Details Modal -->
{#if showReportModal && selectedReport}
  <div class="modal-overlay" on:click={closeReportModal}>
    <div class="modal report-modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3>📋 Report Details</h3>
        <button class="modal-close" on:click={closeReportModal}>×</button>
      </div>
      
      <div class="modal-body">
        <!-- Report Info -->
        <div class="report-details">
          <div class="detail-row">
            <span class="label">Issue Type:</span>
            <span class="value">
              <span 
                class="priority-dot" 
                style="background-color: {getPriorityColor(selectedReport.issue_type)}"
              ></span>
              {issueTypeLabels[selectedReport.issue_type]}
            </span>
          </div>
          
          <div class="detail-row">
            <span class="label">Status:</span>
            <span class="value">
              <span 
                class="status-badge" 
                style="background-color: {getStatusColor(selectedReport.status)}20; color: {getStatusColor(selectedReport.status)}"
              >
                {selectedReport.status.charAt(0).toUpperCase() + selectedReport.status.slice(1)}
              </span>
            </span>
          </div>
          
          <div class="detail-row">
            <span class="label">Reported:</span>
            <span class="value">{formatDate(selectedReport.created_at)}</span>
          </div>
          
          {#if selectedReport.post_title}
            <div class="detail-row">
              <span class="label">Content:</span>
              <span class="value">
                <strong>{selectedReport.post_title}</strong>
                {#if selectedReport.post_url}
                  <br><a href={selectedReport.post_url} target="_blank" rel="noopener">View Post →</a>
                {/if}
              </span>
            </div>
          {/if}
          
          <div class="detail-row">
            <span class="label">Reporter:</span>
            <span class="value">
              {selectedReport.reporter_email || 'Anonymous'}
              {#if selectedReport.reporter_ip}
                <br><small>IP: {selectedReport.reporter_ip}</small>
              {/if}
            </span>
          </div>
        </div>
        
        <!-- Description -->
        <div class="description-section">
          <h4>Report Description:</h4>
          <div class="description-content">
            {selectedReport.description}
          </div>
        </div>
        
        <!-- Admin Response -->
        <div class="admin-section">
          <h4>Admin Response:</h4>
          <textarea 
            bind:value={adminResponse}
            placeholder="Add your response or notes about this report..."
            rows="4"
            disabled={updatingStatus}
          ></textarea>
        </div>
        
        <!-- Current Admin Response -->
        {#if selectedReport.admin_response}
          <div class="current-response">
            <h4>Previous Response:</h4>
            <div class="response-content">
              {selectedReport.admin_response}
            </div>
            {#if selectedReport.resolved_at}
              <small>
                Resolved on {formatDate(selectedReport.resolved_at)}
                {#if selectedReport.display_name}
                  by {selectedReport.display_name}
                {/if}
              </small>
            {/if}
          </div>
        {/if}
        
        <!-- Action Buttons -->
        <div class="modal-actions">
          {#if selectedReport.status === 'pending'}
            <button 
              class="btn btn-primary"
              on:click={() => updateReportStatus('reviewed')}
              disabled={updatingStatus}
            >
              {updatingStatus ? 'Updating...' : 'Mark as Reviewed'}
            </button>
          {/if}
          
          {#if selectedReport.status === 'pending' || selectedReport.status === 'reviewed'}
            <button 
              class="btn btn-success"
              on:click={() => updateReportStatus('resolved')}
              disabled={updatingStatus}
            >
              {updatingStatus ? 'Updating...' : 'Mark as Resolved'}
            </button>
            
            <button 
              class="btn btn-secondary"
              on:click={() => updateReportStatus('dismissed')}
              disabled={updatingStatus}
            >
              {updatingStatus ? 'Updating...' : 'Dismiss Report'}
            </button>
          {/if}
          
          <button 
            class="btn btn-outline"
            on:click={closeReportModal}
            disabled={updatingStatus}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .admin-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }
  
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }
  
  .page-header h1 {
    color: #1f2937;
    margin: 0;
  }
  
  .back-link {
    color: #2563eb;
    text-decoration: none;
    font-weight: 500;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    transition: background-color 0.2s;
  }
  
  .back-link:hover {
    background: #eff6ff;
  }
  
  /* Statistics */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }
  
  .stat-card {
    background: white;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    text-align: center;
  }
  
  .stat-card.pending {
    border-left: 4px solid #f59e0b;
  }
  
  .stat-card.gdpr {
    border-left: 4px solid #dc2626;
  }
  
  .stat-card.resolved {
    border-left: 4px solid #10b981;
  }
  
  .stat-number {
    font-size: 2rem;
    font-weight: 700;
    color: #1f2937;
  }
  
  .stat-label {
    color: #6b7280;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }
  
  /* Filters */
  .filters {
    display: flex;
    gap: 2rem;
    margin-bottom: 2rem;
    padding: 1rem;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .filter-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .filter-group label {
    font-weight: 500;
    color: #374151;
  }
  
  .filter-group select {
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.875rem;
  }
  
  /* Table */
  .reports-table {
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }
  
  .empty-state {
    padding: 4rem 2rem;
    text-align: center;
    color: #6b7280;
  }
  
  .empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }
  
  .empty-state h3 {
    color: #374151;
    margin-bottom: 0.5rem;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
  }
  
  th {
    background: #f9fafb;
    padding: 1rem;
    text-align: left;
    font-weight: 600;
    color: #374151;
    border-bottom: 1px solid #e5e7eb;
  }
  
  td {
    padding: 1rem;
    border-bottom: 1px solid #f3f4f6;
    vertical-align: top;
  }
  
  .report-row:hover {
    background: #f9fafb;
  }
  
  .report-row.high-priority {
    border-left: 4px solid #dc2626;
  }
  
  .issue-type {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
  }
  
  .priority-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  
  .content-info .post-title {
    font-weight: 500;
    color: #1f2937;
    margin-bottom: 0.25rem;
  }
  
  .content-info .post-url a {
    color: #2563eb;
    font-size: 0.875rem;
    text-decoration: none;
  }
  
  .content-info .post-url a:hover {
    text-decoration: underline;
  }
  
  .general-report {
    color: #6b7280;
    font-style: italic;
  }
  
  .reporter-info .email {
    font-weight: 500;
    color: #1f2937;
  }
  
  .reporter-info .ip {
    font-size: 0.875rem;
    color: #6b7280;
  }
  
  .anonymous {
    color: #6b7280;
    font-style: italic;
  }
  
  .status-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
  }
  
  .date-cell {
    font-size: 0.875rem;
    color: #6b7280;
  }
  
  .action-btn {
    padding: 0.375rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    background: white;
    color: #374151;
  }
  
  .action-btn:hover {
    background: #f3f4f6;
  }
  
  /* Modal */
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
    max-width: 700px;
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
    color: #1f2937;
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
  
  .report-details {
    background: #f8fafc;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }
  
  .detail-row {
    display: flex;
    margin-bottom: 0.75rem;
  }
  
  .detail-row:last-child {
    margin-bottom: 0;
  }
  
  .detail-row .label {
    font-weight: 600;
    color: #374151;
    min-width: 100px;
  }
  
  .detail-row .value {
    color: #1f2937;
  }
  
  .description-section,
  .admin-section,
  .current-response {
    margin-bottom: 1.5rem;
  }
  
  .description-section h4,
  .admin-section h4,
  .current-response h4 {
    color: #374151;
    margin-bottom: 0.75rem;
    font-size: 1rem;
  }
  
  .description-content,
  .response-content {
    background: #f3f4f6;
    padding: 1rem;
    border-radius: 6px;
    border-left: 4px solid #2563eb;
    white-space: pre-wrap;
    line-height: 1.5;
  }
  
  textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
    resize: vertical;
    box-sizing: border-box;
  }
  
  textarea:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }
  
  .modal-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid #e5e7eb;
    flex-wrap: wrap;
  }
  
  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }
  
  .btn-primary {
    background: #2563eb;
    color: white;
  }
  
  .btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
  }
  
  .btn-success {
    background: #10b981;
    color: white;
  }
  
  .btn-success:hover:not(:disabled) {
    background: #059669;
  }
  
  .btn-secondary {
    background: #6b7280;
    color: white;
  }
  
  .btn-secondary:hover:not(:disabled) {
    background: #5b6470;
  }
  
  .btn-outline {
    background: white;
    color: #374151;
    border: 1px solid #d1d5db;
  }
  
  .btn-outline:hover:not(:disabled) {
    background: #f3f4f6;
  }
  
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  @media (max-width: 768px) {
    .admin-container {
      padding: 1rem;
    }
    
    .page-header {
      flex-direction: column;
      gap: 1rem;
      align-items: flex-start;
    }
    
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    
    .filters {
      flex-direction: column;
      gap: 1rem;
    }
    
    .modal-actions {
      flex-direction: column;
    }
    
    .modal {
      margin: 1rem;
      width: calc(100% - 2rem);
    }
  }
</style>