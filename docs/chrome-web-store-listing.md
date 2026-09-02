# Chrome Web Store 등록 문안

## 기본 정보

- 이름: 공미리 — Shapefile ZIP 미리보기
- 짧은 설명: Shapefile ZIP의 지도, 속성, 품질을 서버 업로드 없이 Chrome에서 빠르게 확인합니다.
- 카테고리 제안: 생산성
- 기본 언어: 한국어

## 상세 설명

공미리는 `.shp`, `.dbf`, `.shx`가 포함된 Shapefile ZIP을 브라우저 안에서 분석하는 Chrome 팝업 뷰어입니다.

- 지도에서 Point, LineString, Polygon, MultiPolygon 분포 확인
- DBF 컬럼의 채움률, NULL, 고유값, 혼합 타입 품질 확인
- 속성 정렬·컬럼 표시·고정·순서 변경과 지도 연동
- 전체 결과에서 필요한 컬럼을 골라 GeoJSON 또는 UTF-8 CSV로 저장
- WGS84 또는 감지한 원본 좌표계로 GeoJSON 저장
- UTF-8, CP949, EUC-KR 및 주요 국내 좌표계 지원
- 대용량 데이터의 자동 Quick 미리보기와 수동 Full 전환
- 한국어·영어, 반응형 UI, 시스템 다크 모드 지원

데이터는 기본적으로 현재 브라우저에서만 처리됩니다. 다운로드 감지는 선택 기능이며, 켤 때만 Chrome의 다운로드 기록 권한을 요청합니다. 감지된 ZIP도 자동으로 읽거나 업로드하지 않고 사용자가 뷰어에서 직접 선택합니다.

## English listing

- Name: Gongmiri — Shapefile ZIP Preview
- Short description: Inspect Shapefile ZIP maps, attributes, and data quality locally in Chrome without uploading datasets.

Gongmiri is a Chrome popup viewer for Shapefile ZIP archives. Explore geometry on a map, review DBF column quality, synchronize table rows with the map, and export the complete result with selected columns as GeoJSON or UTF-8 CSV. Large datasets can automatically open in a responsive Quick preview, while Full mode remains available. Korean and English interfaces, responsive layouts, and the system dark theme are supported.

## 권한 근거

- `storage`: 언어와 다운로드 감지 설정을 기기에 유지.
- `downloads` (optional): 사용자가 다운로드 ZIP 감지를 켠 경우 완료된 ZIP 후보만 식별.
- `basemaps.cartocdn.com`: 지도 배경 타일 표시. 사용자 데이터는 전송하지 않음.

## 등록 전 준비물

- [ ] 공개된 개인정보 처리방침 URL과 지원 이메일
- [ ] 128×128 아이콘 및 스토어 요구 크기의 홍보 이미지
- [ ] 업로드, 지도, 품질, 속성 테이블, 내보내기, 다크 모드 스크린샷
- [ ] 단일 목적 설명과 각 권한의 최소 사용 근거
- [ ] Windows Chrome 수동 체크리스트 완료
- [ ] 실제 등록 버전과 `package.json`/매니페스트 버전 일치
