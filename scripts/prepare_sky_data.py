import urllib.request
import json
import math
import os
import struct

# Create output directories
os.makedirs("public/data", exist_ok=True)
os.makedirs("scripts", exist_ok=True)
os.makedirs("docs/01-project", exist_ok=True)

BASE_URL = "https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/"

def fetch_json(filename):
    url = BASE_URL + filename
    print(f"Fetching {url}...")
    req = urllib.request.Request(url, headers={"User-Agent": "HANOS-SkyExplorer/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))

bounds_data = fetch_json("constellations.bounds.json")
const_data = fetch_json("constellations.json")
stars_data = fetch_json("stars.6.json")
starnames_data = fetch_json("starnames.json")

# Build constellation info dictionary
# 88 constellations
const_meta = {}
for feat in const_data.get("features", []):
    cid = feat["id"]
    props = feat.get("properties", {})
    const_meta[cid] = {
        "id": cid,
        "name": props.get("name", cid),
        "gen": props.get("gen", ""),
        "en": props.get("en", props.get("name", cid)),
    }

print(f"Loaded {len(const_meta)} constellation metadata entries.")

# Process boundaries and polygons
# Note: Serpens has two parts in bounds_data: Ser1 (Caput) and Ser2 (Cauda), but IAU code is "Ser"
# Let's map Ser1 and Ser2 to Ser
def normalize_con_id(cid):
    if cid in ["Ser1", "Ser2"]:
        return "Ser"
    return cid

from matplotlib.path import Path

# Extract and unwrap polygons per constellation
unwrapped_polys = {}
for feat in bounds_data.get("features", []):
    cid = normalize_con_id(feat["id"])
    if cid not in unwrapped_polys:
        unwrapped_polys[cid] = []
    
    geom = feat["geometry"]
    coords = geom["coordinates"]
    if geom["type"] == "Polygon":
        coords = [coords]
    
    for poly in coords:
        for ring in poly:
            unwrapped = []
            prev_lon = (ring[0][0] + 360.0) % 360.0
            unwrapped.append([prev_lon, ring[0][1]])
            for pt in ring[1:]:
                lon = (pt[0] + 360.0) % 360.0
                while lon - prev_lon > 180.0:
                    lon -= 360.0
                while lon - prev_lon < -180.0:
                    lon += 360.0
                unwrapped.append([lon, pt[1]])
                prev_lon = lon
            unwrapped_polys[cid].append(Path(unwrapped))

# Also extract rings for centers and boundary drawing
const_polygons = {}
for feat in bounds_data.get("features", []):
    cid = normalize_con_id(feat["id"])
    if cid not in const_polygons:
        const_polygons[cid] = []
    
    geom = feat["geometry"]
    coords = geom["coordinates"]
    if geom["type"] == "Polygon":
        coords = [coords]
    
    for poly in coords:
        for ring in poly:
            norm_ring = []
            for pt in ring:
                ra_deg = (pt[0] + 360.0) % 360.0
                norm_ring.append([round(ra_deg, 4), round(pt[1], 4)])
            const_polygons[cid].append(norm_ring)

print(f"Processed unwrapped polygons for {len(unwrapped_polys)} constellations.")

# Ensure all 88 constellations have metadata
# Standard list of 88 IAU constellations
ALL_88 = [
    "And", "Ant", "Aps", "Aqr", "Aql", "Ara", "Ari", "Aur", "Boo", "Cae",
    "Cam", "Cnc", "CVn", "CMa", "CMi", "Cap", "Car", "Cas", "Cen", "Cep",
    "Cet", "Cha", "Cir", "Col", "Com", "CrA", "CrB", "Crv", "Crt", "Cru",
    "Cyg", "Del", "Dor", "Dra", "Equ", "Eri", "For", "Gem", "Gru", "Her",
    "Hor", "Hya", "Hyi", "Ind", "Lac", "Leo", "LMi", "Lep", "Lib", "Lup",
    "Lyn", "Lyr", "Men", "Mic", "Mon", "Mus", "Nor", "Oct", "Oph", "Ori",
    "Pav", "Peg", "Per", "Phe", "Pic", "Psc", "PsA", "Pup", "Pyx", "Ret",
    "Sge", "Sgr", "Sco", "Scl", "Sct", "Ser", "Sex", "Tau", "Tel", "Tri",
    "TrA", "Tuc", "UMa", "UMi", "Vel", "Vir", "Vol", "Vul"
]

print(f"Total standard IAU constellations: {len(ALL_88)}")
missing = [c for c in ALL_88 if c not in const_polygons]
print(f"Missing polygons: {missing}")

# Point in spherical polygon test
# For Delporte boundaries, edges are along parallels (const Dec) and meridians (const RA)
def point_in_ring(ra, dec, ring):
    # Standard ray casting for spherical coordinates
    # We test with a ray cast in RA direction
    inside = False
    n = len(ring)
    for i in range(n):
        p1 = ring[i]
        p2 = ring[(i + 1) % n]
        
        r1, d1 = p1[0], p1[1]
        r2, d2 = p2[0], p2[1]
        
        # Check boundary condition
        if min(d1, d2) <= dec < max(d1, d2):
            # Meridian edge (constant RA)
            if abs(r1 - r2) < 1e-4:
                edge_ra = r1
            else:
                # Parallel edge (constant Dec)
                # Should not have min(d1, d2) <= dec < max(d1, d2) if d1 == d2
                edge_ra = r1 + (dec - d1) / (d2 - d1) * (r2 - r1)
            
            # Handling wrap around 0/360
            delta_ra = (edge_ra - ra + 540.0) % 360.0 - 180.0
            if delta_ra > 0:
                inside = not inside
    return inside

# Compute centers and areas
const_list = []
for cid in sorted(ALL_88):
    meta = const_meta.get(cid, {"id": cid, "name": cid, "gen": cid, "en": cid})
    rings = const_polygons.get(cid, [])
    
    # Compute center of mass on unit sphere
    sum_x, sum_y, sum_z = 0.0, 0.0, 0.0
    total_pts = 0
    for ring in rings:
        for pt in ring:
            ra_rad = math.radians(pt[0])
            dec_rad = math.radians(pt[1])
            sum_x += math.cos(dec_rad) * math.cos(ra_rad)
            sum_y += math.sin(dec_rad)
            sum_z += math.cos(dec_rad) * math.sin(ra_rad)
            total_pts += 1
            
    if total_pts > 0:
        norm = math.sqrt(sum_x**2 + sum_y**2 + sum_z**2)
        if norm > 1e-6:
            c_dec = math.degrees(math.asin(sum_y / norm))
            c_ra = (math.degrees(math.atan2(sum_z, sum_x)) + 360.0) % 360.0
        else:
            c_ra, c_dec = 0.0, 0.0
    else:
        c_ra, c_dec = 0.0, 0.0
        
    const_list.append({
        "id": cid,
        "name": meta["name"],
        "gen": meta["gen"],
        "center": [round(c_ra, 2), round(c_dec, 2)]
    })

# Subdivide boundary lines along parallels and meridians for accurate 3D rendering
# Subdividing every ~0.5 deg
boundary_lines = []
for cid, rings in const_polygons.items():
    for ring in rings:
        n = len(ring)
        for i in range(n):
            p1 = ring[i]
            p2 = ring[(i + 1) % n]
            r1, d1 = p1[0], p1[1]
            r2, d2 = p2[0], p2[1]
            
            # Check if this edge is along a meridian (constant RA) or parallel (constant Dec)
            # or diagonal
            # Handle RA wrap around 360
            delta_ra = (r2 - r1 + 540.0) % 360.0 - 180.0
            dist = math.sqrt(delta_ra**2 + (d2 - d1)**2)
            steps = max(1, int(dist / 0.5))
            
            prev_pt = [r1, d1]
            for s in range(1, steps + 1):
                t = s / steps
                curr_r = (r1 + t * delta_ra + 360.0) % 360.0
                curr_d = d1 + t * (d2 - d1)
                curr_pt = [round(curr_r, 3), round(curr_d, 3)]
                boundary_lines.append(prev_pt[0])
                boundary_lines.append(prev_pt[1])
                boundary_lines.append(curr_pt[0])
                boundary_lines.append(curr_pt[1])
                prev_pt = curr_pt

print(f"Generated {len(boundary_lines)//4} subdivided boundary segments.")

# Precompute 720x360 hit-testing LUT (0.5 degree resolution)
# 720 columns (RA 0..360), 360 rows (Dec -90..90)
print("Building 720x360 constellation LUT with unwrapped Paths...")
lut = bytearray(720 * 360) # 0..87 for each constellation in ALL_88

con_idx_map = {cid: idx for idx, cid in enumerate(sorted(ALL_88))}

# For fast testing, pre-filter by bounding box of each constellation
con_bboxes = {}
for cid, rings in const_polygons.items():
    decs = [pt[1] for ring in rings for pt in ring]
    con_bboxes[cid] = (min(decs), max(decs))

# Rasterize LUT
for j in range(360):
    dec = -90.0 + (j + 0.5) * 0.5
    for i in range(720):
        ra = (i + 0.5) * 0.5
        found_cid = None
        
        # Polar cap shortcuts
        if dec < -85.2:
            found_cid = "Oct"
        elif dec > 86.5:
            found_cid = "UMi"
        else:
            # Test candidate constellations whose Dec range covers this dec
            for cid in sorted(ALL_88):
                dmin, dmax = con_bboxes.get(cid, (-90, 90))
                if dmin - 0.5 <= dec <= dmax + 0.5:
                    inside = False
                    for p in unwrapped_polys.get(cid, []):
                        if p.contains_point((ra, dec)) or p.contains_point((ra + 360.0, dec)) or p.contains_point((ra - 360.0, dec)):
                            inside = not inside
                    if inside:
                        found_cid = cid
                        break
                    
        if found_cid and found_cid in con_idx_map:
            lut[j * 720 + i] = con_idx_map[found_cid]
        else:
            lut[j * 720 + i] = 255 # Unassigned / boundary

# Flood fill any boundary seam cells from nearest neighbors
for _ in range(5):
    for j in range(360):
        for i in range(720):
            if lut[j * 720 + i] == 255:
                # Check neighbors
                for dj, di in [(-1,0), (1,0), (0,-1), (0,1), (-1,-1), (1,1), (-1,1), (1,-1)]:
                    nj = max(0, min(359, j + dj))
                    ni = (i + di) % 720
                    val = lut[nj * 720 + ni]
                    if val != 255:
                        lut[j * 720 + i] = val
                        break
                    nj = max(0, min(359, j + dj))
                    ni = (i + di) % 720
                    val = lut[nj * 720 + ni]
                    if val != 255:
                        lut[j * 720 + i] = val
                        break

# Save LUT binary
with open("public/data/constellation_lut.bin", "wb") as f:
    f.write(lut)
print("Saved public/data/constellation_lut.bin")

# Process Stars
# Hipparcos / Bright Star stars with mag <= 6.5
processed_stars = []
brightest_per_con = {cid: [] for cid in ALL_88}

for feat in stars_data.get("features", []):
    hip_id = str(feat.get("id", ""))
    props = feat.get("properties", {})
    mag = props.get("mag", 99.0)
    if mag > 6.5:
        continue
        
    coords = feat["geometry"]["coordinates"]
    ra_deg = (coords[0] + 360.0) % 360.0
    dec_deg = coords[1]
    
    # Check starnames dictionary
    sinfo = starnames_data.get(hip_id, {})
    name = sinfo.get("name", "").strip()
    bayer = sinfo.get("bayer", "").strip()
    flam = sinfo.get("flam", "").strip()
    desig = sinfo.get("desig", "").strip()
    c_abbr = sinfo.get("c", "").strip()
    
    # Display label if bright or named
    label = name if name else (bayer if bayer else "")
    
    star_record = {
        "hip": int(hip_id) if hip_id.isdigit() else 0,
        "ra": round(ra_deg, 4),
        "dec": round(dec_deg, 4),
        "mag": round(mag, 2),
        "bv": float(props.get("bv", 0.0) or 0.0),
        "label": label,
        "con": c_abbr
    }
    processed_stars.append(star_record)
    
    # Track brightest stars per constellation
    if c_abbr in brightest_per_con:
        brightest_per_con[c_abbr].append(star_record)

print(f"Processed {len(processed_stars)} stars with V <= 6.5 mag.")

# Add top brightest stars to constellation list
for c in const_list:
    cid = c["id"]
    stars = sorted(brightest_per_con.get(cid, []), key=lambda s: s["mag"])[:5]
    c["brightestStars"] = [
        {
            "name": s["label"] or f"HIP {s['hip']}",
            "mag": s["mag"],
            "ra": s["ra"],
            "dec": s["dec"]
        }
        for s in stars
    ]

# Save constellations.json
with open("public/data/constellations.json", "w", encoding="utf-8") as f:
    json.dump(const_list, f, indent=2)
print("Saved public/data/constellations.json")

# Save boundaries.json (flat array of RA1, Dec1, RA2, Dec2)
with open("public/data/boundaries.json", "w", encoding="utf-8") as f:
    json.dump(boundary_lines, f)
print("Saved public/data/boundaries.json")

# Save stars.json (flat arrays for fast binary Float32Array loading or compact json)
with open("public/data/stars.json", "w", encoding="utf-8") as f:
    json.dump(processed_stars, f)
print("Saved public/data/stars.json")

# Create data-credits.md
credits_content = """# Data Credits and Licences

This project incorporates reference astronomical catalogues and boundary data in accordance with NASA Space Apps Challenge guidelines.

## 1. IAU Constellation Boundaries & Metadata
- **Source**: Delporte (1930) boundaries precessed to J2000, distributed via [d3-celestial](https://github.com/ofrohn/d3-celestial) and CDS VizieR (VI/49).
- **Licence**: BSD 2-Clause / Open Data.
- **Attribution**: International Astronomical Union (IAU) / Olaf Frohn (d3-celestial).

## 2. Star Catalogue
- **Source**: Hipparcos Catalogue (ESA 1997) & Yale Bright Star Catalog (Hoffleit & Warren 1991), via d3-celestial.
- **Scope**: V ≤ 6.5 magnitude (~5,044 stars), epoch J2000.
- **Licence**: Public Domain / Open Data.
- **Attribution**: European Space Agency (ESA) Hipparcos Mission / Yale University Observatory.

## 3. Disclaimers
- *Reference star map from catalogue data. Not SPHEREx data.*
- All celestial coordinates are presented in the International Celestial Reference System (ICRS) / J2000 epoch.
"""

with open("docs/01-project/data-credits.md", "w", encoding="utf-8") as f:
    f.write(credits_content)
print("Created docs/01-project/data-credits.md")
