# SB1 source transcription R1

Status: CONTENT_LOCKED_PENDING_EXTERNAL_REVIEW

## Source custody

- HTML: STRIX-verification-21/html/SB1.html, engine publication snapshot v1.0.4.
- Case PDF: STRIX-verification-21/reports/SB1.pdf, engine narrative v1.0.2, 2 pages.
- Manual: STRIX-verification-21/documents/StrixVerificationManual.pdf, printed pages 1-2.
- Raw records/SB1.json and evidence archive SHA remain unpublished; STRIX R4 rerun is therefore unavailable.

## Geometry, material and loading

- Cantilever length L = 3000 mm.
- Rectangular section b x h = 300 x 500 mm.
- Area A = 150000 mm2.
- Strong inertia Iz = 3.125e9 mm4.
- Weak inertia Iy = 1.125e9 mm4.
- Elastic modulus E = 26700 MPa.
- Poisson ratio nu = 0.2.
- N1 fixed in 6 DOFs.
- N2 load Fz = -1000 N.
- Self-weight off; linear static analysis.

## Independent closed form

- tip uz = -P*L^3/(3*E*I) = -0.10786516853932584 mm at full precision.
- tip ry = +P*L^2/(2*E*I) = 5.393258426966292e-5 rad at full precision.
- support Rz = +1000 N.
- support My = -3000000 N-mm.

## STRIX published display values

- N2.uz = -0.107865 mm.
- N2.ry = 5.3933e-5 rad.
- N1.Fz = +1000 N.
- N1.My = -3e6 N-mm.
- Published tolerance = 1%; P17-M2 proposed qualification tolerance = 0.01% and remains externally unapproved.

The HTML and both PDF pages were checked by byte hash and visual rendering. This transcription does not claim a STRIX R4 rerun or MIDAS result.
