# Chrome Extension Release Checklist

## 자동 검증

- [ ] `npm ci`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run verify:extension`
- [ ] `npm run benchmark:parser`
- [ ] `git diff --check`

## Chrome 수동 검증

작은 정상 ZIP이 필요하면 `npm run fixture:browser`로 `sample-data/browser-fixture.zip`을 생성한다.

1. `chrome://extensions`에서 개발자 모드를 켠다.
2. 기존 공미리 개발 빌드가 있으면 새로고침하거나 제거한다.
3. `dist/`를 압축 해제된 확장 프로그램으로 로드한다.
4. 확장 아이콘을 눌러 전체 화면 React 뷰어가 열리는지 확인한다.

### 기본 흐름

- [ ] 한국어·영어 전환과 새로고침 후 언어 유지
- [ ] 실제 Chrome 200% 확대에서 영문·한글 레이아웃 확인
- [ ] 운영체제 다크 모드에서 텍스트·필드·테이블 대비 확인
- [ ] Tab으로 건너뛰기 링크, 업로드, 설정, 결과 탭, 내보내기에 접근
- [ ] 좁은 화면 결과 탭에서 좌우 화살표·Home·End 이동
- [ ] ZIP 드래그 앤 드롭과 파일 선택
- [ ] SHP/DBF/SHX 누락 안내
- [ ] 파싱 진행률과 오류 상태
- [ ] 파싱 중 취소 후 입력이 다시 활성화됨
- [ ] 취소 또는 오류 후 같은 설정으로 재시도
- [ ] CPG 감지 및 UTF-8/CP949/EUC-KR 재파싱
- [ ] PRJ 감지 및 원본 좌표계 표시
- [ ] PRJ가 없을 때 SRID 선택 전 지도 분석 대기
- [ ] 다운로드 ZIP 감지 기능을 켤 때만 `downloads` 권한 요청
- [ ] ZIP 다운로드 완료 시 `ZIP` 배지 표시, 비 ZIP은 무시
- [ ] 확장 아이콘 클릭 후 배지 제거 및 전체 화면 뷰어 열기
- [ ] 기능 끄기 시 `downloads` 권한 제거

### 지도와 테이블

- [ ] Point, LineString, Polygon 표시
- [ ] 전체 영역 자동 맞춤
- [ ] 피처 클릭 속성 팝업
- [ ] 지도 선택 시 속성 테이블 행 자동 이동
- [ ] 테이블 행 및 방향키 선택 시 지도 강조·이동
- [ ] 베이스맵 네트워크 실패 시 테이블과 통계 유지

### 시각화와 대용량

- [ ] 범주 색상
- [ ] 연속값 색상 및 분위수/등간격
- [ ] 포인트 크기
- [ ] 포인트 클러스터와 클러스터 확대
- [ ] Quick/Full 전환
- [ ] Quick 모드 원본/표시 피처 수 안내
- [ ] 파일·피처·좌표 임계값의 자동 Quick 전환과 수동 Full 전환
- [ ] 전체·선택·필터 GeoJSON/CSV 및 필드 선택
- [ ] 원본 좌표계/WGS84 GeoJSON 좌표 확인
- [ ] 75MB·5만 피처 대표 ZIP에서 UI 응답 유지

## 배포 확인

- [ ] `dist/manifest.json`의 이름, 버전, 권한 확인
- [ ] `_locales/ko`, `_locales/en` 포함 확인
- [x] 프로덕션 JS에 Vue 런타임이 포함되지 않음
- [ ] 콘솔 오류 없음
- [ ] README의 지원 기능과 실제 배포 기능 일치
- [ ] 공개 개인정보 처리방침 URL과 스토어 등록 문안의 권한 설명 일치
