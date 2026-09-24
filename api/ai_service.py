"""
AI dashcam hazard detection service.

Providers:
- demo: dependency-free visual heuristic, useful for local demos/tests.
- yolo: optional Ultralytics custom detector if AI_MODEL_PATH points to trained
  hazard weights.

The detector is deliberately separated from the risk/alert pipeline so a
trained YOLO/edge model can replace the demo heuristic without changing the API.
"""
import os
from typing import Any, Dict

import cv2
import numpy as np

import config


HAZARD_BASE_SCORES = {
    "landslide": 95,
    "flood": 90,
    "debris": 82,
    "fallen_tree": 78,
    "blocked_road": 82,
    "bridge_damage": 92,
    "road_damage": 68,
    "pothole": 62,
    "rockfall": 88,
    "fire": 90,
    "none": 0,
}

ALLOWED_HAZARDS = set(HAZARD_BASE_SCORES)


def _normalise_result(raw: Dict[str, Any], provider: str) -> Dict[str, Any]:
    """Convert any detector output into the stable API shape expected by main.py.

    This keeps the dependency-free demo detector and optional YOLO detector
    interchangeable. No external/Gemini service is involved.
    """
    hazard = str(raw.get("hazard") or raw.get("detection_type") or "none").lower().strip()
    aliases = {
        "landslide/debris": "landslide",
        "mudslide": "landslide",
        "mud": "flood",
        "water": "flood",
        "tree": "fallen_tree",
        "fallen tree": "fallen_tree",
        "road blockage": "blocked_road",
        "blocked road": "blocked_road",
        "potholes": "pothole",
    }
    hazard = aliases.get(hazard, hazard)
    if hazard not in ALLOWED_HAZARDS:
        hazard = "none"

    confidence = float(raw.get("confidence", 0) or 0)
    if confidence > 1:
        confidence /= 100.0
    confidence = max(0.0, min(1.0, confidence))

    severity = str(raw.get("severity") or "low").lower()
    description = str(raw.get("description") or "").strip()

    return {
        "hazard": hazard,
        "confidence": round(confidence, 4),
        "severity": severity,
        "description": description,
        "hazard_score": float(HAZARD_BASE_SCORES[hazard]),
        "provider": provider,
    }


def _demo_detect(image_bytes: bytes) -> Dict[str, Any]:
    """Fast visual fallback.

    It is intentionally labelled demo_heuristic. It does NOT claim to be a
    trained landslide model. It provides a runnable end-to-end demonstration
    when no AI key/model is installed, and is replaced automatically by a
    real provider when configured.
    """
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Could not decode image")

    h, w = frame.shape[:2]
    roi = frame[int(h * 0.15):int(h * 0.94), int(w * 0.04):int(w * 0.96)]
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)

    # Earth/rock tones are a useful visual signal for the supplied monsoon
    # landslide demo, while keeping the detector dependency-free.
    brown = (
        (hsv[:, :, 0] >= 5) & (hsv[:, :, 0] <= 25) &
        (hsv[:, :, 1] > 55) & (hsv[:, :, 2] > 40) & (hsv[:, :, 2] < 230)
    )
    brown_ratio = float(brown.mean())

    # Strong earth-tone presence -> possible landslide/debris.
    score = max(0.0, min(100.0, 100.0 * (brown_ratio - 0.07) / 0.22))
    if score < 35:
        return _normalise_result({
            "hazard": "none",
            "confidence": min(0.95, 0.45 + (0.35 - min(brown_ratio, 0.35))),
            "severity": "low",
            "description": "No strong visual hazard signal in demo mode.",
        }, "demo_heuristic")

    confidence = min(0.95, 0.55 + score / 250.0)
    return _normalise_result({
        "hazard": "landslide",
        "confidence": confidence,
        "severity": "high" if score < 75 else "critical",
        "description": "Demo visual detector found a strong earth/rock-toned obstruction signal.",
    }, "demo_heuristic")


def _yolo_detect(image_bytes: bytes) -> Dict[str, Any]:
    model_path = config.AI_MODEL_PATH
    if not model_path or not os.path.exists(model_path):
        raise RuntimeError("AI_MODEL_PATH does not point to a model file")
    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise RuntimeError("Install ultralytics to use the YOLO provider") from exc

    global _YOLO_MODEL
    if _YOLO_MODEL is None:
        _YOLO_MODEL = YOLO(model_path)

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    results = _YOLO_MODEL.predict(frame, verbose=False, conf=config.AI_MIN_CONFIDENCE)
    names = _YOLO_MODEL.names
    best = None
    for result in results:
        if result.boxes is None:
            continue
        for box in result.boxes:
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])
            label = str(names[cls_id]).lower().strip()
            label = {
                "mudslide": "landslide",
                "rockfall": "rockfall",
                "fallen tree": "fallen_tree",
                "blocked road": "blocked_road",
            }.get(label, label)
            if label in ALLOWED_HAZARDS and (best is None or conf > best[1]):
                best = (label, conf)

    if not best:
        return _normalise_result({"hazard": "none", "confidence": 0.0}, "yolo")
    label, conf = best
    return _normalise_result({
        "hazard": label,
        "confidence": conf,
        "severity": "high" if HAZARD_BASE_SCORES[label] >= 80 else "medium",
        "description": f"YOLO detected {label}.",
    }, "yolo")


_YOLO_MODEL = None


def detect(image_bytes: bytes) -> Dict[str, Any]:
    provider = (config.AI_PROVIDER or "demo").lower()
    if provider == "yolo":
        return _yolo_detect(image_bytes)
    return _demo_detect(image_bytes)
