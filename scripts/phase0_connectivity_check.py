import json
import sys
import time
import urllib.parse
import urllib.request
import urllib.error

def check_url(name, url, method="GET", data=None, headers=None, timeout=30):
    start = time.time()
    req_headers = {
        "User-Agent": "HANOS-SPHEREx-SpaceApps/1.0"
    }
    if headers:
        req_headers.update(headers)
    
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            elapsed = time.time() - start
            body = resp.read()
            return {
                "name": name,
                "url": url,
                "status": resp.status,
                "reason": resp.reason,
                "time_sec": round(elapsed, 2),
                "bytes": len(body),
                "snippet": body[:500].decode("utf-8", errors="replace"),
                "headers": dict(resp.headers),
                "ok": True,
                "raw_body": body
            }
    except urllib.error.HTTPError as e:
        elapsed = time.time() - start
        err_body = e.read()
        return {
            "name": name,
            "url": url,
            "status": e.code,
            "reason": e.reason,
            "time_sec": round(elapsed, 2),
            "bytes": len(err_body),
            "snippet": err_body[:500].decode("utf-8", errors="replace"),
            "ok": False,
            "error": str(e)
        }
    except Exception as e:
        elapsed = time.time() - start
        return {
            "name": name,
            "url": url,
            "status": None,
            "reason": str(e),
            "time_sec": round(elapsed, 2),
            "bytes": 0,
            "snippet": "",
            "ok": False,
            "error": str(e)
        }

def run_checks():
    results = {}
    print("--- 1. Checking IRSA SIA2 ---")
    sia2_url = "https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_dr1&POS=circle+10.7+41.3+0.1"
    res = check_url("IRSA SIA2 (DR1)", sia2_url)
    print(f"  {res['name']}: {res['status']} in {res['time_sec']}s ({res['bytes']} bytes)")
    results["irsa_sia2_dr1"] = res

    sia2_qr3 = "https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_qr3&POS=circle+10.7+41.3+0.1"
    res = check_url("IRSA SIA2 (QR3)", sia2_qr3)
    print(f"  {res['name']}: {res['status']} in {res['time_sec']}s ({res['bytes']} bytes)")
    results["irsa_sia2_qr3"] = res

    print("\n--- 2. Checking IRSA TAP ---")
    tap_url = "https://irsa.ipac.caltech.edu/TAP/sync"
    tap_query = (
        "REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY="
        + urllib.parse.quote("SELECT TOP 5 table_name FROM tap_schema.tables WHERE table_name LIKE 'spherex%'")
    )
    res = check_url("IRSA TAP (tables query)", f"{tap_url}?{tap_query}", timeout=45)
    print(f"  {res['name']}: {res['status']} in {res['time_sec']}s ({res['bytes']} bytes)")
    if res.get("snippet"):
        print("   Snippet:", res["snippet"][:200].replace("\n", " "))
    results["irsa_tap_tables"] = res

    tap_plane = (
        "REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY="
        + urllib.parse.quote("SELECT TOP 1 * FROM spherex.plane")
    )
    res_plane = check_url("IRSA TAP (spherex.plane)", f"{tap_url}?{tap_plane}", timeout=45)
    print(f"  {res_plane['name']}: {res_plane['status']} in {res_plane['time_sec']}s")
    results["irsa_tap_plane"] = res_plane

    print("\n--- 3. Checking IRSA Cutout Service & Documentation ---")
    cutout_doc = "https://irsa.ipac.caltech.edu/ibe/cutouts.html"
    res = check_url("IRSA Cutout Docs", cutout_doc)
    print(f"  {res['name']}: {res['status']} in {res['time_sec']}s")
    results["irsa_cutout_docs"] = res

    print("\n--- 4. Checking IRSA HiPS properties & tiles ---")
    hips_prop = "https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube/properties"
    res_hips = check_url("IRSA HiPS Properties", hips_prop)
    print(f"  {res_hips['name']}: {res_hips['status']} in {res_hips['time_sec']}s")
    if res_hips.get("snippet"):
        print("   HiPS snippet:", res_hips["snippet"][:200].replace("\n", " "))
    results["irsa_hips_properties"] = res_hips

    # HiPS tile test from link review
    hips_tile = "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/hips5_cube/hips_20261026/Norder5/Dir0/Npix445_cube.fits"
    res_tile = check_url("IRSA HiPS Tile 445 (HEAD/partial)", hips_tile, headers={"Range": "bytes=0-1000"})
    print(f"  {res_tile['name']}: {res_tile['status']} in {res_tile['time_sec']}s ({res_tile['bytes']} bytes)")
    results["irsa_hips_tile"] = res_tile

    print("\n--- 5. Checking IRSA MOST (outfmt vs output_mode) ---")
    most_outfmt = "https://irsa.ipac.caltech.edu/cgi-bin/MOST/nph-most?catalog=spherex&input_type=name_input&obj_name=Ceres&obs_begin=2025+01+01&obs_end=2026+12+31&outfmt=1"
    res_most1 = check_url("IRSA MOST (outfmt=1)", most_outfmt, timeout=30)
    print(f"  {res_most1['name']}: {res_most1['status']} in {res_most1['time_sec']}s ({res_most1['bytes']} bytes)")
    if res_most1.get("snippet"):
        print("   outfmt snippet:", res_most1["snippet"][:150].replace("\n", " "))
    results["irsa_most_outfmt"] = res_most1

    most_output_mode = "https://irsa.ipac.caltech.edu/cgi-bin/MOST/nph-most?catalog=spherex&input_type=name_input&obj_name=Ceres&obs_begin=2025+01+01&obs_end=2026+12+31&output_mode=Brief"
    res_most2 = check_url("IRSA MOST (output_mode=Brief)", most_output_mode, timeout=30)
    print(f"  {res_most2['name']}: {res_most2['status']} in {res_most2['time_sec']}s ({res_most2['bytes']} bytes)")
    if res_most2.get("snippet"):
        print("   output_mode snippet:", res_most2["snippet"][:150].replace("\n", " "))
    results["irsa_most_output_mode"] = res_most2

    print("\n--- 6. Checking SIMBAD Resolver ---")
    simbad_sesame = "https://cdsweb.u-strasbg.fr/cgi-bin/nph-sesame/-oxp/SNV?Barnard's%20star"
    res_sesame = check_url("SIMBAD Sesame (Barnard's star)", simbad_sesame)
    print(f"  {res_sesame['name']}: {res_sesame['status']} in {res_sesame['time_sec']}s")
    results["simbad_sesame"] = res_sesame

    simbad_tap = (
        "https://simbad.u-strasbg.fr/simbad/sim-tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY="
        + urllib.parse.quote("SELECT main_id, ra, dec, pmra, pmdec, plx_value FROM basic JOIN ident ON oidref = oid WHERE id = 'Barnard*'")
    )
    res_simbad_tap = check_url("SIMBAD TAP", simbad_tap)
    print(f"  {res_simbad_tap['name']}: {res_simbad_tap['status']} in {res_simbad_tap['time_sec']}s")
    results["simbad_tap"] = res_simbad_tap

    print("\n--- 7. Checking ESA Gaia Archive TAP ---")
    gaia_tap = (
        "https://gea.esac.esa.int/tap-server/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY="
        + urllib.parse.quote("SELECT TOP 2 source_id, ra, dec, pmra, pmdec, ref_epoch FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', 10.7, 41.3, 0.05))")
    )
    res_gaia = check_url("ESA Gaia DR3 TAP", gaia_tap, timeout=40)
    print(f"  {res_gaia['name']}: {res_gaia['status']} in {res_gaia['time_sec']}s")
    if res_gaia.get("snippet"):
        print("   Gaia snippet:", res_gaia["snippet"][:200].replace("\n", " "))
    results["gaia_tap"] = res_gaia

    print("\n--- 8. Checking AllWISE Catalog via IRSA TAP ---")
    wise_tap = (
        "https://irsa.ipac.caltech.edu/TAP/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY="
        + urllib.parse.quote("SELECT TOP 2 designation, ra, dec, w1mpro, w2mpro FROM allwise_p3as_psd WHERE 1=CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', 10.7, 41.3, 0.05))")
    )
    res_wise = check_url("AllWISE TAP", wise_tap, timeout=40)
    print(f"  {res_wise['name']}: {res_wise['status']} in {res_wise['time_sec']}s")
    results["allwise_tap"] = res_wise

    print("\n--- 9. Checking CADC (TAP, DSS, SSOIS) & Alternative DSS ---")
    cadc_tap = (
        "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/argus/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY="
        + urllib.parse.quote("SELECT TOP 1 * FROM caom2.Plane WHERE collection = 'NEOSSAT'")
    )
    res_cadc = check_url("CADC TAP (NEOSSat)", cadc_tap, timeout=40)
    print(f"  {res_cadc['name']}: {res_cadc['status']} in {res_cadc['time_sec']}s")
    results["cadc_tap"] = res_cadc

    ssois_url = "https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/cadcVirtual/ssois"
    res_ssois = check_url("CADC SSOIS portal", ssois_url)
    print(f"  {res_ssois['name']}: {res_ssois['status']} in {res_ssois['time_sec']}s")
    results["cadc_ssois"] = res_ssois

    skyview_dss = "https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl?Survey=dss2r&Position=10.7,41.3&Size=0.05&Pixels=100&Return=FITS"
    res_skyview = check_url("NASA SkyView DSS2R (FITS)", skyview_dss, headers={"Range": "bytes=0-1000"})
    print(f"  {res_skyview['name']}: {res_skyview['status']} in {res_skyview['time_sec']}s ({res_skyview['bytes']} bytes)")
    results["nasa_skyview_dss"] = res_skyview

    stsci_dss = "https://archive.stsci.edu/cgi-bin/dss_search?ra=10.7&dec=41.3&generation=DSS2-red"
    res_stsci = check_url("STScI DSS Search", stsci_dss)
    print(f"  {res_stsci['name']}: {res_stsci['status']} in {res_stsci['time_sec']}s ({res_stsci['bytes']} bytes)")
    results["stsci_dss"] = res_stsci

    print("\n--- 10. Checking AWS S3 Anonymous SPHEREx Bucket ---")
    s3_url = "https://nasa-irsa-spherex.s3.amazonaws.com/?prefix=&max-keys=5"
    res_s3 = check_url("AWS S3 SPHEREx Bucket", s3_url)
    print(f"  {res_s3['name']}: {res_s3['status']} in {res_s3['time_sec']}s ({res_s3['bytes']} bytes)")
    results["aws_s3_spherex"] = res_s3

    # Clean raw body before serializing
    for k in results:
        results[k].pop("raw_body", None)

    with open("scripts/phase0_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("\nSaved scripts/phase0_results.json")

if __name__ == "__main__":
    run_checks()
