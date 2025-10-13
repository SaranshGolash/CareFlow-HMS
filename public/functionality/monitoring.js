document.addEventListener('DOMContentLoaded', function() {
            const chartLabels = JSON.stringify(chartData.labels);
            const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#0d6efd';
            const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--secondary-accent').trim() || '#4287f5';
            
            // BP and Heart Rate Chart
            const bpCtx = document.getElementById('bpChart');
            new Chart(bpCtx, {
                type: 'line',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: 'Heart Rate (BPM)',
                        data: JSON.stringify(chartData.heartRate),
                        borderColor: primaryColor,
                        backgroundColor: 'rgba(13, 110, 253, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        yAxisID: 'y'
                    }, {
                        label: 'Systolic BP',
                        data: JSON.stringify(chartData.systolicBP),
                        borderColor: '#dc3545', // Danger Red
                        backgroundColor: 'rgba(220, 53, 69, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        hidden: true,
                        yAxisID: 'y1'
                    }, {
                        label: 'Diastolic BP',
                        data: JSON.stringify(chartData.diastolicBP),
                        borderColor: '#ffc107', // Warning Yellow
                        backgroundColor: 'rgba(255, 193, 7, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        hidden: true,
                        yAxisID: 'y1'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: { display: true, text: 'Heart Rate' }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            grid: { drawOnChartArea: false }, // Only draw grid lines for the main Y axis
                            title: { display: true, text: 'Blood Pressure' }
                        }
                    }
                }
            });

            // Glucose Chart
            const glucoseCtx = document.getElementById('glucoseChart');
            new Chart(glucoseCtx, {
                type: 'bar',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: 'Glucose Level',
                        data: JSON.stringify(chartData.glucose),
                        backgroundColor: '#6f42c1', // Purple accent
                        borderColor: '#5c35a8',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: 'Glucose (mg/dL)' }
                        }
                    }
                }
            });
        });