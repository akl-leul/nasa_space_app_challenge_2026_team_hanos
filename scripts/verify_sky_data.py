import json

with open("public/data/constellations.json", "r", encoding="utf-8") as f:
    const_list = json.load(f)

with open("public/data/constellation_lut.bin", "rb") as f:
    lut = f.read()

id_list = [c["id"] for c in const_list]
name_map = {c["id"]: c["name"] for c in const_list}

print(f"Total constellations: {len(const_list)}")
assert len(const_list) == 88, f"Expected 88 constellations, got {len(const_list)}"

# Check LUT cell coverage
unassigned = [i for i, b in enumerate(lut) if b >= len(id_list)]
print(f"Total LUT cells: {len(lut)}, unassigned cells: {len(unassigned)}")
assert len(unassigned) == 0, f"Found unassigned cells: {len(unassigned)}"

def lookup_point(ra_deg, dec_deg):
    ra_deg = (ra_deg % 360.0 + 360.0) % 360.0
    dec_deg = max(-90.0, min(90.0, dec_deg))
    
    i = int(ra_deg / 0.5) % 720
    j = int((dec_deg + 90.0) / 0.5)
    j = max(0, min(359, j))
    
    cid_idx = lut[j * 720 + i]
    cid = id_list[cid_idx]
    return cid, name_map[cid]

# Test required known points:
# 1. Polaris (RA ≈ 37.95°, Dec ≈ +89.26°) -> Ursa Minor (UMi)
polaris = lookup_point(37.95, 89.26)
print("Polaris:", polaris)
assert polaris[0] == "UMi", f"Polaris failed: {polaris}"

# 2. Sirius (RA ≈ 101.287°, Dec ≈ -16.716°) -> Canis Major (CMa)
sirius = lookup_point(101.287, -16.716)
print("Sirius:", sirius)
assert sirius[0] == "CMa", f"Sirius failed: {sirius}"

# 3. M31 (RA ≈ 10.68°, Dec ≈ +41.27°) -> Andromeda (And)
m31 = lookup_point(10.68, 41.27)
print("M31:", m31)
assert m31[0] == "And", f"M31 failed: {m31}"

# 4. Fomalhaut (RA ≈ 344.41°, Dec ≈ -29.62°) -> Piscis Austrinus (PsA)
fomalhaut = lookup_point(344.41, -29.62)
print("Fomalhaut:", fomalhaut)
assert fomalhaut[0] == "PsA", f"Fomalhaut failed: {fomalhaut}"

# 5. Alpha Centauri (RA ≈ 219.90°, Dec ≈ -60.83°) -> Centaurus (Cen)
alpha_cen = lookup_point(219.90, -60.83)
print("Alpha Centauri:", alpha_cen)
assert alpha_cen[0] == "Cen", f"Alpha Centauri failed: {alpha_cen}"

# 6. RA 0° / 360° wrap
wrap_0 = lookup_point(0.01, 10.0)
wrap_360 = lookup_point(359.99, 10.0)
print(f"Wrap test at Dec +10: 0.01° -> {wrap_0}, 359.99° -> {wrap_360}")
assert wrap_0[0] == wrap_360[0] == "Psc", f"Wrap mismatch: {wrap_0} vs {wrap_360}"

# 7. Both poles
north_pole = lookup_point(0.0, 89.9)
south_pole = lookup_point(0.0, -89.9)
print("North pole (Dec +89.9):", north_pole)
print("South pole (Dec -89.9):", south_pole)
assert north_pole[0] == "UMi", f"North pole failed: {north_pole}"
assert south_pole[0] == "Oct", f"South pole failed: {south_pole}"

print("All astronomical known-point verification tests passed successfully!")
