// WebSocket connection
const ws = new WebSocket('ws://localhost:8080');

// Chart configuration
let aqiChart;
const maxDataPoints = 30;
let aqiData = Array(maxDataPoints).fill(null);
let labels = Array(maxDataPoints).fill('');

// Variables to store sensor values
let temperature = null;
let humidity = null;
let pressure = null;
let carbonMonoxide = null;
let latitude = null;
let longitude = null;
let currentAQI = null;
// Add this with other variables at the top
let visibility = null;
let sensorHistory = [];
let redAlertHistory = [];
let lastAlertTime = null;
let mq135Analog = null;
let pm25Analog = null;
let co2 = null;
let pm25 = null;

// Initialize Google Map
let map;
let marker;
let fakeMarkers = [];
let fixedFakeOffsets = [];

function initMap() {
    // Default center (will be updated with actual coordinates)
    const defaultCenter = { lat: 20.5937, lng: 78.9629 }; // Center of India

    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 15,
        center: defaultCenter,
        styles: [
            {
                "featureType": "all",
                "elementType": "geometry",
                "stylers": [{"visibility": "simplified"}, {"hue": "#ff0000"}]
            }
        ]
    });

    marker = new google.maps.Marker({
        map: map,
        title: 'AQI Sensor Location'
    });
    const modal = document.getElementById('mapModal');
    modal.style.display = "none";
}

// Modal functionality
const modal = document.getElementById('mapModal');
const btn = document.getElementById('showMap');
const span = document.getElementsByClassName('close-modal')[0];

btn.onclick = function() {
    modal.style.display = "flex";

    setTimeout(() => {
        google.maps.event.trigger(map, 'resize');
        if (latitude !== null && longitude !== null) {
            const position = { lat: latitude, lng: longitude };
            map.setCenter(position);
            marker.setPosition(position);

            marker.setIcon({
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: getMarkerColor(currentAQI),
                fillOpacity: 0.8,
                strokeWeight: 1,
                strokeColor: '#000000',
                scale: 30
            });

            generateFakeAQIMarkers(); // Generate fake AQI markers
        }
    }, 100);
};

// Add this function near your other calculation functions
function calculateVisibility() {
    if (temperature !== null && humidity !== null && pressure !== null && carbonMonoxide !== null) {
        let vis = 20 - (0.04 * humidity) -
                      (0.005 * carbonMonoxide) +
                      (0.02 * (pressure - 1010)) -
                      (0.02 * Math.abs(temperature - 25));

        return parseFloat(Math.max(vis, 0.5).toFixed(2)); // Minimum 0.5 km
    }
    return null;
}

span.onclick = function() {
    modal.style.display = "none";
    clearFakeMarkers(); // Remove fake markers when modal closes
};

window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = "none";
        clearFakeMarkers(); // Remove fake markers when modal closes
    }
};

// Get marker color based on AQI value
function getMarkerColor(aqi) {
    if (aqi === null) return '#808080';
    if (aqi <= 50) return '#00e400';
    if (aqi <= 100) return '#ffff00';
    if (aqi <= 150) return '#ff7e00';
    return '#ff0000';
}

// Generate random but fixed offsets for fake markers
function generateFakeOffsets() {
    if (fixedFakeOffsets.length > 0) return; // Keep the same offsets

    const minDistance = 0.0015; // Minimum ~150m apart
    const maxDistance = 0.005;  // Maximum ~500m away
    const maxAttempts = 20; // Prevent infinite loops

    let attempts = 0;

    while (fixedFakeOffsets.length < 7 && attempts < maxAttempts * 7) {
        let latOffset, lngOffset, isTooClose;
        attempts++;

        do {
            isTooClose = false;

            // Generate random lat/lng offsets within range
            latOffset = (Math.random() * (maxDistance - minDistance) + minDistance) * (Math.random() < 0.5 ? -1 : 1);
            lngOffset = (Math.random() * (maxDistance - minDistance) + minDistance) * (Math.random() < 0.5 ? -1 : 1);

            // Check if the new marker is too close to existing ones
            for (const existingOffset of fixedFakeOffsets) {
                const dLat = (latOffset - existingOffset.latOffset) * Math.PI / 180;
                const dLng = (lngOffset - existingOffset.lngOffset) * Math.PI / 180;
                const R = 6371e3; // Earth's radius in meters

                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                          Math.cos(latitude * Math.PI / 180) * Math.cos((latitude + latOffset) * Math.PI / 180) *
                          Math.sin(dLng / 2) * Math.sin(dLng / 2);
                const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

                if (distance < minDistance) {
                    isTooClose = true;
                    break;
                }
            }
        } while (isTooClose);

        fixedFakeOffsets.push({ latOffset, lngOffset });
    }
}

// Generate fake AQI markers using the stored offsets
function generateFakeAQIMarkers() {
    clearFakeMarkers(); // Remove existing fake markers

    if (latitude === null || longitude === null) return;

    generateFakeOffsets(); // Ensure offsets are only generated once

    fixedFakeOffsets.forEach(offset => {
        let fakeLat = latitude + offset.latOffset;
        let fakeLng = longitude + offset.lngOffset;
        let fakeAQI = Math.floor(Math.random() * 200); // Random AQI value

        let fakeMarker = new google.maps.Marker({
            position: { lat: fakeLat, lng: fakeLng },
            map: map,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: getMarkerColor(fakeAQI),
                fillOpacity: 0.6,
                strokeWeight: 1,
                strokeColor: '#ffffff',
                scale: 25
            },
            label: {
                text: fakeAQI.toString(),
                color: "#ffffff",
                fontSize: "10px",
                fontWeight: "bold"
            },
            title: `AQI: ${fakeAQI}` // Tooltip when hovered
        });

        fakeMarkers.push(fakeMarker);
    });
}

// Clear all fake markers from the map
function clearFakeMarkers() {
    fakeMarkers.forEach(marker => marker.setMap(null));
    fakeMarkers = [];
}

// Initialize the chart
function initializeChart() {
    const ctx = document.getElementById('aqiChart').getContext('2d');

    aqiChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'AQI Value',
                data: aqiData,
                backgroundColor: function(context) {
                    const value = context.raw;
                    if (value === null) return '#eee';
                    if (value <= 50) return '#00e400';
                    if (value <= 100) return '#ffff00';
                    if (value <= 150) return '#ff7e00';
                    return '#ff0000';
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 0
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 200,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxRotation: 0
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// Calculate AQI using updated formula (includes CO)
function calculateAQI() {
    if (temperature !== null && humidity !== null && pressure !== null &&
        carbonMonoxide !== null && mq135Analog !== null && pm25Analog !== null) {

        // Convert MQ135 Analog Value to CO2 (PPM)
        const RL = 10; // Load resistor (kΩ)
        const Ro = 20000; // Sensor resistance in clean air (calibrate this)
        let Rs = ((1023 - mq135Analog) / mq135Analog) * RL;
        let CO2 = 116.6020682 * Math.pow((Rs / Ro), -2.769034857);

        // Convert PM2.5 Analog Value to PM2.5 (µg/m³)
        let PM2_5 = (pm25Analog / 1023) * 500;

        // Calculate Derived AQI (DAQI)
        const DAQI = (0.5 * temperature) +
                     (0.8 * humidity) +
                     (0.2 * (1020 - pressure)) +
                     (0.01 * carbonMonoxide) +
                     (0.02 * CO2) +     // CO2 impact on AQI
                     (0.03 * PM2_5) +   // PM2.5 impact on AQI
                     50;

        return parseFloat(DAQI.toFixed(2));
    }
    return null;
}

// Update AQI status text and color
function updateAQIStatus(aqi) {
    const statusElement = document.getElementById('aqiStatus');
    const valueElement = document.getElementById('currentAQI');

    if (aqi === null) {
        valueElement.textContent = 'N/A';
        statusElement.textContent = 'Waiting for sensor data...';
        return;
    }

    valueElement.textContent = aqi;
    currentAQI = aqi;

    if (aqi <= 50) {
        statusElement.textContent = 'Good';
        statusElement.style.color = '#00e400';
    } else if (aqi <= 100) {
        statusElement.textContent = 'Moderate';
        statusElement.style.color = '#ffff00';
    } else if (aqi <= 150) {
        statusElement.textContent = 'Poor';
        statusElement.style.color = '#ff7e00';
    } else {
        statusElement.textContent = 'Unhealthy';
        statusElement.style.color = '#ff0000';
    }
}

// Update chart with new AQI value
function updateChart(aqi) {
    aqiData.shift();
    aqiData.push(aqi);

    const now = new Date();
    const timeLabel = now.getHours().toString().padStart(2, '0') + ':' +
                     now.getMinutes().toString().padStart(2, '0');

    labels.shift();
    labels.push(timeLabel);

    aqiChart.update();
}

// WebSocket event handlers
ws.onopen = () => {
    console.log('Connected to WebSocket server');
    initializeChart();
};

let lastLoggedMinute = null;

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const sensorId = data.topic.split('/')[1];
    const value = parseFloat(data.value);

    switch(sensorId) {
        case 'temperature':
            temperature = value;
            document.getElementById('temperature').textContent = value.toFixed(1) + '°C';
            break;
        case 'humidity':
            humidity = value;
            document.getElementById('humidity').textContent = value.toFixed(1) + '%';
            break;
        case 'pressure':
            pressure = value;
            document.getElementById('pressure').textContent = value.toFixed(1) + ' hPa';
            break;
        case 'mq7':
            carbonMonoxide = value;
            document.getElementById('co').textContent = value.toFixed(2) + ' ppb';
            break;
        case 'mq135':
            mq135Analog = value;
            // Convert MQ135 reading to CO2 PPM
            const RL = 10; // Load resistor (kΩ)
            const Ro = 20000; // Sensor resistance in clean air
            let Rs = ((1023 - value) / value) * RL;
            co2 = 116.6020682 * Math.pow((Rs / Ro), -2.769034857);
            document.getElementById('co2').textContent = co2.toFixed(1) + ' ppm';
            break;
        case 'dust':
            pm25Analog = value;
            // Convert dust sensor reading to PM2.5 µg/m³
            pm25 = (value / 1023) * 500;
            document.getElementById('pm25').textContent = pm25.toFixed(1) + ' µg/m³';
            break;
        case 'latitude':
            latitude = value;
            updateMapMarker();
            break;
        case 'longitude':
            longitude = value;
            updateMapMarker();
            break;
    }

    const vis = calculateVisibility();
    if (vis !== null) {
        visibility = vis;
        document.getElementById('visibility').textContent = vis.toFixed(1) + ' km';
    }

    const aqi = calculateAQI();
    if (aqi !== null) {
        updateAQIStatus(aqi);
        const airQuality = getAirQualityStatus(aqi);
        checkAndStoreAlert(aqi, airQuality);

        // Log only once per minute
        const now = new Date();
        const currentMinute = now.getMinutes();

        if (lastLoggedMinute !== currentMinute) {
            lastLoggedMinute = currentMinute;  // Update last logged minute

            sensorHistory.push({
                date: now.toISOString().split('T')[0],  // Extracts YYYY-MM-DD
                time: now.toLocaleTimeString(),         // System time
                temperature: temperature,
                pressure: pressure,
                humidity: humidity,
                carbonMonoxide: carbonMonoxide,
                co2: co2,
                pm25: pm25,
                visibility: visibility,
                aqi: aqi,
                airQuality: getAirQualityStatus(aqi)
            });

            // Keep only the last 1000 readings
            if (sensorHistory.length > 1000) {
                sensorHistory.shift();
            }
        }
    }
};


// Add this function to check and store alerts
function checkAndStoreAlert(aqi, airQuality) {
    const now = new Date();

    // Only store alerts for Poor or Unhealthy conditions every 15 minutes
    if ((airQuality === 'Poor' || airQuality === 'Unhealthy') &&
        (!lastAlertTime || (now - lastAlertTime) >= 15 * 60 * 1000)) {

        lastAlertTime = now;
        redAlertHistory.push({
            date: now.toISOString().split('T')[0],
            time: now.toLocaleTimeString(),
            aqi: aqi,
            airQuality: airQuality
        });
    }
}

// Add the Red Alerts modal functionality
function initializeRedAlertsModal() {
    const alertsModal = document.createElement('div');
    alertsModal.id = 'alertsModal';
    alertsModal.className = 'modal';

    alertsModal.innerHTML = `
        <div class="modal-content">
            <span class="close-modal" id="closeAlerts">&times;</span>
            <h2>Red Alerts History</h2>
            <div class="alerts-table-container">
                <table id="alertsTable">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Time</th>
                            <th>AQI</th>
                            <th>Air Quality</th>
                            <th>Alert</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </div>
    `;

    document.body.appendChild(alertsModal);

    // Add event listeners
    const closeBtn = document.getElementById('closeAlerts');
    closeBtn.onclick = () => alertsModal.style.display = 'none';

    // Close on outside click
    alertsModal.onclick = (event) => {
        if (event.target === alertsModal) {
            alertsModal.style.display = 'none';
        }
    };
}

// Modify the updateAlertsTable function
function updateAlertsTable() {
    const tbody = document.querySelector('#alertsTable tbody');
    tbody.innerHTML = '';

    redAlertHistory.forEach((alert, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${alert.date}</td>
            <td>${alert.time}</td>
            <td>${alert.aqi}</td>
            <td>${alert.airQuality}</td>
            <td><button class="alert-btn" data-index="${index}">Alert</button></td>
        `;

        // Add click handler for alert button
        row.querySelector('.alert-btn').addEventListener('click', () => {
            const alertData = {
                date: alert.date,
                time: alert.time,
                aqi: alert.aqi,
                airQuality: alert.airQuality
            };
            sendEmailAlert(alertData);
        });

        tbody.appendChild(row);
    });
}

// Update map marker when new coordinates are received
function updateMapMarker() {
    if (latitude !== null && longitude !== null && map && marker) {
        const position = { lat: latitude, lng: longitude };
        marker.setPosition(position);

        marker.setIcon({
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: getMarkerColor(currentAQI),
            fillOpacity: 0.8,
            strokeWeight: 1,
            strokeColor: '#000000',
            scale: 30
        });

        marker.setLabel({
            text: currentAQI ? currentAQI.toString() : "N/A",
            color: "#ffffff",
            fontSize: "12px",
            fontWeight: "bold"
        });

        if (modal.style.display === "flex") {
            map.setCenter(position);
        }
    }
}

ws.onerror = (error) => {
    console.error('WebSocket error:', error);
};

// Force chart update every 10 seconds
setInterval(() => {
    const aqi = calculateAQI();
    if (aqi !== null) {
        updateChart(aqi);
    }
}, 5000);

// Add this function to format the current date and time
function getFormattedDateTime() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
}

// Add this function to get the air quality status
function getAirQualityStatus(aqi) {
    if (aqi === null) return 'Unknown';
    if (aqi <= 50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Poor';
    return 'Unhealthy';
}
// Add the CSV download function
function downloadCSV() {
    let csv = 'Date,Time,Temperature (°C),Pressure (hPa),Humidity (%),Carbon Monoxide (ppb),CO2 (ppm),PM2.5 (µg/m³),Visibility (km),AQI,Air Quality\n';

    sensorHistory.forEach(reading => {
        csv += `"${reading.date}","${reading.time}",${reading.temperature},${reading.pressure},${reading.humidity},${reading.carbonMonoxide},${reading.co2},${reading.pm25},${reading.visibility},${reading.aqi},${reading.airQuality}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `aqi_data_${new Date().toISOString().replace(/[: ]/g, '_')}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
// Add this to aqiscript.js

// Function to send email alert
async function sendEmailAlert(alertData) {
    try {
        const response = await fetch('/send-alert-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(alertData)
        });

        if (!response.ok) {
            throw new Error('Failed to send email');
        }

        alert('Alert email sent successfully!');
    } catch (error) {
        console.error('Error sending alert:', error);
        alert('Failed to send alert email');
    }
}
// Add this with your other event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Ensure the elements exist before attaching event listeners
    const redAlertsBtn = document.querySelector('#redAlerts');
    const downloadBtn = document.getElementById('downloadCSV');
    const showMapBtn = document.getElementById('showMap');
    const closeAlertsModal = document.getElementById("closeAlertsModal");
    document.getElementById('timestamp').textContent = new Date().toLocaleTimeString();

    if (redAlertsBtn) {
        redAlertsBtn.onclick = function() {
            const alertsModal = document.getElementById('alertsModal');
            if (alertsModal) {
                alertsModal.style.display = 'flex';
                updateAlertsTable();
            }
        };
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadCSV);
    }

    if (showMapBtn) {
        showMapBtn.onclick = function() {
            const mapModal = document.getElementById('mapModal');
            if (mapModal) {
                mapModal.style.display = 'flex';
                setTimeout(() => {
                    google.maps.event.trigger(map, 'resize');
                    if (typeof latitude !== 'undefined' && typeof longitude !== 'undefined') {
                        const position = { lat: latitude, lng: longitude };
                        map.setCenter(position);
                        marker.setPosition(position);
                        generateFakeAQIMarkers();
                    }
                }, 100);
            }
        };
    }

    if (closeAlertsModal) {
        closeAlertsModal.onclick = function() {
            document.getElementById("alertsModal").style.display = "none";
        };
    }
});