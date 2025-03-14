document.addEventListener("DOMContentLoaded", () => {
    const aqiCard = document.getElementById("aqiCard");
    const surveillanceCard = document.getElementById("surveillanceCard");
    const signalsCard = document.getElementById("signalsCard");
    const lanesCard = document.getElementById("lanesCard");
    const parkingCard = document.getElementById("parkingCard");
    const wasteAlertCard = document.getElementById("wasteAlertCard");

    if (aqiCard) {
        aqiCard.onclick = () => {
            window.location.href = "/aqi";
        };
    }
    if (surveillanceCard) {
        surveillanceCard.onclick = () => {
            window.location.href = "/surveillance";
        };
    }
    if (signalsCard) {
        signalsCard.onclick = () => {
            window.location.href = "/adaptivetraffic";
        };
    }
    if (lanesCard) {
        lanesCard.onclick = () => {
            window.location.href = "/dynamiclane";
        };
    }

    if (parkingCard) {
        parkingCard.onclick = () => {
            window.location.href = "/smartparking";
        };
    }

    if (wasteAlertCard) {
        wasteAlertCard.onclick = () => {
            window.location.href = "/wastealert";
        };
    }

    // WebSocket connection
    const ws = new WebSocket("ws://localhost:8080");

    ws.onopen = () => {
        console.log("Connected to WebSocket server");
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        updateSensorValue(data.topic, data.value);
    };

    ws.onerror = (error) => {
        console.error("WebSocket error:", error);
    };
});