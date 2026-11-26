# Gujarat pilot road import (local OSM PBF)

This importer reads a local Geofabrik OpenStreetMap extract. It does **not**
use the public Overpass API, and it writes only to the Gujarat road tables
configured by `osm_imports/config.py`.

## 1. Download the extract

Download the **Western Zone** PBF file from:

https://download.geofabrik.de/asia/india/western-zone.html

Choose `western-zone-latest.osm.pbf` (approximately 212 MB at the time this
workflow was prepared) and save it directly inside this `osm_imports` folder.
Do not add the PBF file to Git.

## 2. Install dependencies

From this folder, run:

```bat
python -m pip install -r requirements.txt
```

## 3. Confirm the database configuration

Make sure your local `.env` is configured for the **Gujarat Preview Neon
database only**. Do not use or change NER Production credentials.

## 4. Run the import

From this folder:

```bat
python import_gujarat_roads.py
```

Or specify another PBF path:

```bat
python import_gujarat_roads.py --pbf "D:\\OSM\\western-zone-latest.osm.pbf"
```

The importer scans the PBF for the Gandhinagar–Ahmedabad and Kamrej–Surat
pilot bounding boxes, then imports matching road ways. Imported records remain
`status=unknown` and `data_status=UNVERIFIED`; OSM geometry is not evidence
of current road condition, traffic, or hazards.

Attribution: © OpenStreetMap contributors, ODbL 1.0.
