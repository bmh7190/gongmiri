# React Migration Baseline

작성일: 2026-08-30

## 기준 소스

- 마이그레이션 당시 비교용 Vue 진입점: `src/viewer/main.ts` (이식 완료 후 제거)
- 프로덕션 React 진입점: `extension/viewer.html` → `src/react/main.tsx`
- 독립 검증용 React 진입점: `extension/react-viewer.html` → `src/react/main.tsx`
- 대표 대용량 샘플: `sample-data/benchmark-zip.zip` (78,951,145 bytes)

`sample-data/`는 저장소에서 무시되므로 CI용 소형 테스트 픽스처를 별도로 추가해야 한다.

## 기존 Vue 기능 체크리스트

- [ ] ZIP 드래그 앤 드롭 및 파일 선택
- [ ] SHP/DBF/SHX 필수 구성 검사
- [ ] CPG 인코딩 감지와 수동 변경
- [ ] PRJ 기반 SRID 감지와 수동 재투영
- [ ] Worker 진행률과 오류 처리
- [ ] Point/Line/Polygon 지도 렌더링
- [ ] 지도 클릭 팝업과 선택 강조
- [ ] 지도 ↔ 속성 테이블 선택 동기화
- [ ] 컬럼 채움률·고유값·숫자 통계
- [ ] 범주·연속 색상과 포인트 크기 시각화
- [ ] 포인트 클러스터링
- [ ] Quick/Full 대용량 모드

각 항목은 React 이식 후 동일 ZIP을 양쪽 화면에서 비교하고 체크한다.

## 첫 React 수직 기능

현재 React 경로에 다음 흐름이 연결됐다.

```text
ZIP 선택/드롭
→ ZIP 구성 검사
→ 기존 parser Worker 실행
→ FeatureCollection 수신
→ 프레임워크 독립 컬럼 요약
→ 파일·피처·지오메트리·채움률 표시
→ geojson-vt 기반 MapLibre 지도 표시
→ 지도 피처 선택 상태를 React 앱과 공유
→ 가상 속성 테이블 및 지도↔테이블 선택 동기화
→ 인코딩·원본 좌표계 변경 후 재파싱
→ 범주·연속 색상, 포인트 크기, 클러스터 시각화
→ Quick/Full 샘플 모드
```

지도 속성 팝업, 전체 속성 테이블, 시각화 옵션과 Quick/Full 모드까지 이식됐다. 프로덕션 확장 진입점도 React로 전환했다. 로컬 브라우저 기능 비교와 자동 회귀 검사를 마친 뒤 Vue 소스와 의존성을 제거했다. 실제 Chrome 권한·서비스 워커 검증은 릴리스 체크리스트에 미완료 항목으로 남아 있다.

## 빌드 기준

### 마이그레이션 전 Chrome 확장

```text
npm run build
Vue viewer JS: 약 1,241kB / gzip 약 355kB
parser Worker: 약 137kB
```

### React 마이그레이션 화면

```text
npm run build:react
초기 viewer JS: 약 214kB / gzip 약 69kB
React vendor: 약 61kB / gzip 약 20kB
지연 로딩 MapLibre vendor: 약 1,046kB / gzip 약 284kB
parser Worker: 약 137kB
```

MapLibre 컴포넌트는 ZIP 분석 결과가 생긴 뒤 지연 로딩된다. 초기 화면은 지도 vendor를 내려받지 않는다. 프로덕션 산출물에서 Vue 런타임 문자열이 포함되지 않는 것도 확인했다.

## 파서 벤치마크

2026-08-31 `npm run benchmark:parser` 결과:

```text
ZIP 크기: 75.3MB
피처: 50,000개
Worker 등가 파싱: 2,813ms
```

기준 목표인 50MB·5만 피처 5초 이내를 만족한다.

## 타입 경계

- React UI·도메인·Worker: `tsconfig.react.json`
- Vite·확장 빌드 설정: `tsconfig.node.json`

`npm run typecheck`는 두 프로젝트를 검사한다. Vue용 `tsconfig.app.json`, SFC 선언과 `vue-tsc`는 이식 완료 후 제거했다.

## 2026-08-31 브라우저 체크포인트

로컬 React 화면에 78,951,145바이트·50,000피처 합성 ZIP을 실제 파일 선택으로 넣어 확인했다.

- 초기 화면과 분석 결과 화면 모두 콘솔 오류·경고 없음
- 한국어/영어 즉시 전환 및 새로고침 후 영어 선택 유지
- PRJ에서 EPSG:4326 감지, 50,000 Point 지도와 30개 가상 행 렌더링
- Quick 전환 시 전체 50,000개 중 균등 샘플 25,000개 표시
- 범주 색상, 포인트 클러스터, 테이블 Enter/방향키 선택 정상
- 320px·390px 폭에서 문서 가로 넘침 없음; 넓은 속성 테이블은 내부 스크롤로 격리
- 영문 UI와 200% 확대에 해당하는 590px 유효 폭에서 초기·결과 화면의 잘림과 문서 가로 넘침 없음
- 진행 상태는 번역 가능한 Worker 코드와 전용 `aria-live`, 오류는 `alert`로 노출

합성 DBF가 모든 필드를 문자열로 저장하므로 연속값 색상과 포인트 크기는 숫자형 테스트 fixture를 추가한 뒤 별도로 검증한다. 이 확인은 일반 웹 런타임 기준이며, `dist/`를 압축 해제 확장으로 로드하는 Chrome 권한·서비스 워커 검증을 대체하지 않는다.

## 좌표계 정확성 보정

React 이식 중 Worker 좌표 변환 경로를 단일화했다. `shpjs.parseShp`가 전달받은 PRJ/proj4 정의를 이용해 이미 WGS84로 변환하므로, 이후 좌표에 별도 `proj4` 변환을 반복하던 코드를 제거했다.

- EPSG:3857 정의를 표준 구면 Web Mercator(`a=b=6378137`)로 수정
- 3857 합성 좌표가 127°E·37°N으로 한 번만 변환되는 통합 테스트 추가
- PRJ에 숫자 authority가 없어도 West/East/Central Belt 2010을 5181/5183/5186으로 구분
- 도메인 테스트 37개로 인코딩, 좌표계, ZIP·SHP 검사, Worker 준비, 탐색·필터, 내보내기, 다운로드 감지, 시각화, 포맷 회귀 검사
- EPSG 4326, 3857, 5179, 5186 좌표를 WGS84로 변환하는 회귀 검사
- 중첩 폴더의 다중 레이어와 한글 파일명을 검사하는 합성 ZIP 회귀 검사
- 필수 구성 파일 누락과 손상 ZIP을 구분하는 회귀 검사
- UTF-8, CP949, EUC-KR 실제 DBF 레코드와 CPG 부재 fallback 검사
- 직접 구성한 Shapefile 바이너리로 MultiPolygon과 잘린 SHP 실패 검사
- 합성 Shapefile로 Point, LineString, Polygon의 4326 파싱 타입 검증

`@mapbox/shp-write@0.4.3`가 MultiPolygon을 생성하지 못하는 제약은 두 개의 독립 외곽 링을 가진 Shapefile 바이너리를 테스트에서 직접 구성하는 방식으로 보완했다.

## 취소·재시도 체크포인트

파싱 중 취소하면 현재 Worker와 작업 Promise를 `AbortError`로 종료하고 새 Worker를 즉시 준비한다. 오류 화면의 재시도는 마지막으로 검사한 파일과 인코딩·SRID 설정을 그대로 사용한다. 로컬 브라우저 자동화에서는 일반 파일 선택 이벤트를 확인했지만 75MB 파일 전달이 자동화 계층에서 장시간 지연돼 취소 타이밍 재현은 완료하지 못했다. 따라서 이 흐름은 `dist/`를 실제 Chrome 확장으로 로드한 수동 검증 항목으로 유지한다.
