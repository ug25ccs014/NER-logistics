"""
Lightweight translation helper for field-report and alert labels.

This is intentionally NOT a full i18n framework. Raw values
(report_type, alert_type, severity) stay in English in the database
and API responses for logic/filtering -- we only add a *_label field
with the localized display text, computed on request. That means:
  - adding a language = adding one column to the dicts below
  - no schema change, no re-translating stored data
  - existing frontend code that reads report_type/alert_type keeps working

Supported languages: en (English), hi (Hindi), as (Assamese).

IMPORTANT: the Hindi and Assamese strings below are a starting point,
not verified professional translations -- especially the Assamese,
which is more likely to contain register/dialect issues. Have a
native speaker review before this goes in front of real field
officers, and treat this file as the single place to fix wording.
"""

SUPPORTED_LANGUAGES = {"en", "hi", "as"}
DEFAULT_LANGUAGE = "en"

REPORT_TYPE_LABELS = {
    "landslide":     {"en": "Landslide",            "hi": "भूस्खलन",          "as": "মাটি স্খলন"},
    "flood":         {"en": "Flood",                "hi": "बाढ़",             "as": "বান পানী"},
    "road_damage":   {"en": "Road damage",          "hi": "सड़क क्षति",       "as": "পথৰ ক্ষতি"},
    "bridge_damage": {"en": "Bridge damage",        "hi": "पुल क्षति",        "as": "দলঙৰ ক্ষতি"},
    "congestion":    {"en": "Congestion / traffic", "hi": "यातायात जाम",      "as": "যানবাহন যাম"},
    "clear":         {"en": "Now clear",            "hi": "अब मार्ग साफ़",    "as": "এতিয়া পথ মুকলি"},
}

ALERT_TYPE_LABELS = {
    "blocked_road":   {"en": "Road blocked",    "hi": "सड़क अवरुद्ध",     "as": "পথ বন্ধ"},
    "high_risk":      {"en": "High risk route", "hi": "उच्च जोखिम मार्ग", "as": "উচ্চ বিপদজনক পথ"},
    "delivery_delay": {"en": "Delivery delay",  "hi": "डिलीवरी में देरी", "as": "ডেলিভাৰীত পলম"},
    "emergency":      {"en": "Emergency",       "hi": "आपातकाल",          "as": "জৰুৰীকালীন অৱস্থা"},
}

SEVERITY_LABELS = {
    "info":     {"en": "Info",     "hi": "जानकारी", "as": "তথ্য"},
    "warning":  {"en": "Warning",  "hi": "चेतावनी", "as": "সতৰ্কবাণী"},
    "critical": {"en": "Critical", "hi": "गंभीर",   "as": "গুৰুতৰ"},
}


def _resolve_lang(lang):
    return lang if lang in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE


def _localize(table, key, lang):
    entry = table.get(key)
    if not entry:
        return key
    lang = _resolve_lang(lang)
    return entry.get(lang, entry[DEFAULT_LANGUAGE])


def localize_report_type(report_type, lang=DEFAULT_LANGUAGE):
    return _localize(REPORT_TYPE_LABELS, report_type, lang)


def localize_alert_type(alert_type, lang=DEFAULT_LANGUAGE):
    return _localize(ALERT_TYPE_LABELS, alert_type, lang)


def localize_severity(severity, lang=DEFAULT_LANGUAGE):
    return _localize(SEVERITY_LABELS, severity, lang)
