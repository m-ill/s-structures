# 이음의 지정 탄성 전달 모델

`p25-elastic-lap-transfer-v1` · Phase25 M3/M4의 전달 모델 기반 구현

두 철근의 축변형과 철근 사이의 등가 분포 스프링을 풀어, 입력한 단일 철근 인장력에 대한 축력 분포·상대 미끄럼·끝단 변형·축방향 유연도를 계산한다. 콘크리트의 전달 경로를 사용자가 지정한 등가 강성으로 축약한다. KDS 정착/이음 길이 규칙에서 이 강성을 추정하지 않는다.

## 입력과 실행

`splice-record`의 선택 입력 세 개를 함께 제공한다.

- `transferStiffness`: 철근쌍의 단위 길이·단위 상대 미끄럼당 전달력, **kN/m²**. 철근-콘크리트 계면의 부착응력/미끄럼 계수와 단위·의미가 다르다.
- `transferElasticSlipLimit`: 해당 등가 강성이 유효하다고 지정한 상대 미끄럼 한계, m.
- `transferReference`: 해당 형상·재료·조건에서의 강성 및 한계에 대한 시험/산정 근거. 256자 이내.

인장 A/B 이음 및 명시 연속 방향만 허용한다. 일부 입력만 있거나 근거가 없으면 저장을 거부한다. 기존 레코드에 입력이 없으면 자동 기본값을 넣지 않는다. 기존 canonical record 검증·버전·원자적 preview/apply 경로를 사용한다. 공유 입력 정의로 네이티브 입력과 WebMCP schema에 동일 필드가 노출된다.

```json
{
  "tool": "evaluate_splice_elastic_transfer",
  "arguments": {
    "inputHash": "현재 모델의 inputHash",
    "spliceId": "SP",
    "barIndex": 1,
    "force": 10,
    "samples": 17
  }
}
```

힘은 **선택 철근 한 개**의 인장력(kN)이며 부재 결과에서 회수한 힘이 아니다. 서비스는 최신 이음 버전·참조 배근 버전·선택 철근·재료·실제 겹침 길이를 조회한다. 한 호출의 station은 2~33개다. 계산 전후 모델 현재성을 검사한다. 화면에는 ‘이음 탄성 전달 계산’ 입력/결과를 연결했다.

## 계산 정의

철근 1은 x=0에서 P를 받고 x=L에서 자유이며, 철근 2는 x=0에서 자유이고 x=L에서 P를 받는다. u1(0)=0은 강체 이동만 제거한다.

- N1 = EA1·u1′, N2 = EA2·u2′
- N1′ = k·(u1-u2), N2′ = -k·(u1-u2)
- δ = u1-u2, β² = k·(1/EA1+1/EA2)
- δ(x) = -P·[cosh(β(L-x))/EA1 + cosh(βx)/EA2] / [β·sinh(βL)]
- δ′(0)=P/EA1, δ′(L)=-P/EA2
- u2(L)-u1(0) = P·L/(EA1+EA2) - EA1·δ(L)/(EA1+EA2) - EA2·δ(0)/(EA1+EA2)

함수는 0 하중에서도 유연도/강성을 반환한다. 큰 βL에서는 지수로 스케일한 쌍곡함수 비를 쓰고 작은 βL에서는 expm1으로 소거 오차를 줄인다. 유한 범위를 벗어나면 실패한다. 입력과 내부 배열을 수정하지 않는다.

제품 서비스는 동일 철근 쌍의 EA=E·As·1000(kN)를 사용한다. 전체 force가 단부의 한 철근에 작용하므로 `force/(As·fy·1000)`과 최대 상대 미끄럼/지정 한계를 확인한다. 범위를 벗어나면 `NOT_CHECKED/SPLICE_TRANSFER_ELASTIC_RANGE_EXCEEDED`이며 선형 예측값을 범위 밖이라고 명시한다. 범위 내 `CALCULATED`는 모델 계산 상태이지 KDS 합격이 아니다.

## 근거 및 적용 경계

[PEER 2007/10 보고서](https://peer.berkeley.edu/sites/default/files/webpeer710_mohamed_m._talaat_khalid_m._mosalam.pdf)의 §2.3 및 §2.4는 이음의 축력·부착력 평형, 미끄럼 구성법칙 및 실험 보정의 필요성을 다룬다. 해당 부분을 확인했으며 310쪽 전체를 검토했다는 의미는 아니다. **위 선형 두 철근 등가 스프링 해는 별도로 유도한 계산이며, 이 보고서의 비선형/이력 모델을 재현한 것이 아니다.**

기존 공식 KDS 14 20 52 원문/해시 metadata의 4.5.1·4.5.2는 관련 이음 상세 출처로만 반환한다. `governsCalculation=false`: 이 조항이 등가 전달강성 식이나 입력값을 승인한다고 표시하지 않는다.

아직 포함하지 않은 사항:

- 콘크리트 응력장·균열·쪼갬·횡방향 평형·편심 전달 모멘트·지압
- 비선형 부착/이력/손상·항복 이후 거동·압축 전달
- 자동 재료/형상별 강성 보정 및 시험 자료 독립 검토
- 해석에서의 개별 철근력 회수, 전역 강성/사용성 및 겹침 구간 극한강도 연결

따라서 기존 `SPLICE_OVERLAP_LOAD_TRANSFER_REQUIRED`와 `RC_SERVICE_SPLICE_STIFFNESS_REQUIRED`는 이 함수 추가만으로 해제하지 않는다. 이 항목들을 처리할 다음 작업은 단면 상태와 전달 자유도 결합, 비선형 구성법칙 및 이음 양단 경계조건을 포함한 해석 연결이다.

## 집중 검증

- 별도 선형 유한요소 조립(축봉 요소 + 일관 분포 스프링 적분) 32/64분할 해와 정확해 수렴 비교.
- 끝단 조건·전 구간 힘 평형·하중 배율·에너지 배율·두 철근 교환 대칭·0하중·약/강 스프링 수치 범위.
- 실제 WebMCP preview/apply/저장 검증/선택 철근 전달 계산, 탄성 범위 초과·근거 누락·stale 거부.
- 화면 입력/전달 및 모델 변경·pagehide 후 결과 노출 방지.
- 기존 이음 레코드 회귀 포함 집중 4파일 통과. 전체 구조의 정확도·시각·독립 방법 적합성 검증은 별도다.


## 완전부착 RC 해석의 철근력 회수 경로

`get_rc_service_bar_forces`는 수렴한 fully-cracked-elastic 결과의 조합 ID·0부터 시작하는 stationIndex를 받아 준비된 철근력을 읽는다. offset/limit(최대 25)로 철근을 나눠 읽는다. 철근 번호는 참조 배근 버전의 1부터 시작하는 순서다. 실제 철근력은 Es·As·strain이며 압축 콘크리트 치환 기여분과 분리한다. 단면의 N/My/Mz 평형 구성과 원본 resultHash/inputHash, 정책/시간 모드 및 관련 KDS 출처를 함께 반환한다.

이 경로는 현재 이음 없는 완전부착 RC 반복 결과에 해당한다. 이음 레코드가 포함된 모델의 RC 반복은 아직 이음 강성 미구현으로 거부되므로, 조회한 힘을 같은 원본의 이음 미끄럼 해석 결과라고 주장할 수 없다. 다음 연결은 이음 자유도와 양단 경계력을 전역 단면/부재 해석에 결합하는 것이다. 강도 검토의 겹침 철근 추가 강도는 여전히 인정하지 않는다.


## 4자유도 양단 요소 강성

`src/solver/elasticLapElement.js`는 [u1(0), u2(0), u1(L), u2(L)]에 대한 4×4 요소 강성, 끝단 힘, 내부 힘/변위, 변형에너지를 계산한다. `elasticLapBasis`의 스케일된 쌍곡함수는 기존 인장력 방식과 공유한다.

EA 합을 S, a=EA1/S, b=EA2/S, R=EA1·EA2/S, w=a·u1+b·u2, δ=u1-u2로 두면 변형에너지는 다음 두 항이다.

- 평균 축변형: S/(2L)·(wL-w0)²
- 상대 미끄럼: Rβ/[2sinh(βL)]·[(δ0²+δL²)cosh(βL)-2δ0δL]

이 식의 Hessian이 요소 강성이다. 상대 항을 q·(δ0-δL)²/2 + Rβ·tanh(βL/2)·(δ0²+δL²)/2로 분리하면 약한 전달강성에서의 소거 오차를 줄일 수 있다(q=Rβ/sinh(βL)). 끝단 힘은 큰 강체 병진에 K를 직접 곱하지 않고 변위차로 구한다.

자유단 index 1,2를 정적 축약하면 기존 이음의 두 단자 강성을 얻는다. 단일 인장력 WebMCP 결과의 `boundaryElement`에 이 강성·자유단/재하단 번호·변위/힘·에너지를 제공한다. 네이티브 결과 JSON에도 같은 구조가 표시된다. `globalAssemblyIncluded=false`를 유지한다.

검증은 강성 대칭/강체 병진 영모드/힘 평형, 독립 Simpson 에너지 적분, 기존 인장력 해의 양단 조건, 자유단 정적 축약 일치, 강·약 전달강성 수치 범위다. 기존 인장력 FE 수렴 검증과 실제 WebMCP도 통과했다.

다음 부재 조립에서는 철근 편심 및 단면 회전을 포함한 기구학이 필요하다. 두 철근의 축방향 변위를 편심 위치의 부재 변위에 단순 대입하면 강체 회전도 상대 미끄럼으로 계산할 수 있다. 단면 회전에 대한 상대 미끄럼 자유도와 철근 축변형·단면 변형의 에너지 결합을 포함하고, 콘크리트/철근 기여를 중복 합산하지 않아야 한다. 현재 4자유도 요소는 이 단계를 구현한 것으로 표시하지 않는다.


## 편심 철근·단면 회전·상대 미끄럼 결합

`coupledLapSection`은 양단 단면 좌표 q=[u,psiY,psiZ]와 네 철근 끝의 상대 미끄럼 s를 사용한다. psi는 epsilon-z·kappaY+y·kappaZ와 일치하는 일반화 좌표이며, 실제 frame 회전 부호와의 매핑은 후속 조립에서 확인해야 한다.

철근 i의 r_i=[1,-z_i,y_i], c_i=r_i·(qL-q0)/L로 두면 철근 변형률은 c_i+s_i′이다. 에너지는 기존 상대 미끄럼 요소 에너지에 다음 항을 더한다.

`sum_i EA_i * [L*c_i^2/2 + c_i*(s_i(L)-s_i(0))]`

따라서 두 단면의 6좌표와 4미끄럼의 10×10 에너지 강성을 구성한다. 들어오는 철근의 시작과 나가는 철근의 끝은 단면에 부착(s=0), 나머지 두 끝은 축력 자유 조건으로 정적 축약한다. 출력은 6×6 단면 결합 강성, 자유단 미끄럼 복원 행렬, 단면 N/My/Mz, 철근 끝단 힘 및 내부 상태다. 일정 단면 변형률을 가정한 두 철근/등가 계면 요소이며 콘크리트 강성은 포함하지 않는다.

상대 미끄럼은 회전하는 단면에 대한 s1-s2이므로, 편심이 있어도 강체 병진/회전에 스프링 에너지가 발생하지 않는다. 순수 축신장 시 단면 회전을 0으로 구속하면 편심에 따른 축력·휨 반력이 생긴다. 이를 사용자가 요청한 부재 해석의 지점 반력으로 오인하지 않도록 출력의 시험 경계조건을 명시한다.

`evaluate_splice_elastic_transfer`의 `sectionCoupling`은 실제 이음의 연속 방향에 따라 들어오는/나가는 철근 좌표를 선택하고, 기존 힘 쿼리의 축신장으로 위 결과를 계산한다. 전역 구조의 회전 변위를 입력받은 결과가 아니다. `concreteIncluded=false`, `globalAssemblyIncluded=false`를 유지한다.

집중 검증: 강성 대칭, 강체 이동/회전, 자유단 힘 0, 에너지 미분과 일반화 힘 일치, 물리적 철근/계면 에너지의 독립 수치 적분, 기존 순수 축력 해, 실제 WebMCP의 편심 모멘트. 전역 조립에서는 이 요소를 기존 완전부착 철근 강성에 단순 추가하지 않고, 이음 구간의 철근 기여를 교체해야 한다. 콘크리트 치환분·구간 연결·프레임 변위 부호/보간·재해석을 함께 처리하는 단계는 아직 미완료다.


## 프레임-단면 부호 변환과 확인된 오류 수정

단면 커널은 `epsilon-z*kappaY+y*kappaZ`, `My=-integral(z*sigma)`, `Mz=integral(y*sigma)`를 사용한다. 프레임 복원은 `[epsilon,w'',v'']` 및 `ry=-w'`, `rz=v'`를 사용한다. 따라서 프레임에서 단면으로 수요를 전달할 때 Mz를 반전하고, 단면 유연도를 프레임에 전달할 때 S·C·S(S=diag(1,1,-1))를 적용해야 한다. 단면 변형률을 프레임 곡률로 읽을 때도 S를 적용한다.

기존 fully-cracked-elastic 반복은 이 변환을 빠뜨렸다. 비대칭 상하 철근의 순수 축인장 합성 모델에서 예상 local-y 처짐 -1.2282346mm가 +1.2282346mm로 계산되는 오류를 재현했다. 공통 `rcFrameConvention` 경계 변환을 적용한 후 독립 물리 변형률 `epsilon-y*v''`의 단면 평형과 일치한다. Mz=+2kNm 추가 하중에서도 변형과 실제 철근력을 독립 계산으로 확인했다.

RC policy v8은 이전 결과를 현재 해석으로 재사용하지 않는다. 위치별 원본 demand는 solver-native로 유지하고 sectionDemand/frameStrain/frameConventionVersion을 별도 저장한다. 철근력 조회의 sectionComponents는 단면 부호이며 두 수요/곡률 규약을 함께 반환한다.

이음 단면 좌표는 q=[u,-ry,-rz]이며, 단면 힘은 일-공액 변환으로 프레임 끝단 힘에 매핑한다. 기존 이음 쿼리의 sectionCoupling에 frameEndForces를 추가했으나, 전체 프레임 강성 조립을 수행한다는 뜻은 아니다.

잔여 부호 감사: 기존 KDS 강도·균열/사용성·기타 상세 평가에서 solver-native 수요가 각 단면 규칙의 부호로 변환되는지 별도로 대조해야 한다. 이번 수치 재현과 수정은 fully-cracked-elastic RC 전역 강성 반복 및 이음 결합 변환 경계에 해당하며, 모든 설계 모듈의 부호 감사 완료로 계상하지 않는다.


## KDS 강도·최소 휨철근·균열 검토의 부호 경계

후속 감사에서 solver-native Mz를 그대로 단면 강도에 넣고 균열 인장면도 같은 부호로 고르는 오류를 확인했다. 하부 2-D20, B=300/H=600mm, fck=24MPa/fy=400MPa의 순수 휨 독립 응력블록 계산과 비교한 시험에서, solver-positive Mz=20kNm을 반대 단면 방향으로 해석해 capacity 약 14.485kNm와 NG를 반환했다. Mz 변환 후 하부 인장에 대한 독립 강도 식과 일치한다.

순수 부호 함수를 core/rcFrameConvention.js로 옮기고 compute/adapters 경로는 재내보내기로 유지한다. toRcSectionDemand는 solver-native 태그를 rc-section으로 변환하며, rc-section 태그는 다시 반전하지 않는다. 미표기 직접 커널 입력은 기존 단면 규약을 유지하고, 알 수 없는 명시 규약은 거부한다.

- KDS 강도: 변환한 단면 수요와 입력 규약/평형 규약을 결과에 보존한다.
- 최소 휨철근: 방향별 강도 호출에 원본 규약을 전달하고 cache key에도 포함한다.
- 균열 간격: 변환된 단면 Mz로 실제 인장면을 선택하고 원본 수요와 단면 수요를 함께 기록한다.
- 명시적 재료법칙 단면 강도: solver-native 방향을 같은 공통 변환으로 전달한다.

실제 WebMCP의 순수 휨 해석→강도/최소 휨철근/균열 검토가 독립 계산과 일치한다. 이 시험의 최소 휨철근은 실제 기본 재료/단면의 1.2Mcr 요구에 부족하여 NG를 유지했다. 강도 부호 오류를 수정했다고 다른 검사까지 OK로 바꾸지 않는다. 평가기 v71로 기존 결과와 구분한다. 사용성 곡률·전단 유효깊이·안정성/연결 상세 등 나머지 규칙의 전체 부호 감사는 계속 필요하다.


## Cubic frame interpolation and bounded slip condensation

`coupledLapFrame` uses frame DOFs `[u,v,w,rx,ry,rz]` at both ends, with `ry=-w′`, `rz=v′`. For bar i, strain is `u′-yi*v″-zi*w″+si′`. Its energy is the integral of `Σ EAi*strain_i²/2 + k*(s1-s2)²/2`. The frame uses cubic Hermite transverse displacement and linear axial displacement. Each of at most 64 slip intervals uses linear slip and two-point Gauss quadrature (exact for the polynomial energy on that interval). Incoming s1(0)=0 and outgoing s2(L)=0; other slips are statically condensed. This is a discretized slip approximation, not the exact hyperbolic solution.

The service compares 16/32/64 interval stiffness using the diagonal of the uncondensed steel stiffness as the energy scale. Condensed diagonals can vanish for physical zero-energy modes, so they are unsuitable relative-error denominators. A .002 change tolerance is an implementation convergence threshold, not a KDS acceptance criterion; failure is explicitly NOT_CHECKED. It is not an a posteriori absolute error bound.

The returned service frame response prescribes the existing axial transfer solution's extension and zero transverse end displacements/rotations. It must not be mistaken for a solved building displacement field. The matrix contains only the two steel pieces and the supplied equivalent interface stiffness. Before global use, replace the original perfect-bond steel contribution, account for displaced concrete, integrate interval boundaries and recover actual global forces. Simply adding this matrix to an existing RC member double-counts reinforcement. Nonlinear bond and ultimate overlap resistance remain unimplemented.


## Compression-only RC host and replacement accounting

`rcLapFrame` composes gross compression-only rectangular concrete, subtracts displaced concrete for **all physical steel pieces**, adds only retained perfect-bond bars and adds each condensed two-piece lap system. A selected original bar is not added a second time. Displaced concrete follows host strain `u′-y v″-z w″`, not the slipped steel strain. This retains the existing point-fibre displaced-concrete approximation; it does not model the finite circular void or local splitting.

Concrete cross-section response uses exact polygon clipping at each axial Gauss station. Its consistent active-region tangent is mapped through the shared Hermite strain-displacement matrix. No tensile concrete, shear/torsion stiffness, transverse interface equilibrium, nonlinear bond or yielding is added. Axial discretization around moving compression boundaries requires refinement before global qualification.

The service uses all bar indices in the current splice record under the prescribed displacement scenario. Other overlapping splice records are rejected pending interval assembly. Stress extrema for piecewise-linear lap steel are extrapolated to interval endpoints from the two Gauss values; retained-bar extrema use the ends of the linear curvature field. The RC-host elastic range has its own status, separate from the queried single-bar axial transfer result. The global solver still rejects spliced RC service models until load-consistent interval assembly and result recovery are implemented.


## Assembled nodal equilibrium

`solveRcLapNetwork` assembles local RC/lap elements through orthonormal member axes into shared global node DOFs. It adds Saint-Venant torsion `GJ/L` once, with no shear deformation, and solves the compression-only material equilibrium by damped Newton iterations. Nodal forces use kN, moments kNm, lengths/displacements m, rotations rad, Ec/Es MPa and GJ kNm². Supports currently prescribe zero DOFs only. This kernel supports explicit nodal loads, not automatic model loads/combinations or P-delta.

Bounds are 20 nodes, 20 elements, 120 DOFs, sum of subdivisions times max(1, lap pair count) <=256, 30 iterations and a cooperative 10 second deadline. Nonpositive tangent/mechanism and nonconvergence withhold displacements. A zero residual alone cannot qualify an unsupported model: the constrained tangent must also be positive definite.

`solve_rc_splice_interval` exposes the current splice interval as a **clamped-start cantilever** with explicit local tip `[Fx,Fy,Fz,Mx,My,Mz]`. This is not the building's boundary-value problem. It solves 16/32/up to64 subdivisions and compares tip displacements, scaling rotations by interval length. This convergence check is not an absolute error certificate. Existing RC service model splice rejection remains until original member interval assembly, support/load transfer and member-result recovery are implemented.


## Worker execution boundary

The product interval solve now runs through the shared bounded module Worker owner. The main thread admits the source snapshot/transfer and a conservative 32MiB numerical working estimate before copying. It enforces one active solve, a hard 10-second timeout, cancellation, source currentness after response, and reservation release in finally. This estimate is not measured peak heap. UI field edits and pagehide cancel/discard pending responses. Numerical model and building-integration limitations above remain unchanged.


## Source member interval preparation

`prepareRcSpliceMemberMesh` partitions source members at reinforcement and lap boundaries, retains source station/detail/node IDs, and follows the shared mechanical piece lanes used by fabrication paths. Outside a lap it retains the continuing physical bar coordinate, rather than always reverting to the original bar lane. Physical steel volume includes overlap pieces exactly once.

A condensed lap must remain one whole interval: introducing an internal mesh boundary would incorrectly reapply attached/free-tip conditions and erase slip continuity. Crossing lap records with unequal interval bounds therefore remain unsupported until internal slip DOFs are shared across subelements. Member offsets/releases are also rejected pending matching kinematics. The exposed mesh query prepares no loads or supports and does not execute an analysis. Existing fabricated hook/end-body extents are not a qualification of the straight analytical longitudinal-body idealization.


## Source model nodal-load solve

`prepareRcModelNetwork` merges original endpoints by node ID while preserving separate virtual boundary nodes. It uses common fixed/prescribed support and force/moment direction owners. `solve_rc_splice_model` runs the original model's selected nodal-load combination in the existing bounded Worker, rather than imposing the interval test's cantilever boundary. Nonzero prescribed motion, distributed loads, self-weight, diaphragms/general constraints, shear deformation, P-delta and unsupported component kinematics are rejected, not dropped.

Results map original node displacement/reaction and segment local **nodal resisting forces**, explicitly distinct from solver-native section resultants. Standard member-force/shape recovery and design workflow publication remain pending. This path is an implemented bounded first-order RC nodal-load model solver, not whole-program structural design qualification. Source/currentness/cancellation and memory limits are shared with the interval Worker.


## Distributed member load assembly

The source-model path now partitions uniform/triangular UDL, partial UDL and trapezoid loads at physical reinforcement/lap boundaries. It uses the existing fixed-end load input/recovery contract and shared consistent Hermite load integration. Original load intensities are interpolated before clipping, and the combination factor is applied once. Per-element span loads and original/clipped source ranges are retained.

Global equilibrium uses internal forces and the assembled equivalent nodal external vector. Physical member boundary forces are `internal end forces - consistent element load vector`; the raw internal force is retained separately by the network. This is necessary for a loaded element's free end to carry zero boundary traction. Standard member interior force/shape recovery remains pending. Slip/quadrature refinement does not refine the cubic frame displacement mesh within a physical region, and the model result explicitly flags that distinction.


## Source self-weight

Enabled source self-weight now uses the existing createSelfWeightLoads owner and passes through the same partitioned distributed-load path. Its existing bulk material density, gross section area, gravity and load-case policy are preserved. A generated self-weight ID colliding with an existing input load is rejected. Source loads are not mutated; combination factors are applied once. Bulk RC density is not supplemented with a separately guessed lap-steel mass correction, and the basis is returned explicitly. Custom member property overrides remain rejected until stiffness/weight mapping is complete.


## Concentrated member loads

Point forces and member couples now use the shared fixed-end contracts after remapping the original position into exactly one segment. An internal boundary belongs to its right element; the final member endpoint belongs to the last element. Both t/at aliases are set to the same local ratio, and the combination multiplier is applied to P/M once. Original position and the ownership rule are retained with the segment recovery data. Directional moment components retain their shared owner convention. Thermal/initial-strain loads and standard interior force/shape recovery remain pending.


## Prepared interior force stations

The model Worker now prepares segment forceRecoveryInput and solver-native N/Vy/Vz/Tq/My/Mz through the existing member-force owner. Directional couples are normalized into supported axis moments. The recovered right-end force must agree with the opposite physical boundary vector; unsupported load types and failed equilibrium reject publication. Stations include a bounded regular grid, distributed-load boundaries and both sides of concentrated jumps, with original member x coordinates and detail/version provenance. This is not a certified extrema envelope, displacement-shape recovery or standard design-source publication.
