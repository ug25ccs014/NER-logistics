"""
Configuration for the routing engine.
"""
import os
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "ner_logistics")
DB_USER = os.getenv("DB_USER", "ner_admin")
DB_PASSWORD = os.getenv("DB_PASSWORD", "ner_password")

# How much a segment's risk score inflates its effective travel time
# in "safest route" mode. At RISK_DELAY_FACTOR=1.0, a segment at risk
# score 100 takes 2x its normal travel time in the routing calculation
# (100/100 * 1.0 = +100% delay). Tune this to make the router more or
# less risk-averse.
RISK_DELAY_FACTOR = 1.0

# Segments at or above this risk score are treated as effectively
# impassable for routing purposes (excluded from the graph entirely),
# separate from the DB's explicit 'blocked' status -- this lets the
# router react to a live severe-risk score even before a human has
# manually marked the segment blocked.
SEVERE_RISK_CUTOFF = 85

# How many alternate route options to compute
NUM_ALTERNATE_ROUTES = 3
