// index.js - NagarNetra Smart City IoT Platform
const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const mqtt = require('mqtt');
const nodemailer = require('nodemailer');
const { Server: SocketIOServer } = require('socket.io');
const axios = require('axios');
require('dotenv').config();

// Import utility modules for weather prediction
const { fetchWeatherData, prepareWeatherDataForTemplate } = require('./weatherprediction');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8000;

// Create HTTP server
const server = http.createServer(app);

// Socket.IO initialization
const io = new SocketIOServer(server);

// WebSocket server initialization
const wss = new WebSocket.Server({ port: process.env.WS_PORT || 8080 });

// Configure middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Set view engine
app.set('view engine', 'ejs');
app.set("views", path.resolve("./views"));

/**
 * Email content generator based on AQI range
 */
const getEmailContent = (alertData) => {
    if (!alertData || typeof alertData.aqi !== 'number') {
        return null;
    }

    const isPoor = alertData.aqi >= 101 && alertData.aqi <= 150;
    const isUnhealthy = alertData.aqi > 150;

    if (isPoor) {
        return `
            <h2>Air Quality Alert - Poor AQI (${alertData.aqi})</h2>
            <p>Air quality is <strong>poor</strong>. Sensitive individuals may experience discomfort.</p>
            <ul>
                <li><strong>Outdoor exercise:</strong> Limit prolonged exposure.</li>
                <li><strong>Skin & Health:</strong> Use oil-control products.</li>
                <li><strong>Travel:</strong> Not ideal for long trips.</li>
                <li><strong>Precaution:</strong> Wear a mask if needed, stay hydrated.</li>
            </ul>
        `;
    } else if (isUnhealthy) {
        return `
            <h2>Air Quality Alert - Unhealthy AQI (${alertData.aqi})</h2>
            <p>Air quality is <strong>unhealthy</strong>. Health effects possible for everyone, especially sensitive groups.</p>
            <ul>
                <li><strong>Outdoor activities:</strong> Avoid strenuous exercise.</li>
                <li><strong>Windows & Purifier:</strong> Keep indoors clean.</li>
                <li><strong>Skin & Health:</strong> Hydrate, use oil-free products.</li>
                <li><strong>Precaution:</strong> Wear a mask, limit time outside.</li>
            </ul>
        `;
    }

    return null;
};

/**
 * Email configuration
 */
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
    }
});

/**
 * Fetches an image from the ESP32 camera
 */
async function getESP32Image() {
    const url = process.env.ESP32_URL;
    if (!url) {
        throw new Error('ESP32 camera URL not configured');
    }

    try {
        console.log('Fetching image from ESP32 at:', url);
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 5000 // 5 second timeout
        });
        console.log('ESP32 image received, size:', response.data.length);
        return Buffer.from(response.data);
    } catch (error) {
        console.error('Error fetching ESP32 image:',
            error.response ? `Status: ${error.response.status}` : error.message);
        return null;
    }
}

/**
 * Performs waste detection on an image using Roboflow API
 */
async function detectWaste(imageBuffer) {
    const apiKey = process.env.ROBOFLOW_API_KEY;
    const modelId = process.env.ROBOFLOW_MODEL;

    if (!imageBuffer || !apiKey || !modelId) {
        throw new Error('Missing required parameters for waste detection');
    }

    try {
        const base64Image = imageBuffer.toString('base64');

        const response = await axios({
            method: "POST",
            url: `https://detect.roboflow.com/${modelId}`,
            params: {
                api_key: apiKey
            },
            data: base64Image,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            }
        });

        return response.data;
    } catch (error) {
        console.error('Roboflow API error:', error.message);
        return null;
    }
}

// MQTT Configuration
const mqttOptions = {
    host: process.env.MQTT_HOST,
    port: parseInt(process.env.MQTT_PORT || '8883'),
    protocol: 'mqtts',
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD
};

// Connect to MQTT broker
const mqttClient = mqtt.connect(mqttOptions);

// MQTT event handlers
mqttClient.on('connect', function() {
    console.log('Connected to MQTT broker');

    // Subscribe to all relevant topics
    const topics = [
        'sensor/temperature',
        'sensor/pressure',
        'sensor/humidity',
        'sensor/mq7',
        'sensor/mq135',
        'sensor/dust',
        'sensor/latitude',
        'sensor/longitude',
        'sensor/waterflow',
        'smart_parking/occupancy',
        'smart_traffic/lane_allocation',
        'smart_traffic/density'
    ];

    topics.forEach(topic => mqttClient.subscribe(topic));
});

mqttClient.on('message', function(topic, message) {
    // Broadcast the message to all connected WebSocket clients
    wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ topic, value: message.toString() }));
        }
    });
});

mqttClient.on('error', function(error) {
    console.error('MQTT Error:', error);
});

// Authentication routes
app.get('/', (req, res) => {
    return res.render("login", { errorMessage: null });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    const mockUser = {
        email: process.env.ADMIN_EMAIL || 'admin@gmail.com',
        password: process.env.ADMIN_PASSWORD || 'Test@1234'
    };

    if (email === mockUser.email && password === mockUser.password) {
        return res.redirect('/nagarnetra');
    }
    res.render('login', { errorMessage: 'Invalid Email or Password' });
});

// Main application routes
app.get('/nagarnetra', (req, res) => {
    return res.render('nagarnetra');
});

// Environmental monitoring routes
app.get('/environmentalmonitoring', (req, res) => {
    return res.render('environmentalmonitoring');
});

app.get('/maintenance', (req, res) => {
    res.render('maintenance');
});

app.get('/aqi', (req, res) => {
    res.render('aqi', {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
    });
});

// Urban traffic management routes
app.get('/urbantrafficmanagement', (req, res) => {
    res.render('urbantrafficmanagement');
});

app.get('/adaptivetraffic', (req, res) => {
    return res.render('adaptivetraffic');
});

app.get('/dynamiclane', (req, res) => {
    return res.render('dynamiclane');
});

app.get('/smartparking', (req, res) => {
    return res.render('smartparking');
});

// Public safety routes
app.get('/publicsafety', (req, res) => {
    res.render('publicsafety');
});

app.get('/surveillance', (req, res) => {
    return res.render('surveillance');
});

app.get('/wastealert', (req, res) => {
    return res.render('wastealert');
});

// Weather related routes
app.get('/windandrain', (req, res) => {
    return res.render('windandrain');
});

app.get('/weatherprediction', async (req, res) => {
    try {
        // Fetch weather data from the Python API
        const data = await fetchWeatherData();

        // Prepare data for template
        const weatherInfo = prepareWeatherDataForTemplate(data);

        // Render the template with the prepared data
        return res.render('weatherprediction', { weatherData: weatherInfo });
    } catch (error) {
        console.error('Weather prediction error:', error);
        return res.render('weatherprediction', {
            weatherData: null,
            error: 'Unable to fetch weather data. Please try again later.'
        });
    }
});

// Utility routes
app.get('/test-camera', async (req, res) => {
    try {
        const imageBuffer = await getESP32Image();
        if (imageBuffer) {
            return res.json({
                success: true,
                message: 'Camera connection successful',
                imageSize: imageBuffer.length
            });
        } else {
            return res.json({
                success: false,
                error: 'Failed to get image from camera'
            });
        }
    } catch (error) {
        console.error('Camera test error:', error);
        return res.json({
            success: false,
            error: error.message || 'Unknown error'
        });
    }
});

// API routes
app.post('/send-alert-email', async (req, res) => {
    try {
        const alertData = req.body;
        const emailContent = getEmailContent(alertData);

        if (!emailContent) {
            return res.status(400).json({ message: 'Invalid alert data' });
        }

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_RECIPIENT,
            subject: `Air Quality Alert - ${alertData.airQuality} AQI (${alertData.aqi})`,
            html: emailContent
        };

        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: 'Alert email sent successfully' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ message: 'Failed to send alert email' });
    }
});

// Socket.IO connection handling for waste detection
io.on('connection', (socket) => {
    console.log('Client connected to waste detection');
    let detectionInterval;

    socket.on('startDetection', () => {
        console.log('Starting waste detection');
        detectionInterval = setInterval(async () => {
            try {
                const imageBuffer = await getESP32Image();
                if (imageBuffer) {
                    const detectionResults = await detectWaste(imageBuffer);

                    // Log detection results
                    if (detectionResults && detectionResults.predictions) {
                        console.log(`Found ${detectionResults.predictions.length} objects`);
                    }

                    socket.emit('frame', {
                        image: imageBuffer.toString('base64'),
                        detections: detectionResults ? detectionResults.predictions : []
                    });
                }
            } catch (error) {
                console.error('Detection loop error:', error);
                socket.emit('error', { message: error.message });
            }
        }, 1000);
    });

    socket.on('stopDetection', () => {
        console.log('Stopping waste detection');
        if (detectionInterval) {
            clearInterval(detectionInterval);
        }
    });

    socket.on('disconnect', () => {
        if (detectionInterval) {
            clearInterval(detectionInterval);
        }
        console.log('Client disconnected from waste detection');
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`NagarNetra platform running on http://localhost:${PORT}`);
});

// Export for testing purposes
module.exports = { app, server };