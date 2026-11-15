import math

ra_2000 = 133.81890825
dec_2000 = -7.24704800
pm_ra_cosdec = -8.1237 / 3600.0 # deg/yr
pm_dec = +0.6732 / 3600.0       # deg/yr

ra_nasa = (8 + 55/60 + 10.831/3600) * 15
dec_nasa = -(7 + 14/60 + 42.53/3600)
print(f"NASA coords: RA={ra_nasa:.6f}, Dec={dec_nasa:.6f}")

cosdec = math.cos(math.radians(dec_2000))
delta_ra = ra_nasa - ra_2000
delta_ra_cosdec = delta_ra * cosdec
t_ra = 2000.0 + delta_ra_cosdec / pm_ra_cosdec

delta_dec = dec_nasa - dec_2000
t_dec = 2000.0 + delta_dec / pm_dec

print(f"Implied epoch from RA: {t_ra:.4f}")
print(f"Implied epoch from Dec: {t_dec:.4f}")

# CatWISE / WISE epoch: Luhman (2014) reported discovery coordinates from WISE 4-band cryogenic data
# WISE Cryogenic all-sky survey observations ran from Jan 2010 to Aug 2010.
# The mean epoch of detection of WISE J085510.83-071442.5 was 2010.35 - 2010.45.
# At 2010.40:
t_cat = 2010.40
ra_prop = ra_2000 + (pm_ra_cosdec / cosdec) * (t_cat - 2000.0)
dec_prop = dec_2000 + pm_dec * (t_cat - 2000.0)
print(f"Propagated to 2010.40: RA={ra_prop:.6f}, Dec={dec_prop:.6f}")
print(f"Offset from NASA coords: dRA={(ra_prop - ra_nasa)*3600*cosdec:.2f} arcsec, dDec={(dec_prop - dec_nasa)*3600:.2f} arcsec")

# And for SPHEREx epoch (2025.5 - 2026.5):
t_spherex = 2026.0
ra_spherex = ra_nasa + (pm_ra_cosdec / cosdec) * (t_spherex - t_cat)
dec_spherex = dec_nasa + pm_dec * (t_spherex - t_cat)
print(f"Propagated from NASA coords (2010.40) to SPHEREx (2026.0): RA={ra_spherex:.6f}, Dec={dec_spherex:.6f}")
total_pm = math.sqrt(((ra_spherex - ra_nasa)*cosdec)**2 + (dec_spherex - dec_nasa)**2) * 3600
print(f"Total motion between NASA coordinates (2010.4) and SPHEREx (2026.0): {total_pm:.1f} arcsec (~{total_pm/6.15:.1f} SPHEREx pixels!)")
