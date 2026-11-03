# 하루장부

HTML/CSS/JavaScript + Node.js/Express + Neon PostgreSQL 개인 가계부입니다. 지출 추가·수정·삭제, 날짜 검색, 월 합계, 카테고리 합계 및 막대그래프를 제공합니다. 금액은 원 단위 정수이며 여러 사용자가 분리된 서비스가 아닌 비밀번호 하나로 이용하는 개인용 앱입니다.

## 로컬 실행

Node.js 22 이상이 필요합니다. Windows PowerShell에서 실행합니다.

```powershell
npm.cmd install
Copy-Item .env.example .env
```

`.env`를 로컬 편집기에서 열어 다음 값을 설정하세요. 비밀 값을 채팅이나 GitHub에 올리지 마세요.

- `DATABASE_URL`: Neon 프로젝트의 Connect에서 복사한 PostgreSQL 연결 문자열. `sslmode=require`를 유지합니다.
- `APP_PASSWORD`: 추측하기 어려운 긴 비밀번호를 설정합니다. 기본 비밀번호는 제공하지 않습니다.
- `PORT`: 선택 사항, 기본 3000.

```powershell
npm.cmd start
```

http://localhost:3000 에 접속합니다. 개발 중 자동 재시작은 `npm.cmd run dev`, 검증은 `npm.cmd test`입니다. 첫 인증된 DB 요청 시 `expenses` 테이블을 자동 생성하므로 연결 계정에 테이블 생성 권한이 필요합니다. 별도 마이그레이션 명령은 없습니다. 접속 정보가 없으면 화면은 열리지만 DB 기능은 환경변수 설정 안내를 반환하며 임시 저장소로 대체하지 않습니다.

## GitHub + Vercel 배포

1. GitHub에서 빈 저장소를 만들고 아래 명령으로 소스를 올립니다. `.gitignore`에 의해 `.env`와 `node_modules`는 제외됩니다. 커밋 전 `git status`로 확인하세요.

```powershell
git init
git add .
git commit -m "Build personal expense ledger"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

2. Vercel의 Add New Project → 해당 GitHub 저장소 Import를 선택합니다.
3. Framework Preset은 Express이며 프로젝트 루트가 이 폴더인지 확인합니다. 별도 프런트엔드 빌드나 Output Directory 지정은 필요하지 않습니다.
4. Vercel Project Settings → Environment Variables에 `DATABASE_URL`과 `APP_PASSWORD`를 설정합니다. Production/Preview 등 사용할 환경에 각각 적용하세요. 로컬 `.env`는 업로드하지 않습니다.
5. Deploy를 실행합니다. 배포 후 환경변수를 바꿨다면 Redeploy합니다. GitHub main 브랜치 후속 push는 Vercel에서 자동 배포됩니다.
6. 배포 URL에서 로그인 → 지출 추가 → 새로고침 → 수정 → 날짜 검색 → 삭제를 확인합니다. Preview에서 실제 개인 데이터를 다루지 않으려면 별도의 Neon 브랜치 연결 문자열을 지정하세요.

서버 진입점 `server.js`가 Express 앱을 export하며 Vercel에서는 로컬 listen을 실행하지 않습니다. 정적 파일은 `public/`만 제공합니다.

## 데이터와 인증

- DB 접속은 서버의 `DATABASE_URL`만 사용합니다. SQL 값은 Neon 태그 템플릿으로 매개변수화합니다.
- 원본 비밀번호/DB 연결 문자열은 응답이나 브라우저 코드에 포함하지 않습니다. 데이터베이스 오류 원문도 반환하지 않습니다.
- 인증 쿠키는 HMAC 서명, HttpOnly, SameSite=Strict, 24시간 만료이며 배포 시 Secure를 적용합니다. `APP_PASSWORD` 변경 시 기존 쿠키가 무효화됩니다. 로그아웃은 해당 브라우저 쿠키를 제거합니다.
- 쓰기 API는 사용자 정의 요청 헤더를 요구하며 교차 출처 접근을 허용하지 않습니다. 로그인은 인스턴스당 IP별 15분/10회로 제한됩니다. Vercel의 여러 인스턴스 전체에 대한 제한은 아니므로 필요한 경우 Vercel Firewall에서 추가 제한을 설정하세요.
- 날짜 검색은 내역만 필터링합니다. 월 합계/그래프는 선택한 월 전체 기준입니다. 데이터는 Neon에만 저장됩니다.

## 검증 범위

`npm.cmd test`는 로그인, 서명 쿠키, 인증 차단, 요청 헤더, 입력 검증, 비밀 파일 접근 차단 및 DB 미설정 오류를 확인합니다. 실제 Neon CRUD와 Vercel 배포 검증에는 사용자 계정과 환경변수 설정이 필요합니다.

공식 참고: [Vercel Express](https://vercel.com/docs/frameworks/backend/express), [Neon serverless driver](https://github.com/neondatabase/serverless).
