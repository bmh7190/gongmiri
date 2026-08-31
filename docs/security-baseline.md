# Dependency Security Baseline

측정일: 2026-08-31

## 결과

`npm audit --json` 기준 알려진 취약점은 0건이다.

| 심각도 | 건수 |
| --- | ---: |
| Critical | 0 |
| High | 0 |
| Moderate | 0 |
| Low | 0 |

## 이번 조치

- Vite를 7.2.2에서 7.3.6으로 업데이트했다.
- `@crxjs/vite-plugin`을 2.2.1에서 2.7.1로 업데이트했다.
- 취약한 JSZip 2.x를 사용하는 구형 `shp-write`를 `@mapbox/shp-write` 0.4.3과 JSZip 3.10.1로 교체했다.
- Rollup, PostCSS, Nano ID 등 전이 의존성을 호환 범위의 수정 버전으로 갱신했다.
- 교체 후 테스트, 타입 검사, 확장 프로덕션 빌드를 다시 통과했다.

`npm audit`은 공개 권고 데이터베이스에 등록된 패키지 취약점만 확인한다. Chrome Web Store 제출 전과 정기 릴리스 시 다시 실행하고, ZIP 파서의 입력 검증과 권한 최소화는 별도로 계속 검토해야 한다.
