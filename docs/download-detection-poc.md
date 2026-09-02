# 다운로드 감지 PoC

작성일: 2026-08-31

## 결정

공미리의 기본 기능은 `storage` 권한만 사용한다. 다운로드 감지는 사용자가 뷰어에서 기능을 켤 때 요청하는 `downloads` 선택 권한으로 제공한다. 완료된 ZIP 후보가 있으면 확장 아이콘에 `ZIP` 배지를 표시하고, 아이콘을 누르면 팝업 뷰어를 연다. 파일 내용은 자동으로 읽지 않으며 사용자가 뷰어에서 해당 파일을 선택한다.

Chrome은 선택 권한을 `optional_permissions`에 선언하고 사용자 제스처 안에서 요청하도록 안내한다. `chrome.downloads`는 `downloads` 권한이 필요하며 다운로드 상태가 `complete`로 바뀔 때 `onChanged`가 발생한다.

- [Chrome permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Chrome downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads)

## 접근 방식 비교

### 다운로드 경로에서 로컬 파일 직접 읽기

`chrome.downloads`가 제공하는 파일명은 다운로드 메타데이터다. 그 문자열만으로 확장 페이지가 임의의 로컬 파일을 `File` 객체처럼 읽는 구조는 채택하지 않는다. File System Access API 역시 파일 선택기를 사용자 제스처 안에서 열고 사용자가 파일 접근을 허용해야 한다.

- 장점: 원본 서버에 다시 요청하지 않는다.
- 제약: 사용자 선택 없이 다운로드 경로의 파일 내용을 바로 읽는 흐름으로 사용할 수 없다.
- 결론: 감지 이후 기존 파일 입력으로 연결한다.

[File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)

### 원본 URL 재요청

다운로드 URL을 다시 `fetch`하는 방식은 기본 경로로 채택하지 않는다.

- 임의 출처 요청에는 host permission이 필요하다.
- 로그인 쿠키, POST body, 일회성 URL, 만료 토큰이 필요한 다운로드는 재현되지 않을 수 있다.
- 사용자가 이미 받은 대용량 파일을 다시 내려받아 네트워크와 메모리를 중복 사용한다.
- 전체 URL이나 토큰을 저장하면 개인정보·보안 범위가 커진다.

[Chrome extension cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)

### 사용자 파일 선택

- 장점: 접근 대상이 명확하고 기존 파서 흐름을 그대로 사용한다.
- 단점: 다운로드 후 한 번의 선택 동작이 남는다.
- 결론: 현재 PoC의 복구 가능하고 권한이 가장 작은 기본 경로다.

## 개인정보 경계

- 로컬 파일 내용과 전체 다운로드 경로를 저장하지 않는다.
- 원본 URL, 쿼리, 헤더와 인증 정보를 저장하지 않는다.
- 최근 감지 정보는 다운로드 ID, 파일의 basename, 감지 시각만 `chrome.storage.local`에 저장한다.
- 기능을 끄면 활성 플래그를 지우고 `downloads` 권한을 제거한다.
- 감지가 실패해도 드래그 앤 드롭과 파일 선택은 항상 유지한다.

## 남은 Chrome 검증

- 일반 GET ZIP, 로그인 GET ZIP, POST 다운로드, 일회성 URL을 각각 확인한다.
- 확장 재시작과 서비스 워커 재기동 후 이벤트 수신을 확인한다.
- 이름에 `.zip`이 없지만 ZIP MIME인 다운로드의 처리 정책을 결정한다.
- 시크릿 모드에서는 최근 감지 정보를 저장하지 않는 정책을 검토한다.
- 권한 거부, 기능 끄기, 확장 업데이트 후 권한 상태를 확인한다.
