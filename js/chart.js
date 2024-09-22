function displayBarGraph() {
    const currentMonthData = [500, 700, 1000]; // Example data
    const past3MonthsData = [1500, 1800, 2200];
    const ytdData = [5000, 6500, 8000];

    // Chart for current month
    new Chart(document.getElementById('currentMonthChart'), {
        type: 'bar',
        data: {
            labels: ['Calories', 'Water', 'Exercise'],
            datasets: [{
                label: 'Current Month',
                data: currentMonthData,
                backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56']
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });

    // Chart for past 3 months
    new Chart(document.getElementById('past3MonthsChart'), {
        type: 'bar',
        data: {
            labels: ['Calories', 'Water', 'Exercise'],
            datasets: [{
                label: 'Past 3 Months',
                data: past3MonthsData,
                backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56']
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });

    // Year-to-date chart
    new Chart(document.getElementById('ytdChart'), {
        type: 'bar',
        data: {
            labels: ['Calories', 'Water', 'Exercise'],
            datasets: [{
                label: 'Year to Date',
                data: ytdData,
                backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56']
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}
