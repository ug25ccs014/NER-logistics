import os
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "ner_logistics")
DB_USER = os.getenv("DB_USER", "ner_admin")
DB_PASSWORD = os.getenv("DB_PASSWORD", "ner_password")

# OpenStreetMap's free query service. No API key needed, but it's a
# shared public resource -- be patient with large queries and don't
# hammer it with repeated re-runs. If this one is overloaded, try
# swapping in a mirror: "https://overpass.kumi.systems/api/interpreter"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# --- Test region (bounding box) ---
# For fast iteration, this is a single ~200km bounding box instead of
# a whole state/region -- imports finish in minutes, not tens of
# minutes, so you can test features quickly. Swap BOUNDING_BOX for a
# different area, or bring back the full multi-state REGION_NAMES
# list below when you're ready to widen coverage again.
REGION_LABEL = "Guwahati area (test)"
BOUNDING_BOX = (25.2, 90.7, 27.1, 92.8)  # (min_lat, min_lon, max_lat, max_lon) -- centered on Guwahati, ~200km across

# Kept for later -- swap back in when you want full NER coverage:
# REGION_NAMES = [
#     "Assam", "Arunachal Pradesh", "Manipur", "Meghalaya",
#     "Mizoram", "Nagaland", "Tripura", "Sikkim",
# ]

# OSM road classes to include. Includes unclassified/residential here
# (unlike the full-state config) since a single ~200km box around a
# city stays a manageable size even with denser city streets included
# -- gives Guwahati itself a realistic, non-sparse road network.
INCLUDED_HIGHWAY_TYPES = [
    "motorway", "trunk", "primary", "secondary", "tertiary",
    "unclassified", "residential",
]

# Assumed average speed (km/h) per road class, used to estimate travel
# time until real traffic data is integrated. These are reasonable
# planning defaults for hilly NER terrain, not measured data.
SPEED_BY_ROAD_CLASS_KMH = {
    "motorway": 60, "trunk": 55, "primary": 45, "secondary": 35,
    "tertiary": 28, "unclassified": 22, "residential": 20,
    "track": 12, "service": 15,
}

# Weather API call batching: segments are grouped into grid cells of
# this size (in degrees) and the risk engine makes ONE weather API
# call per cell instead of per segment. ~0.25 degrees is roughly 25-28km
# at this latitude -- fine-grained enough that rainfall data stays
# locally relevant, coarse enough to keep API usage sane at scale.
WEATHER_GRID_SIZE_DEG = 0.25

# --- Elevation / slope calculation ---
# Open Topo Data: free, public, no API key needed. Uses SRTM 30m
# global elevation data. Rate-limited to be a good citizen of a free
# shared public service -- see RATE_LIMIT_DELAY_SEC below.
ELEVATION_API_URL = "https://api.opentopodata.org/v1/srtm30m"

# How many sample points to take along each road segment to estimate
# its average slope. 3 (start/middle/end) keeps API usage manageable
# even across thousands of segments, while still capturing whether a
# road climbs or descends significantly.
SLOPE_SAMPLE_POINTS_PER_SEGMENT = 3

# How many segments to process per chunk when computing slope data.
# Progress is committed to the database after each chunk, so an
# interruption only loses the current chunk's work, not everything --
# re-running the script picks up where it left off (it only ever
# selects segments still missing avg_slope_deg).
SLOPE_SEGMENT_CHUNK_SIZE = 300

# Open Topo Data's public instance accepts up to 100 locations per
# request and asks for roughly 1 request/second -- this respects that.
ELEVATION_BATCH_SIZE = 100
ELEVATION_RATE_LIMIT_DELAY_SEC = 1.1
