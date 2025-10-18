document.addEventListener('DOMContentLoaded', function() {
            // Get the data passed from the backend
            const chartLabels = JSON.stringify(chartData.labels);
            
            // --- 1. BP and Heart Rate Chart ---
            const bpCtx = document.getElementById('bpChart');
            if (bpCtx) {
                new Chart(bpCtx, {
                    type: 'line',
                    data: {
                        labels: chartLabels,
                        datasets: [{
                            label: 'Heart Rate (BPM)',
                            data: JSON.stringify(chartData.heartRate),
                            borderColor: '#0d6efd',
                            borderWidth: 2,
                            tension: 0.4,
                            yAxisID: 'y'
                        }, {
                            label: 'Systolic BP',
                            data: JSON.stringify(chartData.systolicBP),
                            borderColor: '#dc3545',
                            borderWidth: 2,
                            tension: 0.4,
                            yAxisID: 'y1'
                        }, {
                            label: 'Diastolic BP',
                            data: JSON.stringify(chartData.diastolicBP),
                            borderColor: '#ffc107',
                            borderWidth: 2,
                            tension: 0.4,
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
                                grid: { drawOnChartArea: false },
                                title: { display: true, text: 'Blood Pressure' }
                            }
                        }
                    }
                });
            }

            // --- 2. Glucose Chart ---
            const glucoseCtx = document.getElementById('glucoseChart');
            if (glucoseCtx) {
                new Chart(glucoseCtx, {
                    type: 'bar',
                    data: {
                        labels: chartLabels,
                        datasets: [{
                            label: 'Glucose Level',
                            data: JSON.stringify(chartData.glucose),
                            backgroundColor: '#6f42c1',
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
            }
        });