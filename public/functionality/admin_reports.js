document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generateReportBtn');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const resultsContainer = document.getElementById('reportResultsContainer');
    const statusEl = document.getElementById('reportStatus');

    // Find the display elements
    const totalBilledEl = document.getElementById('totalBilled');
    const totalCollectedEl = document.getElementById('totalCollected');
    const totalDepositsEl = document.getElementById('totalDeposits');

    // Set default dates (e.g., first of the month to today)
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    endDateInput.value = today.toISOString().split('T')[0];
    startDateInput.value = firstDay.toISOString().split('T')[0];


    generateBtn.addEventListener('click', async () => {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        if (!startDate || !endDate) {
            statusEl.innerHTML = `<div class="alert alert-danger">Please select both a start and end date.</div>`;
            return;
        }
        if (new Date(endDate) < new Date(startDate)) {
            statusEl.innerHTML = `<div class="alert alert-danger">End date cannot be before the start date.</div>`;
            return;
        }

        // Show loading state
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Generating...';
        statusEl.innerHTML = '';
        resultsContainer.style.display = 'none';

        try {
            // Call the API
            const response = await fetch(`/api/financial-report?startDate=${startDate}&endDate=${endDate}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch report.');
            }

            const report = await response.json();

            // Populate the cards
            totalBilledEl.textContent = `$${report.totalBilled}`;
            totalCollectedEl.textContent = `$${report.totalCollected}`;
            totalDepositsEl.textContent = `$${report.totalDeposits}`;

            // Show the results
            resultsContainer.style.display = 'block';
            resultsContainer.classList.add('is-visible'); // Trigger AOS animation

        } catch (err) {
            console.error('Report generation error:', err);
            statusEl.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
        } finally {
            // Reset button
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i class="fas fa-cogs me-2"></i> Generate Report';
        }
    });
});