# KDS Load Rule Pack Status

## Scope

`KDS-41-12-00:2022@MOLIT-2024-846` is a source-attached candidate rule pack for the general load combinations in KDS 41 12 00:2022. It contains seven strength combinations and eight allowable/service combinations.

The legacy `KDS-STYLE-CANDIDATE@M44` pack remains unchanged and available for compatibility. It is not replaced by the exact pack.

## Source Status

| Field | Value |
| --- | --- |
| Code | KDS 41 12 00 |
| Edition | 2022 |
| Edition date | 2022-10-11 |
| Consolidating notice | MOLIT Notice 2024-846 |
| Notice/effective date | 2024-12-24 |
| Publication status | effective |
| Rule-pack status | candidate |
| Evidence status | source-attached |
| Source file hash | none |

Official references:

- e-Nara standard page: https://www.standard.go.kr/KSCI/technologyIntro/getTechnologyDetailView.do?trgId=0000000026&trgReformNo=0006
- MOLIT notice page: https://www.molit.go.kr/USR/I0204/m_45/dtl.jsp?gubun=&idx=18415

The official pages identify KDS 41 12 00 and MOLIT Notice 2024-846, but no downloaded official source file is stored and hashed in this repository. Therefore the pack remains `candidate`, its `sourceHash` remains `null`, and it must not be described as globally verified or globally auto-applicable.

## Encoded Rules

The strength set uses the 2022 wind factor of `1.0`. The allowable set uses `0.65W`; the 0.75 companion form therefore uses `0.4875W`. The seismic factors remain `1.0E` for strength and `0.7E` for allowable design.

Alternative terms are represented as named independent groups. In particular, strength rule 3 expands `(Lr/S/R)` independently from `(L/W)`, and allowable rule 6 expands `(W/E)` independently from `(Lr/S/R)`. Expansion uses the cartesian product of available alternatives, selects one load case per group, and does not insert a factor for an absent family.

## Project Approval

Candidate combinations can be previewed without mutating the model. Global candidate apply remains blocked.

A project engineer can create a project approval snapshot only from a current preview. The snapshot records:

- reviewer identity;
- `reviewedAt`;
- project id;
- review note;
- design method;
- model-input hash;
- exact normalized rule and generated-factor snapshot hash;
- approval integrity hash.

Apply rechecks the project, design method, model hash, rule/factor snapshot hash, source-attachment status, publication status, and approval integrity. A stale model, changed rule/factor snapshot, changed project, changed method, or tampered approval blocks apply.

Applied combinations have `origin: manual-reviewed`, `approvalStatus: project-approved`, and `userModified: true`. Their approval provenance is frozen in memory and retained with each combination so later generated merges preserve them instead of silently overwriting or removing them.

Project approval is not global KDS certification, does not make the candidate pack globally verified, and does not authorize reuse on another project, model, or design method. Any official amendment, source replacement, or factor/rule change requires a new preview and a new project approval snapshot.
