# Data Credits, Archives & Citations

This document compiles the formal citations, DOIs, and acknowledgements for all astronomical data archives, catalogues, and scientific software utilized by **HANOS** (COSMIC PULSE).

---

## 1. SPHEREx mission and NASA/IPAC IRSA

SPHEREx data are served by the NASA/IPAC Infrared Science Archive (IRSA) at Caltech. Source: the IRSA DR1 overview page and the SPHEREx Archive at IRSA User Guide (12 November 2026), read on 14 November 2026.

### Required acknowledgement (verbatim from the IRSA DR1 overview)

> This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration.

### Data releases used

- **DR1** (November 2026): Survey 1 and 2 data reprocessed with the QR3 pipeline and calibration, plus the **All-Sky Cube**. Cite **DOI 10.26131/IRSA678** for the DR1 Spectral Images and **DOI 10.26131/IRSA679** for the DR1 Spectral All-Sky Cube.
- **QR3** (weekly since September 2026): Survey 3 and 4 data. IRSA lists no separate DOI on the DR1 page.
- **QR2 and QR1** are not used: QR2 is superseded and no longer searchable (downloads remain until February 2027), QR1 is retired. DR1 and QR3 together form one uniformly calibrated time series; the release is shown on every frame.

### IRSA services used (all verified from this machine on 14 November 2026)

- **SIA2** `https://irsa.ipac.caltech.edu/SIA` with the collections discovered at run time (`spherex_dr1`, `spherex_qr3`, deep fields optional): the observation search.
- **Cutout service** (`?center=RA,Dec&size=DEG` appended to an image URL): the frame cutouts.
- **Anonymous S3 mirror** `nasa-irsa-spherex.s3.amazonaws.com` with HTTP range requests: per-frame headers, the WCS-WAVE wavelength table and the All-Sky Cube windows.
- **HiPS properties** of the All-Sky Cube: the 102 channel wavelengths.
- **MOST** (`catalog=spherex`): frames that contain a named solar-system object.
- **Gator cone search** (AllWISE catalogue). IRSA TAP answers the same AllWISE query in more than 100 s, Gator in about 3 s; the SPHEREx search does not use TAP either, because it was too slow.
- Method references (credited, re-implemented): the IRSA tutorials *Introduction to SPHEREx Spectral Images*, *Spectral Image Cutouts*, *PSF in Spectral Image Cutouts*, *Source Discovery Tool*, *Mosaic Cubes* and *HiPS Cubes*.

---

## 2. Astrometric & Photometric Catalogues

### Gaia Mission (ESA)
- **Catalogue**: Gaia Data Release 3 (Gaia DR3).
- **Reference Epoch**: J2016.0.
- **Acknowledgement**: This work makes use of data from the European Space Agency (ESA) mission *Gaia* (https://www.cosmos.esa.int/gaia), processed by the *Gaia* Data Processing and Analysis Consortium (DPAC, https://www.cosmos.esa.int/web/gaia/dpac/consortium). Funding for the DPAC has been provided by national institutions, in particular the institutions participating in the *Gaia* Multilateral Agreement.
- **HANOS Usage**: Astrometric cross-matching, proper-motion propagation from J2016.0 to observation epoch, and star centroid validation.

### AllWISE (NASA / IPAC)
- **Catalogue**: AllWISE Data Release (Cutri et al. 2013).
- **Acknowledgement**: This publication makes use of data products from the *Wide-field Infrared Survey Explorer*, which is a joint project of the University of California, Los Angeles, and the Jet Propulsion Laboratory/California Institute of Technology, funded by the National Aeronautics and Space Administration.
- **HANOS Usage**: Mid-infrared photometric cross-matching (W1, W2, W3, W4) to assess infrared excess and spectral consistency.

### SIMBAD Astronomical Database
- **Provider**: Centre de Données astronomiques de Strasbourg (CDS), France; Harvard-Smithsonian Center for Astrophysics mirror (Cambridge, MA).
- **Acknowledgement**: This research has made use of the SIMBAD database, operated at CDS, Strasbourg, France (Wenger et al. 2000).
- **HANOS Usage**: Runtime coordinate resolution, proper-motion retrieval, and radial velocity tracking for user-specified target identifiers.

---

## 3. Contextual Optical & Space Archives

### Digitized Sky Survey (DSS)
- **Provider**: NASA SkyView / STScI.
- **Acknowledgement**: The Digitized Sky Surveys were produced at the Space Telescope Science Institute under U.S. Government grant NAG W-2166. The images of these surveys are based on photographic data obtained using the Oschin Schmidt Telescope on Palomar Mountain and the UK Schmidt Telescope.
- **HANOS Usage**: Optical baseline context layer (DSS2-red) for cross-identifying historical optical counterparts against SPHEREx infrared detections.

### NEOSSat & CADC
- **Provider**: Canadian Astronomy Data Centre (CADC) and Canadian Space Agency (CSA).
- **Acknowledgement**: This research made use of the services of the Canadian Astronomy Data Centre operated by the National Research Council of Canada with the support of the Canadian Space Agency.
- **HANOS Usage**: Optical space-based asteroid and space surveillance archive context via CADC TAP and Solar System Object Image Search (SSOIS) portal.

---

## 4. Open-Source Scientific Software

HANOS is built upon the following community-developed open-source scientific software packages:
- **Astropy**: Astropy Collaboration et al. (2022). The Astropy Project: Sustaining and growing a community-oriented open-source Python library for astronomy. *ApJ*, 935, 167.
- **Astroquery**: Ginsburg et al. (2019). astroquery: An Astronomical Web-querying Package in Python. *AJ*, 157, 98 (IRSA collection discovery).
- **Reproject**: Robitaille et al. (2023). *reproject: Python-based astronomical image reprojection*.
- **hpgeom**: Fast HEALPix indexing for spherical pixel computations.
- **NumPy, SciPy, Pillow, httpx, FastAPI, Uvicorn**: array maths, interpolation, PNG rendering, archive requests and the web service.

Some packages in `services/api/requirements.txt` (Photutils, SEP, PyVO) are installed but not used by the current code; they are not credited as used.
