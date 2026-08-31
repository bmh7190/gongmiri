# Parser Performance Baseline

측정일: 2026-08-31  
런타임: Node.js v24.11.0, Windows 로컬 환경

벤치마크 스크립트는 합성 Shapefile ZIP을 생성한 뒤 Worker와 같은 ZIP 해제·SHP·DBF 결합 경로를 측정한다. 생성한 ZIP은 기본적으로 측정 후 삭제하며 `--keep`으로만 보존한다.

## 결과

| 명령 | 데이터 | 모드 | 파서 등가 로직 |
| --- | --- | --- | ---: |
| `npm run benchmark:parser` | 5만 Point / 5만 좌표 | Full | 2,079.40 ms |
| `npm run benchmark:large` | 10만 Point / 10만 좌표 | Quick 선행 샘플 2.5만 | 3,687.32 ms |
| `npm run benchmark:polygon` | 1만 Polygon / 51만 좌표 | Quick | 242.87 ms |

5만 피처 Full 5초와 10만 피처 Quick 4초 목표를 이 환경의 등가 로직에서는 충족했다. ZIP 생성 시간은 제품 파싱 시간에 포함하지 않는다.

Quick은 SHX 레코드 인덱스로 원본 규모와 좌표 수를 먼저 계산한다. 2.5만 피처를 초과하면 SHP 레코드와 대응 DBF 행을 균등 추출한 뒤에만 도형·속성을 파싱하므로, 전체 파싱 후 샘플링하던 기존 10만 Point 결과 약 6.8초에서 약 3.69초로 줄었다.

## 해석 제한

- Node 기반 등가 로직 측정이므로 Chrome Worker의 메시지 전달, 통계 계산, 지도 첫 렌더 시간은 포함하지 않는다.
- 포인트 중심 합성 데이터라 복잡한 Polygon 좌표 수와 실제 DBF 분포를 대표하지 않는다.
- 실제 Chrome Worker의 메시지 전달과 지도 첫 렌더를 포함한 4초 목표는 Windows Chrome에서 별도로 확인해야 한다.
- 비교 가능한 추세를 위해 같은 장비에서 3회 이상 반복해 중앙값을 기록하는 것이 좋다.
