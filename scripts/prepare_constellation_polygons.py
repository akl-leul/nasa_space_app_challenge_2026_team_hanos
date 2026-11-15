import urllib.request
import json
import math
import os

url = "https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.bounds.json"
req = urllib.request.Request(url, headers={"User-Agent": "HANOS/1.0"})
print(f"Fetching {url}...")
with urllib.request.urlopen(req, timeout=30) as resp:
    bounds_data = json.loads(resp.read().decode("utf-8"))

def normalize_con_id(cid):
    if cid in ["Ser1", "Ser2"]:
        return "Ser"
    return cid

# Extract and subdivide polygon rings for each constellation
const_subdivided_polys = {}

for feat in bounds_data.get("features", []):
    cid = normalize_con_id(feat["id"])
    if cid not in const_subdivided_polys:
        const_subdivided_polys[cid] = []
    
    geom = feat["geometry"]
    coords = geom["coordinates"]
    if geom["type"] == "Polygon":
        coords = [coords]
        
    for poly in coords:
        for ring in poly:
            subdivided_ring = []
            n = len(ring)
            for i in range(n):
                p1 = ring[i]
                p2 = ring[(i + 1) % n]
                r1 = (p1[0] + 360.0) % 360.0
                d1 = p1[1]
                r2 = (p2[0] + 360.0) % 360.0
                d2 = p2[1]
                
                delta_ra = (r2 - r1 + 540.0) % 360.0 - 180.0
                dist = math.sqrt(delta_ra**2 + (d2 - d1)**2)
                steps = max(1, int(dist / 0.5))
                
                for s in range(steps):
                    t = s / steps
                    curr_r = (r1 + t * delta_ra + 360.0) % 360.0
                    curr_d = d1 + t * (d2 - d1)
                    subdivided_ring.append([round(curr_r, 3), round(curr_d, 3)])
                    
            if subdivided_ring:
                const_subdivided_polys[cid].append(subdivided_ring)

print(f"Generated subdivided polygons for {len(const_subdivided_polys)} constellations.")
print(f"Serpens has {len(const_subdivided_polys.get('Ser', []))} polygon rings.")

output_path = "public/data/constellation_polygons.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(const_subdivided_polys, f)

file_size = os.path.getsize(output_path)
print(f"Saved {output_path} ({file_size / 1024:.1f} KB)")
