# 공미리 개인정보 처리 안내 / Gongmiri Privacy Notice

최종 수정일: 2026-08-31

공미리는 Shapefile ZIP을 사용자의 Chrome 브라우저 안에서 검사하는 확장 프로그램이다. 사용자가 선택한 ZIP, SHP 도형, DBF 속성 및 생성된 분석 결과는 공미리 개발자나 별도 분석 서버로 전송하지 않는다.

## 처리하는 정보

- 사용자가 직접 선택한 ZIP: 메모리에서 로컬 분석에만 사용하며 공미리가 영구 저장하거나 외부로 전송하지 않는다.
- 언어와 다운로드 감지 설정: `storage` 권한으로 사용자의 브라우저에 저장한다.
- 다운로드 감지를 켠 경우: 선택 권한인 `downloads`를 사용해 완료된 항목이 ZIP 후보인지 확인한다. 최근 후보의 다운로드 ID, 경로를 제거한 파일명, 감지 시각만 로컬 저장하며 파일 내용과 전체 로컬 경로는 읽거나 전송하지 않는다.
- 베이스맵: 지도 배경 타일을 표시할 때 `basemaps.cartocdn.com`으로 일반적인 네트워크 요청이 발생할 수 있다. 선택한 ZIP이나 DBF 속성은 이 요청에 포함하지 않는다. 베이스맵이 실패해도 로컬 분석 결과는 유지된다.

공미리는 개인정보를 판매하거나 광고, 신용 평가, 맞춤형 프로파일링에 사용하지 않는다.

## 권한 사용 목적

- `storage`: 언어, 다운로드 감지 사용 여부 및 최소한의 최근 ZIP 후보 메타데이터 저장.
- 선택형 `downloads`: 사용자가 기능을 켰을 때 완료된 ZIP 다운로드 후보 감지. 기능을 끄면 권한을 제거한다.
- `https://basemaps.cartocdn.com/*`: 지도 배경 타일 조회.

## 보관과 삭제

ZIP 분석 데이터는 현재 탭의 메모리에서만 유지되며 탭을 닫거나 새 파일을 열면 교체된다. 저장된 설정과 최근 후보 메타데이터는 확장 프로그램을 제거하면 Chrome이 삭제한다. 다운로드 감지를 끄면 관련 권한이 제거되며, 사용자는 Chrome 확장 설정에서도 언제든 권한을 철회할 수 있다.

## English summary

Gongmiri processes user-selected Shapefile ZIPs locally in Chrome. ZIP contents, geometries, DBF attributes, and analysis results are not uploaded to the developer or an analysis server. The `storage` permission keeps language and feature preferences locally. If the user explicitly enables downloaded-ZIP detection, the optional `downloads` permission checks completed items and stores only the download ID, basename, and detection time; it does not read file contents or retain full local paths. Basemap tile requests may be sent to `basemaps.cartocdn.com`, but selected datasets and attributes are never included.

Before publishing, replace this paragraph with the maintainer's support email and public policy URL required by the Chrome Web Store listing.
