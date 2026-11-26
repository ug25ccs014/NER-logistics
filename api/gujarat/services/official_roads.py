"""Read-only cross-reference against the public NIC Gujarat road GIS layer.

This dataset helps corroborate road presence/type only. It is not a live
condition feed and must never promote an OSM record to VERIFIED.
"""
import requests

ARCGIS_QUERY_URL = "https://www.grammanchitragis.nic.in/grammanchitra/rest/services/NICAI/Gujarat/MapServer/3/query"
SOURCE_NAME = "NICAI / Gujarat State GIS (Gram Manchitra)"
SOURCE_URL = "https://www.grammanchitragis.nic.in/grammanchitra/rest/services/NICAI/Gujarat/MapServer/3"


def cross_reference_route(points):
    if len(points) < 2:
        raise ValueError("At least two route points are required.")
    if len(points) > 80:
        raise ValueError("At most 80 route points can be cross-referenced.")

    paths = [[[float(point["lon"]), float(point["lat"])] for point in points]]
    params = {
        "f": "json",
        "where": "1=1",
        "geometry": __import__("json").dumps({"paths": paths, "spatialReference": {"wkid": 4326}}),
        "geometryType": "esriGeometryPolyline",
        "inSR": 4326,
        "spatialRel": "esriSpatialRelIntersects",
        "distance": 100,
        "units": "esriSRUnit_Meter",
        "outFields": "OBJECTID,Name,Road_type,Width,Pavement,Status,Carriageway,Remarks,Village_Name,District_Code,Tehsil_Code,sourceofdata",
        "returnGeometry": "false",
        "returnDistinctValues": "true",
        "resultRecordCount": 200,
    }
    try:
        response = requests.get(ARCGIS_QUERY_URL, params=params, timeout=(8, 25))
        response.raise_for_status()
        payload = response.json()
        if payload.get("error"):
            message = payload["error"].get("message") or "GIS provider returned an error."
            return {
                "status": "UNAVAILABLE", "source": SOURCE_NAME, "source_url": SOURCE_URL,
                "features": [], "feature_count": 0, "message": str(message)[:240],
            }
        features = payload.get("features")
        if not isinstance(features, list):
            raise RuntimeError("GIS provider response did not contain a feature list.")
        road_types = {
            1: "National Highway", 2: "State Highway", 3: "District Highway",
            4: "Gram Panchayat Road", 5: "Metalled Road", 6: "Unmetalled Road",
            7: "Cart Track", 8: "Foot Path", 9: "Other Roads",
        }
        cleaned = []
        for feature in features:
            attrs = feature.get("attributes") or {}
            road_type = attrs.get("Road_type")
            cleaned.append({
                "object_id": attrs.get("OBJECTID"),
                "name": attrs.get("Name"),
                "road_type_code": road_type,
                "road_type": road_types.get(road_type, "Unknown classification"),
                "width": attrs.get("Width"),
                "pavement": attrs.get("Pavement"),
                "recorded_status": attrs.get("Status"),
                "carriageway": attrs.get("Carriageway"),
                "remarks": attrs.get("Remarks"),
                "village": attrs.get("Village_Name"),
                "district_code": attrs.get("District_Code"),
                "tehsil_code": attrs.get("Tehsil_Code"),
                "source_of_data": attrs.get("sourceofdata"),
            })
        return {
            "status": "REFERENCE_MATCHES" if cleaned else "NO_REFERENCE_MATCH",
            "source": SOURCE_NAME, "source_url": SOURCE_URL,
            "feature_count": len(cleaned), "features": cleaned,
            "match_buffer_m": 100,
            "data_status": "REFERENCE_ONLY",
            "note": "This public GIS layer is a road-network reference. A spatial match does not verify current road condition, closure, safety, or OSM segment identity.",
        }
    except (requests.RequestException, ValueError, RuntimeError) as exc:
        return {
            "status": "UNAVAILABLE", "source": SOURCE_NAME, "source_url": SOURCE_URL,
            "features": [], "feature_count": 0, "message": str(exc)[:240],
        }
