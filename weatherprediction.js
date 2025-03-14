// Weather data storage
let weatherData = {
    temperature: null,
    humidity: null,
    pressure: null,
    prediction: null,
    history: {
        temperature: [],
        humidity: [],
        pressure: []
    }
};

// Function to fetch weather data from the Python API
async function fetchWeatherData() {
    try {
        const fetch = require('node-fetch');
        const response = await fetch('http://localhost:5000/predict-weather');

        if (!response.ok) {
            throw new Error('Weather data not available');
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching weather data:', error);
        return null;
    }
}

// Generate time labels (past hours + future hours)
function generateTimeLabels(count) {
    const labels = [];
    const now = new Date();

    for (let i = count - 1; i >= 0; i--) {
        const time = new Date(now);
        time.setHours(now.getHours() - i);

        let format = '';
        if (i === 0) {
            format = 'Now';
        } else {
            format = time.getHours() + (time.getHours() >= 12 ? ' PM' : ' AM');
        }

        labels.push(format);
    }

    return labels;
}

// Generate dummy data for initial chart display
function generateDummyData(min, max, count) {
    return Array.from({length: count}, () => Math.floor(Math.random() * (max - min + 1)) + min);
}

// Generate forecasted data based on last known value
function generateForecastData(lastValue, count) {
    const forecast = [];
    let currentValue = lastValue;

    for (let i = 0; i < count; i++) {
        // Add some random variation to simulate forecast
        const variation = Math.random() * 4 - 2; // -2 to +2 variation
        currentValue = Math.max(0, Math.min(45, currentValue + variation));
        forecast.push(currentValue);
    }

    return forecast;
}

// Helper functions to determine status based on values
function determineTempStatus(temp) {
    if (temp < 10) {
        return {
            status: 'Cold',
            class: 'status-falling',
            description: 'Currently cold.',
            forecast: 'warmer'
        };
    } else if (temp < 20) {
        return {
            status: 'Cool',
            class: 'status-normal',
            description: 'Mild temperature.',
            forecast: 'similar'
        };
    } else if (temp < 30) {
        return {
            status: 'Comfortable',
            class: 'status-normal',
            description: 'Pleasant temperature.',
            forecast: 'similar'
        };
    } else if (temp < 35) {
        return {
            status: 'Warm',
            class: 'status-steady',
            description: 'Steady at current value of ' + Math.round(temp) + '°.',
            forecast: 'colder'
        };
    } else {
        return {
            status: 'Hot',
            class: 'status-alert',
            description: 'High temperature alert.',
            forecast: 'cooler'
        };
    }
}

function determineHumidityStatus(humidity) {
    if (humidity < 20) {
        return {
            status: 'Very Dry',
            class: 'status-alert',
            description: 'Extremely low humidity.',
            forecast: 'similar'
        };
    } else if (humidity < 40) {
        return {
            status: 'Dry',
            class: 'status-warning',
            description: 'Lower than optimal humidity.',
            forecast: 'higher'
        };
    } else if (humidity < 60) {
        return {
            status: 'Normal',
            class: 'status-normal',
            description: 'Steady at ' + Math.round(humidity) + '%.',
            forecast: 'similar'
        };
    } else if (humidity < 80) {
        return {
            status: 'Humid',
            class: 'status-warning',
            description: 'Higher than optimal humidity.',
            forecast: 'lower'
        };
    } else {
        return {
            status: 'Very Humid',
            class: 'status-alert',
            description: 'Extremely high humidity.',
            forecast: 'lower'
        };
    }
}

function determinePressureStatus(pressure) {
    if (pressure < 980) {
        return {
            status: 'Low pressure',
            class: 'status-alert'
        };
    } else if (pressure < 1000) {
        return {
            status: 'Falling',
            class: 'status-falling'
        };
    } else if (pressure < 1020) {
        return {
            status: 'Normal',
            class: 'status-normal'
        };
    } else if (pressure < 1040) {
        return {
            status: 'Rising',
            class: 'status-steady'
        };
    } else {
        return {
            status: 'High pressure',
            class: 'status-warning'
        };
    }
}

// Get weather icon based on prediction
function getWeatherIcon(prediction, hour) {
    const isNight = (hour < 6 || hour > 18);

    if (!prediction) return isNight ? '🌙' : '☀️';

    if (prediction.includes('Clear') || prediction.includes('Sunny')) {
        return isNight ? '🌙' : '☀️';
    } else if (prediction.includes('Cloud')) {
        return isNight ? '☁️' : '⛅';
    } else if (prediction.includes('Rain') || prediction.includes('Drizzle')) {
        return '🌧️';
    } else if (prediction.includes('Storm')) {
        return '⛈️';
    } else {
        return isNight ? '🌙' : '☀️';
    }
}

// Function to prepare weather data for rendering in EJS
function prepareWeatherDataForTemplate(data) {
    if (!data) return null;

    const now = new Date();
    const currentHour = now.getHours();

    // Update weather data
    weatherData.temperature = data.temperature;
    weatherData.humidity = data.humidity;
    weatherData.pressure = data.pressure;
    weatherData.prediction = data.prediction;

    // Add to history
    weatherData.history.temperature.push(data.temperature);
    weatherData.history.humidity.push(data.humidity);
    weatherData.history.pressure.push(data.pressure);

    if (weatherData.history.temperature.length > 24) {
        weatherData.history.temperature.shift();
        weatherData.history.humidity.shift();
        weatherData.history.pressure.shift();
    }

    // Get status info
    const tempStatus = determineTempStatus(data.temperature);
    const humidityStatus = determineHumidityStatus(data.humidity);
    const pressureStatus = determinePressureStatus(data.pressure);

    // Generate time for pressure reading
    const timeString = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    // Generate hourly forecast data
    const hourlyForecast = [];
    const baseTemp = data.temperature || 25;

    for (let i = 0; i < 12; i++) {
        const hour = (currentHour + i) % 24;

        // Simulate temperature pattern
        let tempVariation = 0;
        if (hour >= 0 && hour < 6) {
            tempVariation = -5 + Math.random() * 2;
        } else if (hour >= 6 && hour < 12) {
            tempVariation = -3 + (hour - 6) * 1.5 + Math.random() * 2;
        } else if (hour >= 12 && hour < 18) {
            tempVariation = 2 + Math.random() * 3;
        } else {
            tempVariation = 0 - (hour - 18) * 0.8 + Math.random() * 2;
        }

        const hourTemp = Math.round(baseTemp + tempVariation);
        const timeLabel = i === 0 ? 'Now' :
                         (hour === 0 ? '12 AM' :
                         (hour < 12 ? `${hour} AM` :
                         (hour === 12 ? '12 PM' : `${hour - 12} PM`)));

        hourlyForecast.push({
            time: timeLabel,
            icon: getWeatherIcon(data.prediction, hour),
            temp: hourTemp
        });
    }

    // Generate chart data
    const chartLabels = generateTimeLabels(24);
    const tempHistoryData = [...weatherData.history.temperature];

    // Add forecast data if history isn't complete
    if (tempHistoryData.length < 24) {
        const lastTemp = tempHistoryData[tempHistoryData.length - 1] || baseTemp;
        const forecastData = generateForecastData(lastTemp, 24 - tempHistoryData.length);
        tempHistoryData.push(...forecastData);
    }

    // Return data object for the template
    return {
        current: {
            temperature: Math.round(data.temperature),
            humidity: Math.round(data.humidity),
            pressure: Math.round(data.pressure),
            prediction: data.prediction
        },
        status: {
            temperature: tempStatus,
            humidity: humidityStatus,
            pressure: pressureStatus,
            time: timeString
        },
        forecast: hourlyForecast,
        chart: {
            labels: chartLabels,
            tempData: tempHistoryData
        }
    };
}

// Export functions for use in Express
module.exports = {
    fetchWeatherData,
    prepareWeatherDataForTemplate
};