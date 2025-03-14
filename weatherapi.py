import os
import joblib
import logging
import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from flask import Flask, jsonify

# Load environment variables from .env file
load_dotenv()

# Configure logging for better debugging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# Initialize Flask app
app = Flask(__name__)

# Load ML Model & Label Encoder
try:
    model, label_encoder = joblib.load("weather_model.pkl")
    logging.info("✅ Model and Label Encoder loaded successfully.")
except Exception as e:
    logging.error(f"❌ Error loading model: {e}")
    model, label_encoder = None, None  # Prevent crashes if model fails to load

# Dictionary to store latest sensor data
weather_data = {"temperature": None, "humidity": None, "pressure": None}

# Load MQTT Configuration from .env
MQTT_BROKER = os.getenv("MQTT_HOST")
MQTT_PORT = int(os.getenv("MQTT_PORT", 8883))  # Use secure MQTT over TLS
MQTT_USERNAME = os.getenv("MQTT_USERNAME")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD")
MQTT_TOPICS = ["sensor/temperature", "sensor/humidity", "sensor/pressure"]

# Ensure required environment variables are set
if not all([MQTT_BROKER, MQTT_USERNAME, MQTT_PASSWORD]):
    logging.error("❌ Missing MQTT configuration in environment variables.")
    exit(1)

logging.info(f"🔄 Connecting to MQTT Broker: {MQTT_BROKER}:{MQTT_PORT}")

# MQTT Callbacks
def on_connect(client, userdata, flags, reason_code, properties):
    """Handles MQTT connection events."""
    if reason_code == 0:
        logging.info("✅ Connected to MQTT Broker.")
        for topic in MQTT_TOPICS:
            client.subscribe(topic)
            logging.info(f"📡 Subscribed to topic: {topic}")
    else:
        logging.error(f"❌ MQTT Connection failed. Reason Code: {reason_code}")

def on_message(client, userdata, msg):
    """Processes incoming MQTT messages and updates weather data."""
    topic = msg.topic
    value = msg.payload.decode("utf-8")

    try:
        if topic == "sensor/temperature":
            weather_data["temperature"] = float(value)
        elif topic == "sensor/humidity":
            weather_data["humidity"] = float(value)
        elif topic == "sensor/pressure":
            weather_data["pressure"] = float(value)
        logging.info(f"📡 {topic}: {value}")
    except ValueError:
        logging.warning(f"⚠️ Invalid data received on {topic}: {value}")

# Initialize MQTT Client
mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
mqtt_client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
mqtt_client.tls_set()  # Enable secure TLS connection

# Assign Callbacks
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

# Connect to MQTT Broker
try:
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_start()  # Run MQTT loop in the background
except Exception as e:
    logging.error(f"❌ MQTT Connection Error: {e}")

# Flask Routes
@app.route('/')
def home():
    """Home route to confirm API is running."""
    return "🌦 Weather API is running! Access /predict-weather for predictions."

@app.route('/predict-weather', methods=['GET'])
def predict_weather():
    """Returns weather predictions based on latest sensor data."""
    if None in weather_data.values():
        return jsonify({"error": "Sensor data not yet received"}), 503

    if not model or not label_encoder:
        return jsonify({"error": "Model not loaded"}), 500

    # Extract sensor readings
    temp = weather_data["temperature"]
    humidity = weather_data["humidity"]
    pressure = weather_data["pressure"]

    # Perform prediction
    try:
        prediction = model.predict([[temp, humidity, pressure]])
        condition = label_encoder.inverse_transform(prediction)[0]
    except Exception as e:
        logging.error(f"❌ Prediction Error: {e}")
        return jsonify({"error": "Prediction failed"}), 500

    return jsonify({
        "temperature": temp,
        "humidity": humidity,
        "pressure": pressure,
        "prediction": condition
    })

# Run Flask App
if __name__ == '__main__':
    app.run(debug=True, port=5000)