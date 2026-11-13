# MOMENT STUDIO — AI COMMUNITY ENGINE

비공개 텔레그램 투자 토론 **시뮬레이션** 운영센터. Next.js 웹 관리자 / Railway PostgreSQL / 별도 MTProto 워커.

## 관리자에서 사용하는 순서

1. **계정 관리**: 계정 이름(워커의 `TELEGRAM_ACCOUNT_ID`와 정확히 동일)을 등록하고 그룹별 AI 성격을 설정합니다.
2. **그룹 관리**: 정확한 숫자형 Telegram 그룹 ID를 등록합니다.
3. **운영 현황 → PostgreSQL 서버 저장**: 그룹과 계정 배정을 저장해야 승인된 메시지를 실제 전송할 수 있습니다.
4. **AI 토론**: 수동 시뮬레이션 또는 실제 그룹 수신 메시지 확인 → AI 반응 생성 → 한 답변씩 승인합니다.

## 실제 Telegram 연결 구성

- `telegram-worker/`의 Python Telethon 워커는 **본인이 승인한 일반 Telegram 계정 세션**을 사용합니다.
- 실제 연결은 서버에서 `TELEGRAM_BRIDGE_KEY`, `TELEGRAM_ALLOWED_CHAT_IDS`를 설정하고 워커 서비스에 API/세션 환경변수를 구성한 뒤 별도 실행해야 합니다.
- 상세 방법: [telegram-worker/README.md](telegram-worker/README.md)
- **실제 세션 및 API 환경변수가 없다면 그룹 수신/발송은 작동하지 않습니다.** UI가 수신 저장소만 준비됐다고 표시하는 경우와 연결된 워커가 있는 경우는 다릅니다.
- 생성된 AI 답변은 **운영자 개별 승인**이 있어야 전송 대기열로 이동합니다. 미승인 자동 발송은 현재 제공하지 않습니다.

## 로컬 개발

```bash
npm install
cp .env.example .env.local
npm run dev
```

관리자 인증: `ADMIN_PASSWORD` / `AUTH_SECRET` (서버 비밀 변수).
AI 생성: `OPENAI_API_KEY` / `OPENAI_MODEL`. 키가 없으면 샘플 대화만 표시하며 샘플은 전송 승인되지 않습니다.
DB: `DATABASE_URL`.

현재 브라우저 로컬 데이터와 PostgreSQL 서버 저장본은 **별도**입니다. 최초 서버 이관은 **운영 현황** 메뉴에서 수동 저장을 선택해야 합니다. JSON 백업을 먼저 만들어 보존할 수 있습니다.

## 아직 완료되지 않은 기능

- Telegram 사용자 로그인/세션 발급을 웹 관리자에서 직접 처리
- 비공개 그룹 자동 응답 스케줄, 장기 기억 검색·자동 요약, 실제 시세 수집
- 다중 관리자의 개별 인증·권한 제어, 로그인 분산 속도 제한
- MTProto 워커의 실제 연결·송수신 검증 (실제 인증정보와 테스트 그룹 필요)

개발 원칙: 모든 그룹 통신은 승인된 소유자/테스트 그룹으로 제한. AI 시뮬레이션을 실제 투자 성과나 인간 참여자 수로 허위 표시하지 않음. 그룹 대화는 모델 학습·파인튜닝에 사용하지 않으며, 외부 제공 및 AI 처리에 관한 권한/동의가 확인된 환경에서만 사용.
