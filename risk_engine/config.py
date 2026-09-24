"""
Configuration for the risk-scoring engine.
Reads from environment variables (see .env.example) so no secrets
are hardcoded in the source.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# --- Database (matches docker-compose.yml in the db/ folder) ---
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "ner_logistics")
DB_USER = os.getenv("DB_USER", "ner_admin")
DB_PASSWORD = os.getenv("DB_PASSWORD", "ner_password")

# --- Weather API ---
# Get a free API key at https://openweathermap.org/api
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")

# Segments are grouped into grid cells of this size (degrees) and the
# engine makes ONE weather call per cell, reused by every segment
# whose midpoint falls in it. ~0.25 degrees is roughly 25-28km at this
# latitude -- fine-grained enough for locally-relevant rainfall,
# coarse enough to keep API usage sane once the network spans
# thousands of segments across multiple states.
WEATHER_GRID_SIZE_DEG = 0.25

# OpenWeatherMap's free tier allows ~60 calls/minute. This delay is
# only paid once per grid cell (not per segment), so it stays cheap
# even at scale.
WEATHER_RATE_LIMIT_DELAY_SEC = 1.1

# --- Risk model tuning ---
# Weights for the rule-based scoring formula (rule_v1). These are
# hand-tuned starting points -- swap in a trained ML model later
# without changing anything else in the pipeline.
WEIGHT_RAINFALL_24H = 0.45
WEIGHT_RAINFALL_72H = 0.25
WEIGHT_SLOPE = 0.20
WEIGHT_SEASONAL_FLAG = 0.10

# Risk level thresholds (0-100 scale)
THRESHOLD_MODERATE = 30
THRESHOLD_HIGH = 55
THRESHOLD_SEVERE = 75

# Alerts auto-fire when a segment's score crosses this line
ALERT_THRESHOLD = THRESHOLD_HIGH

# How often the engine re-scores every segment, in hours
RUN_INTERVAL_HOURS = 3
