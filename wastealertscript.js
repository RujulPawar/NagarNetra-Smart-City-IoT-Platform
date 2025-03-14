// Socket.io setup
const socket = io();
const canvas = document.getElementById('videoFeed');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');

// Set canvas size
canvas.width = 640;
canvas.height = 480;

function drawDetections(detections) {
    detections.forEach(detection => {
        const x = detection.x;
        const y = detection.y;
        const width = detection.width;
        const height = detection.height;

        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            x - width / 2,
            y - height / 2,
            width,
            height
        );

        ctx.fillStyle = '#00ff00';
        ctx.font = '16px Arial';
        // Replace "sampah" with "garbage" in the detection class
        const detectionClass = detection.class === 'sampah-detection' ? 'garbage' : detection.class;
        const label = `${detectionClass} ${(detection.confidence * 100).toFixed(1)}%`;
        ctx.fillText(
            label,
            x - width / 2,
            y - height / 2 - 5
        );
    });
}

socket.on('frame', (data) => {
    try {
        console.log('Received frame, image length:', data.image.length);
        console.log('Detections:', data.detections ? data.detections.length : 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const img = new Image();

        // Add a timeout for image loading
        const timeoutId = setTimeout(() => {
            console.log('Image loading timeout');
            ctx.fillStyle = 'orange';
            ctx.font = '20px Arial';
            ctx.fillText('Camera feed timeout - check ESP32 connection', 50, canvas.height/2);
        }, 5000);

        // Error handling for image loading
        img.onerror = (err) => {
            clearTimeout(timeoutId);
            console.error('Error loading image:', err);
            ctx.fillStyle = 'red';
            ctx.font = '16px Arial';
            ctx.fillText('Error loading image', 10, 50);
        };

        // Success handler for image loading
        img.onload = () => {
            clearTimeout(timeoutId);
            console.log('Image loaded successfully, drawing to canvas');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            if (data.detections && data.detections.length > 0) {
                drawDetections(data.detections);
                updateLogsTable(data.detections);
            }
        };

        // Set image source after defining handlers
        img.src = 'data:image/jpeg;base64,' + data.image;
    } catch (err) {
        console.error('Error processing frame:', err);
    }
});

function updateLogsTable(detections) {
    const tbody = document.querySelector('#logsTable tbody');
    const now = new Date().toLocaleTimeString();

    detections.forEach(detection => {
        // Standardize the garbage type to "Garbage" regardless of detection class
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${now}</td>
            <td>Garbage</td>
            <td>${(detection.confidence * 100).toFixed(1)}%</td>
            <td><button class="send-alert-btn">Send</button></td>
        `;
        tbody.insertBefore(row, tbody.firstChild);

        // Add event listener to the new button
        const sendButton = row.querySelector('.send-alert-btn');
        sendButton.addEventListener('click', function() {
            console.log('Alert button clicked for detection at', now);
            // Add your alert sending functionality here
        });

        // Limit to 3 rows as requested
        while (tbody.children.length > 3) {
            tbody.removeChild(tbody.lastChild);
        }
    });
}

startBtn.onclick = () => {
    socket.emit('startDetection');
    statusDiv.textContent = 'Detection Status: Running';
    statusDiv.className = 'status active';
    stopBtn.disabled = false;
    startBtn.disabled = true;
};

stopBtn.onclick = () => {
    socket.emit('stopDetection');
    statusDiv.textContent = 'Detection Status: Stopped';
    statusDiv.className = 'status inactive';
    startBtn.disabled = false;
    stopBtn.disabled = true;

    // Clear the canvas when stopping detection
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Optionally add text to indicate detection is stopped
    ctx.fillStyle = '#666';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Detection Stopped', canvas.width/2, canvas.height/2);
    ctx.textAlign = 'start'; // Reset text alignment for future drawing
};

socket.on('connect', () => {
    console.log('Socket.IO Connected!', socket.id);
    document.getElementById('status').textContent = 'Detection Status: Connected';
});

socket.on('disconnect', (reason) => {
    console.log('Socket.IO Disconnected:', reason);
    document.getElementById('status').textContent = 'Detection Status: Disconnected';
});

socket.on('connect_error', (error) => {
    console.log('Socket.IO Connection Error:', error);
    document.getElementById('status').textContent = 'Detection Status: Error';
});

// Initialize the page
function init() {
    // Set initial canvas size
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight - 60; // Leave space for the button

    // Disable stop button initially
    stopBtn.disabled = true;

    // Initialize the charts
    initCharts();

    // Ensure charts responsively resize
    window.addEventListener('resize', resizeCharts);
}

// Function to resize charts when window size changes
function resizeCharts() {
    const chartContainers = document.querySelectorAll('.chart-container');
    chartContainers.forEach(container => {
        const canvas = container.querySelector('canvas');
        if (canvas && canvas.chart) {
            canvas.chart.resize();
        }
    });
}

// Initialize charts
function initCharts() {
    // Data for the bar chart (waste dumping by day of week)
    const dumpingData = {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
            label: 'Dumping %',
            data: [25, 18, 22, 30, 35, 45, 28],
            backgroundColor: 'rgba(130, 202, 157, 0.6)',
            borderColor: 'rgba(130, 202, 157, 1)',
            borderWidth: 1
        }]
    };

    // Data for the pie chart (waste composition)
    const compositionData = {
        labels: ['Plastic', 'Paper', 'Food', 'Glass', 'Metal'],
        datasets: [{
            data: [42, 23, 18, 7, 10],
            backgroundColor: [
                'rgba(0, 136, 254, 0.8)',  // Blue
                'rgba(0, 196, 159, 0.8)',  // Green
                'rgba(255, 187, 40, 0.8)', // Yellow
                'rgba(255, 128, 66, 0.8)', // Orange
                'rgba(136, 132, 216, 0.8)' // Purple
            ],
            borderColor: [
                'rgba(0, 136, 254, 1)',
                'rgba(0, 196, 159, 1)',
                'rgba(255, 187, 40, 1)',
                'rgba(255, 128, 66, 1)',
                'rgba(136, 132, 216, 1)'
            ],
            borderWidth: 1
        }]
    };

    // Create the bar chart
    const barChartElement = document.getElementById('dumpingBarChart');
    const barChart = new Chart(barChartElement, {
        type: 'bar',
        data: dumpingData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Waste Dumping by Day of Week',
                    font: {
                        size: 14
                    }
                },
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + context.raw + '%';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Percentage (%)'
                    }
                }
            }
        }
    });

    // Store chart instance reference
    barChartElement.chart = barChart;

    // Create the pie chart
    const pieChartElement = document.getElementById('wasteCompositionChart');
    const pieChart = new Chart(pieChartElement, {
        type: 'pie',
        data: compositionData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Waste Composition',
                    font: {
                        size: 14
                    }
                },
                legend: {
                    display: true,
                    position: 'right'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + context.raw + '%';
                        }
                    }
                }
            }
        }
    });

    // Store chart instance reference
    pieChartElement.chart = pieChart;
}

// Handle window resize to maintain canvas aspect ratio
window.addEventListener('resize', () => {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight - 60; // Leave space for the button
});

// Handle errors gracefully
window.addEventListener('error', (error) => {
    console.error('Application error:', error);
});

// Call init when the page loads
document.addEventListener('DOMContentLoaded', init);