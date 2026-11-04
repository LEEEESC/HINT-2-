# 취업 정보 허브 — 설치형 웹앱

URL에서 공고 정보를 불러와 자동 보관하고, 자기소개서 파일 첨부·휴지통·복원을 지원하는 한국어 PWA입니다.

## 실행

Node.js 24 사용. 외부 npm 의존성이나 API 키가 필요하지 않습니다.

```sh
npm test
npm run build
npm run dev
```

Vercel: Framework Other, Build `npm run build`, Output `dist`. GitHub main 브랜치 연결 시 push마다 자동 배포됩니다. `/api/import`는 Node.js Vercel Function입니다.

## 데이터 보관 방식

- 공고와 자기소개서 파일은 **현재 브라우저의 IndexedDB**에 보관합니다.
- GitHub나 Vercel 서버에 공고 목록·자기소개서 파일을 업로드하지 않습니다. URL 메타데이터 수집 요청만 서버로 보냅니다.
- 다른 기기/브라우저와 자동 동기화되지 않습니다. 사이트 데이터 삭제나 시크릿 모드 종료로 자료가 없어질 수 있으므로 `백업 다운로드`를 사용하세요.
- 백업은 첨부파일이 포함된 JSON이며 개인정보가 포함될 수 있습니다. 백업 복원은 같은 URL의 기존 공고를 덮어쓰지 않고 새 항목만 병합합니다.
- 공고를 처음 삭제하면 휴지통으로 이동합니다. 복원할 수 있으며 휴지통에서 영구 삭제하면 해당 공고와 첨부파일이 함께 제거됩니다.

## 기존 Google 버전

`legacy/apps-script/Code.gs`, `legacy/apps-script/index.html`에 원본 최신 버전을 보존했습니다. 기존 시트·Drive 데이터는 그대로 남으며 PWA로 자동 이관되지 않습니다. Google 계정 인증과 시트/Drive 연결 설정은 이 기기 저장 버전과 별도로 필요합니다.

## 앱 설치

HTTPS 배포 주소를 열고 앱 설치 버튼을 누르세요. iPhone은 Safari 공유 → 홈 화면에 추가를 사용합니다. PWA는 APK/IPA가 아니며 앱스토어 설치가 필요하지 않습니다. 설치 지원 여부는 브라우저와 Vercel 인증 정책에 따라 달라집니다.

## URL 수집

사람인·잡코리아·자소설닷컴·인크루트·디맨드의 HTTPS URL만 허용합니다. 모든 리다이렉트도 검증하며 응답 크기와 시간을 제한합니다. JSON-LD JobPosting·메타태그를 사용하므로 로그인 필요, 봇 차단, 자바스크립트 전용 공고는 정보가 누락될 수 있습니다. 이때 URL을 보관한 후 직접 보완할 수 있습니다.
