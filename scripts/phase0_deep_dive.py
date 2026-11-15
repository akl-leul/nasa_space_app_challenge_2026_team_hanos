import json
import urllib.parse
import urllib.request
import urllib.error

def check(url, headers=None, method="GET", timeout=25):
    try:
        req = urllib.request.Request(url, headers=headers or {"User-Agent": "HANOS/1.0"}, method=method)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            return {
                "url": url,
                "status": resp.status,
                "bytes": len(body),
                "body_str": body.decode("utf-8", errors="replace"),
                "ok": True
            }
    except urllib.error.HTTPError as e:
        body = e.read()
        return {
            "url": url,
            "status": e.code,
            "reason": e.reason,
            "bytes": len(body),
            "body_str": body.decode("utf-8", errors="replace"),
            "ok": False
        }
    except Exception as e:
        return {
            "url": url,
            "error": str(e),
            "ok": False
        }

print("=== 1. IRSA MOST parameter testing ===")
# Testing input_type and outfmt / output_mode
for input_type, obj in [
    ("name_input", "1 Ceres"),
    ("naifid", "2000001"),
    ("name_input", "Pallas")
]:
    for mode in ["outfmt=1", "outfmt=0", "output_mode=Brief", "output_mode=ASCII", "output_mode=VOTable"]:
        url = f"https://irsa.ipac.caltech.edu/cgi-bin/MOST/nph-most?catalog=spherex&input_type={input_type}&obj_name={urllib.parse.quote(obj)}&obs_begin=2025+01+01&obs_end=2026+12+31&{mode}"
        res = check(url, timeout=20)
        status = res.get('status', res.get('error'))
        snippet = res.get('body_str', '')[:120].replace('\n', ' ')
        print(f"MOST input={input_type} obj={obj} {mode}: {status} ({res.get('bytes', 0)} b) -> {snippet}")
        if res.get("status") == 200:
            print("   SUCCESS! Full head:", res.get("body_str", "")[:300].replace('\n', ' '))
            break

print("\n=== 2. IRSA Collections in TAP ===")
tap_url = "https://irsa.ipac.caltech.edu/TAP/sync"
query = urllib.parse.quote("SELECT table_name, description FROM tap_schema.tables WHERE table_name LIKE 'spherex%'")
res = check(f"{tap_url}?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY={query}", timeout=25)
print("SPHEREx TAP tables status:", res.get("status"))
if res.get("ok"):
    try:
        j = json.loads(res["body_str"])
        tables = j.get("data", [])
        print("Found SPHEREx tables in TAP:")
        for t in tables:
            print("  ", t[0], ":", t[1] if len(t) > 1 else "")
    except Exception as e:
        print("Error parsing tables JSON:", e)

print("\n=== 3. IRSA SIA Collections ===")
for coll in ["spherex_dr1", "spherex_qr3", "spherex_dr1_deep", "spherex_qr3_deep", "spherex_dr1_cube"]:
    query_url = f"https://irsa.ipac.caltech.edu/SIA?COLLECTION={coll}&POS=circle+10.7+41.3+0.01"
    res = check(query_url, timeout=30)
    print(f"SIA2 collection={coll}: status={res.get('status', res.get('error'))}, bytes={res.get('bytes')}")

print("\n=== 4. SIMBAD Resolvers & Mirrors ===")
simbad_mirrors = [
    ("simbad_unistra_tap", "https://simbad.cds.unistra.fr/simbad/sim-tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=" + urllib.parse.quote("SELECT TOP 1 main_id, ra, dec, pmra, pmdec, plx_value FROM basic WHERE main_id = 'NAME Barnard''s star'")),
    ("simbad_harvard_tap", "https://simbad.cfa.harvard.edu/simbad/sim-tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=" + urllib.parse.quote("SELECT TOP 1 main_id, ra, dec, pmra, pmdec, plx_value FROM basic WHERE main_id = 'NAME Barnard''s star'")),
    ("sesame_unistra_snv", "https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV?Barnard's%20star"),
    ("sesame_vizier", "https://vizier.cds.unistra.fr/viz-bin/sesame/-oxp/SNV?Barnard's%20star"),
    ("sesame_u_strasbg", "https://cdsweb.u-strasbg.fr/cgi-bin/nph-sesame/-oxp/SNV?Barnard's%20star")
]
for name, sm in simbad_mirrors:
    res = check(sm, timeout=15)
    status = res.get('status', res.get('error'))
    snippet = res.get('body_str', '')[:120].replace('\n', ' ')
    print(f"{name}: {status} ({res.get('bytes', 0)} b) -> {snippet}")

print("\n=== 5. CADC TAP & SSOIS ===")
cadc_tap = "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/argus/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=" + urllib.parse.quote("SELECT TOP 2 observationURI, obsCollection, target_name FROM caom2.Observation WHERE obsCollection = 'NEOSSAT'")
res_cadc = check(cadc_tap, timeout=20)
print(f"CADC TAP caom2.Observation: status={res_cadc.get('status', res_cadc.get('error'))}, bytes={res_cadc.get('bytes')}")
if res_cadc.get("body_str"):
    print("  Snippet:", res_cadc["body_str"][:200].replace("\n", " "))

ssois_candidates = [
    "https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/ssois/",
    "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/ssois/sync",
    "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/ssois"
]
for sc in ssois_candidates:
    res = check(sc, timeout=10)
    print(f"SSOIS {sc}: status={res.get('status', res.get('error'))}")
