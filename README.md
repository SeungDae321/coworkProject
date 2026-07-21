# YouTube Shorts Automator

주제 입력 → 오타 보정/관련 주제 5개 추천 → 스크립트 생성·승인 → Pexels 배경 + OpenAI TTS + FFmpeg 합성 → YouTube Shorts 업로드까지 지원하는 웹앱입니다.

## 스택

- **Frontend**: React (Vite) + Tailwind CSS + React Router
- **Backend**: Express.js + Mongoose
- **Database**: MongoDB
- **외부 API**: OpenAI, Pexels, YouTube Data API (OAuth2)
- **영상 합성**: FFmpeg

## 사전 요구사항

- Node.js 20+
- MongoDB
- FFmpeg (`ffmpeg -version` 확인)
- (권장) 한글 자막용 폰트: `fonts-noto-cjk`
- API 키
  - OpenAI API Key
  - Pexels API Key
  - Google Cloud OAuth 클라이언트 (YouTube Data API v3 활성화)

## 설정

1. 루트에 `.env` 파일을 만듭니다.

```bash
cp .env.example .env
```

2. `.env` 값을 채웁니다.

| 변수 | 설명 |
|------|------|
| `MONGO_URI` | MongoDB 연결 문자열 |
| `JWT_SECRET` | JWT 서명 비밀키 |
| `TOKEN_ENCRYPTION_KEY` | YouTube 토큰 암호화용 32자 키 |
| `OPENAI_API_KEY` | OpenAI 키 |
| `PEXELS_API_KEY` | Pexels 키 |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` | Google OAuth |
| `YOUTUBE_REDIRECT_URI` | 기본 `http://localhost:4000/api/youtube/oauth/callback` |
| `CLIENT_URL` | 프론트 주소 (`http://localhost:5173`) |

3. Google Cloud Console에서 OAuth 리다이렉트 URI에 위 `YOUTUBE_REDIRECT_URI`를 등록하고, YouTube Data API v3를 활성화합니다.

## 실행

```bash
# 의존성
npm run install:all

# MongoDB가 떠 있어야 합니다.
# 예: mongod --dbpath /data/db --fork --logpath /tmp/mongod.log

# 개발 서버 (API :4000, Web :5173)
npm run dev
```

또는 개별 실행:

```bash
npm run dev:server
npm run dev:client
```

브라우저에서 `http://localhost:5173` 접속 → 회원가입/로그인 → 설정에서 YouTube 연결 → 새 작업 시작.

## 워크플로

1. 키워드 입력
2. OpenAI가 오타를 보정하고 관련 주제 5개 제안
3. 주제 1개 선택 (향후 다중 선택은 Job 큐로 확장 가능)
4. Shorts용 한국어 스크립트 생성 → 수정/승인
5. Pexels 이미지 + OpenAI TTS + FFmpeg로 9:16 영상 생성
6. 미리보기에서 승인 또는 다시 만들기
7. YouTube Shorts 업로드 (기본 privacy: `private`)

## 비용 / 한도 안내

- OpenAI: 채팅 완성 + TTS 호출 비용 발생
- Pexels: API rate limit 존재
- YouTube: 일일 업로드 쿼터 제한

## 저작권 / 정책

- 배경 미디어는 Pexels 라이선스 범위 내에서 사용하세요.
- YouTube 커뮤니티 가이드라인 및 Shorts 정책을 준수하세요.
- 생성된 영상/오디오는 서버 `server/storage/`에 저장됩니다.

## 프로젝트 구조

```
client/   React SPA
server/   Express API, workers, storage
.env.example
```

## 향후 확장

- 주제 다중 선택 → Project N개 + Job 병렬/순차 처리
- Redis/BullMQ 기반 외부 큐
- TikTok / Instagram 업로드
