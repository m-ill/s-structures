# SB1 P17-M2 modeling notes R1

Status: CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL

- Geometry: one 3.0 m member from N1 to N2 along global +X.
- Support: N1 fixed in all six DOFs; N2 free.
- Load: 1 kN at N2 along global -Z; self-weight off.
- Material: E=26,700 MPa, nu=0.2, G=11,125 MPa.
- Section: 0.3 x 0.5 m rectangle, A=0.15 m2, Iy=0.001125 m4, Iz=0.003125 m4.
- Formulation: S-Structures in-house linear 3D frame with shear deformation disabled and geometric stiffness off.
- Axis routing: member local x is global +X; strong Iz is used for global Z bending and global My reaction.
- Non-controlling values: J and shear areas satisfy the 3D product schema but do not affect this pure-bending, no-shear case.
- Product extraction is identity-only in m, rad, kN and kN-m; published STRIX values are converted before execution.
- MIDAS R4 model/export is unavailable and must not be claimed.
- Model proposal hash: 437c0c34ea5d9823a0ec105e25a9a4683ce2e11a5d882ef3d14f026691d7b3bf

No solver or benchmark was executed while creating this lock revision. Independent model/release attestations remain required.
