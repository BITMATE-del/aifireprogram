# 텔레그램 연결 · 모먼트 스튜디오

**Telegram API ID·HASH와 OpenAI API KEY는 이제 관리자 웹사이트의 전체 기본값으로 한 번 저장할 수 있습니다.** 개별 계정은 공통값을 상속하고 필요한 경우에만 덮어씁니다. StringSession은 계정별로 저장해야 합니다. 별도 워커마다 입력할 필요가 없습니다. 관리자 웹에서 등록한 정보는 PostgreSQL에서 AES-256-GCM으로 암호화되며, 화면은 등록 여부만 반환합니다.

## 설정 순서

1. 관리자 웹 로그인 → **API·사용량 → 전체 기본 설정**에서 Telegram API ID·HASH 및 OpenAI API 키를 공통으로 등록
2. **계정 관리**에서 계정을 만들고 **API·사용량 → 계정별 개별 설정**에서 각 계정의 Telegram StringSession을 등록. 공통과 다른 API가 필요할 때만 개별 ID·HASH·OpenAI 키를 추가
3. **계정 관리 → AI 페르소나 설정** 탭에서 계정이 활동할 그룹 및 성격 배정
4. **그룹 관리**에 실제 숫자형 Telegram 그룹 ID 등록
5. **운영 현황 → PostgreSQL 서버 저장**에서 현재 계정·그룹 배치를 서버에 저장. (별도의 계정 비밀키는 서버에 이미 암호화 저장됨)
6. 워커가 사이트 서버의 인증된 연결 설정을 정기 조회하고, 활동 가능한 계정만 연결
7. **AI 토론**에서 실제 그룹 메시지를 확인 → AI 반응 생성 → 발송할 답변을 운영자가 개별 승인

## Railway 서비스별 환경변수

### aifireprogram (웹 관리자)
- `ADMIN_PASSWORD`, `AUTH_SECRET`, `DATABASE_URL`
- `CREDENTIAL_ENCRYPTION_KEY` (최초 생성한 랜덤 32자 이상 비밀키: 교체하면 기존 저장 정보 복호화 불가)
- `TELEGRAM_BRIDGE_KEY` (랜덤 32자 이상)
- `TELEGRAM_ALLOWED_CHAT_IDS` (활동을 허용할 숫자형 그룹 ID, 쉼표 구분)
- `OPENAI_API_KEY` (선택: 계정별 키가 없을 경우 사용하는 서버 기본 키)

### telegram-worker (Python 워커)
- `MOMENT_BASE_URL` (HTTPS 관리자 도메인)
- `TELEGRAM_BRIDGE_KEY` (관리자와 동일, Railway 내부 참조 가능)
- `BRIDGE_POLL_SECONDS` (선택, 기본 8초)
- `ACCOUNT_REFRESH_SECONDS` (선택, 기본 60초)

**워커에는 계정별 `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_STRING_SESSION`, `TELEGRAM_ACCOUNT_ID` 변수를 별도로 입력하지 않습니다.** 서버에서 활성 계정을 가져옵니다.

## 로컬에서 본인 계정 세션 발급

`START_WINDOWS.bat` 또는 `create_session.py`로 사용자 본인 계정 세션을 생성합니다. 출력되는 세션을 사용자 계정의 사이트 API 설정에 입력하세요. 세션 문자열은 로그인 권한과 같으므로 외부에 노출하거나 GitHub에 넣으면 안 됩니다.

## 안전장치

- 관리자 인증이 없으면 웹 API 설정을 변경할 수 없습니다.
- 웹 API에서 암호화된 키 원문을 다시 표시하지 않습니다.
- 워커는 허용된 그룹·서버 저장된 배정·활성 계정만 연결합니다.
- AI 메시지는 승인 없이 전송되지 않으며, 실제 전송 시 `[AI 시뮬레이션]`을 붙입니다.
- 개별 키/세션이 저장돼도 그룹 배정을 서버에 저장하지 않으면 연결이 시작되지 않습니다.
- 기본값 적용 우선순위: 계정별 키 → 사이트 공통 키 → (OpenAI만) 서버 환경변수. Telegram 세션 공유는 금지합니다.
- 이 서비스는 현재 **단일 관리자 로그인**입니다. 개별 고객 로그인과 고객 간 DB 접근권한 분리는 아직 구현 전입니다.
