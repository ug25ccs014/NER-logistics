import os
from pathlib import Path
from dotenv import load_dotenv

# Always load the API service's own .env, regardless of the directory from
# which uvicorn is started (e.g. `uvicorn api.main:app` from the project root).
load_dotenv(Path(__file__).resolve().with_name(".env"))

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "ner_logistics")
DB_USER = os.getenv("DB_USER", "ner_admin")
DB_PASSWORD = os.getenv("DB_PASSWORD", "ner_password")

# Same risk-routing tuning as the routing_engine, kept in sync here
# so the API's /route endpoint behaves identically.
RISK_DELAY_FACTOR = 1.0
SEVERE_RISK_CUTOFF = 85

# ------------------------------------------------------------------
# Auth. Set real values via a .env file (never commit real secrets) --
# these defaults are only here so the app doesn't crash on first run.
# ------------------------------------------------------------------
JWT_SECRET = os.getenv("JWT_SECRET", "change-this-dev-secret-before-deploying")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "24"))

# Shared "org passkey" gate for the two privileged roles. Anyone can
# register as a driver with just a phone + password; registering as a
# field official or authority additionally requires whichever of
# these two secrets matches their role. Distribute them out-of-band
# (verbally, or a secure internal doc) to actual field staff -- don't
# put them in the frontend source or any public page.
FIELD_OFFICER_PASSKEY = os.getenv("FIELD_OFFICER_PASSKEY", "change-me-field-passkey")
AUTHORITY_PASSKEY = os.getenv("AUTHORITY_PASSKEY", "change-me-authority-passkey")


# ------------------------------------------------------------------
# Live dashcam AI
# ------------------------------------------------------------------
# "yolo" is the real detector: an Ultralytics YOLOv8 model reading a
# trained hazard-detection weights file at AI_MODEL_PATH. This is what
# should be set for anything beyond a local no-setup demo.
# "demo" is a dependency-free classical-CV fallback (color + edge-texture
# heuristic) used automatically when no YOLO weights are configured, or
# if YOLO fails to load -- always labelled demo_heuristic in the API/UI
# so it's never mistaken for a real model's output.
# "gemini" (multimodal image understanding) is reserved but not wired up.
AI_PROVIDER = os.getenv("AI_PROVIDER", "demo")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_BASE_URL = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")
AI_MODEL_PATH = os.getenv("AI_MODEL_PATH", "")
AI_MIN_CONFIDENCE = float(os.getenv("AI_MIN_CONFIDENCE", "0.35"))
AI_REQUEST_TIMEOUT_SEC = int(os.getenv("AI_REQUEST_TIMEOUT_SEC", "25"))
# "" (default) lets ultralytics auto-pick (GPU if available, else CPU).
# Set to "cpu", "cuda", "cuda:0", or "mps" (Apple Silicon) to force one.
AI_DEVICE = os.getenv("AI_DEVICE", "")
# Laplacian-variance floor below which a frame is treated as too blurry
# to trust (motion blur, camera knock, etc). Lower = more permissive.
# Tune with the /ai debug "quality" field if frames are being skipped
# that shouldn't be, or vice versa.
AI_BLUR_VARIANCE_MIN = float(os.getenv("AI_BLUR_VARIANCE_MIN", "35"))
# Two-tier auto-alerting: risk_score >= AI_RISK_THRESHOLD (default 35) fires
# a "high_risk" alert to the nearest field officer + authority; risk_score
# >= AI_HIGH_RISK_THRESHOLD (default 70) fires a more severe "emergency"
# alert to the same audience. See main.py's _process_ai_frame for the
# escalation logic that decides which tier (if either) actually fires.
AI_RISK_THRESHOLD = float(os.getenv("AI_RISK_THRESHOLD", "35"))
AI_HIGH_RISK_THRESHOLD = float(os.getenv("AI_HIGH_RISK_THRESHOLD", "70"))
AI_ALERT_COOLDOWN_SEC = int(os.getenv("AI_ALERT_COOLDOWN_SEC", "180"))
AI_CONFIRMATIONS_REQUIRED = int(os.getenv("AI_CONFIRMATIONS_REQUIRED", "2"))
# How far to search for the nearest field officer currently sharing
# live location (see main.py's _nearest_field_officer). Generous on
# purpose -- a field officer several hours away is still the right
# person to alert in a sparse road network, and during testing/demo
# the driver and officer's coordinates may not be geographically
# close at all (e.g. one on real GPS, one on the dashcam's demo
# coordinates), so too tight a radius just means nobody gets found.
AI_NEAREST_OFFICER_RADIUS_KM = float(os.getenv("AI_NEAREST_OFFICER_RADIUS_KM", "300"))


# ------------------------------------------------------------------
# Trip risk forecast (Shipment Board "post a trip" feature)
# ------------------------------------------------------------------
# Kept for backward compatibility with older deployments. The planned-trip
# forecast now uses Open-Meteo server-side and does not require a weather key.
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")
# Segments whose midpoint falls in the same grid cell share one
# forecast API call -- same idea as risk_engine's WEATHER_GRID_SIZE_DEG,
# separate constant because this path is called synchronously from a
# user's browser action, not a scheduled batch job.
FORECAST_GRID_SIZE_DEG = float(os.getenv("FORECAST_GRID_SIZE_DEG", "0.10"))
# Keep a conservative live-forecast planning horizon. Open-Meteo supports
# longer horizons, but forecast confidence decreases as the trip moves farther out.
FORECAST_MAX_HOURS_AHEAD = int(os.getenv("FORECAST_MAX_HOURS_AHEAD", "360"))
# Same rule_v1 weights/thresholds as risk_engine/config.py, duplicated
# here for the same reason as risk_model.py itself -- keep the two in
# sync if you ever retune the model.
WEIGHT_RAINFALL_24H = 0.45
WEIGHT_RAINFALL_72H = 0.25
WEIGHT_SLOPE = 0.20
WEIGHT_SEASONAL_FLAG = 0.10
THRESHOLD_MODERATE = 30
THRESHOLD_HIGH = 55
THRESHOLD_SEVERE = 75
