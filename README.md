# 놀이터 날씨 (PlaygroundWeather)

"오늘 아이랑 나가도 될까?"를 아이 기준(0~2세 / 3~6세 / 7세+, 민감군)으로 판정하고, 전국 놀이터·공원·화장실(기저귀교환대)을 지도에서 찾아주는 부모용 앱.
서버 없음, 전부 공공데이터, 광고(AdMob) 수익 모델. Capacitor(Android) + React + Vite.

## 구조

```
pipeline/                  데이터 파이프라인(GitHub Actions 에서 실행, 로컬에서도 가능)
  sources/standard-data.ts 공공데이터포털 표준데이터(도시공원 18,376 · 공중화장실 33,820) 다운로드 — 키 불필요
  sources/pfct-api.ts      행안부 전국어린이놀이시설정보 API(data.go.kr 15124519) 85,416건 — 위경도·공공/민간·실내외·물놀이·우수시설 포함, 1,000건×86페이지
  sources/cpf-crawl.ts     (예비) 행안부 어린이놀이시설 안전관리시스템 목록 크롤링 — 안전검사 상태 보강용
  geocode.ts               (예비) 주소 → 좌표. 브이월드·카카오는 결과 저장을 금지하므로 운영에는 쓰지 않음
  build-places.ts          → data/places/{시군구}.json, data/index.json(시군구 255개 중심좌표·기상청 격자), meta.json
  fetch-weather.ts         → data/wx/{시군구}.json (단기예보 48h, 실황, 자외선·꽃가루·감기지수, 미세먼지). 키 없으면 --mock
  sgg.ts / data/sgg-codes.json  법정동코드 기반 시도·시군구 표 + 주소 매칭(2026년 전남광주통합특별시, 인천 제물포구·영종구 반영)
src/
  lib/judge.ts             외출 판정 엔진(점수·등급·이유·옷차림·준비물·최적 시간대) + 테스트
  lib/data.ts              정적 JSON 로딩(Cache Storage, 오프라인 폴백)
  lib/notify.ts            아침 알림(기기 로컬 알림, 서버 없음)
  lib/ads.ts               AdMob 배너·전면(네이티브에서만)
  screens/                 Onboarding · Home · MapScreen(Leaflet+클러스터) · PlaceSheet · Favorites · Settings
.github/workflows/         places-data(주 1회) · weather-data(매시) → gh-pages 브랜치에 데이터 커밋
android/                   Capacitor Android 프로젝트 (applicationId app.playweather.kr)
```

## 로컬 실행

```bash
npm install
npm run pipeline:places                 # 공원·화장실 다운로드 → public/data (놀이터는 아래 수집 후)
npm run pipeline:crawl                  # 놀이터 85,414건 수집(약 1시간, pipeline/.cache/cpf 캐시)
npm run pipeline:geocode                # VWORLD_KEY 또는 KAKAO_REST_KEY 필요(.env)
npm run pipeline:places                 # 놀이터 포함 재빌드
npm run pipeline:weather:mock           # 키 없을 때 모의 날씨 / 키 있으면 npm run pipeline:weather
npm run dev                             # http://localhost:5180  (데이터는 /data = public/data)
npm test && npm run typecheck
```

## 안드로이드

```bash
npm run sync          # 웹 빌드 + cap sync
npm run apk           # android/app/build/outputs/apk/debug/app-debug.apk
```
- JDK 21(`C:\jdk21`), Android SDK(`~/.bubblewrap`)는 `android/local.properties` 로 지정.
- AdMob 앱 ID: `android/app/src/main/AndroidManifest.xml` 의 `com.google.android.gms.ads.APPLICATION_ID` (테스트 ID 기본).
- 실제 광고 단위 ID는 `.env` 의 `VITE_ADMOB_BANNER_ID`, `VITE_ADMOB_INTERSTITIAL_ID`.

## 필요한 계정·키 (전부 무료)

| 용도 | 어디서 | 환경변수 |
|---|---|---|
| 기상청 단기예보·생활/보건기상지수, 에어코리아 | data.go.kr 활용신청(4개 API) → 일반 인증키 | `DATA_GO_KR_KEY` |
| 놀이터 주소 지오코딩 + 지도 타일 | vworld.kr 인증키 | `VWORLD_KEY`, `VITE_VWORLD_KEY` |
| 수유실(부산, 좌표 포함) | data.go.kr 15034033 `BusanNursingroomInfoService` 활용신청(같은 키). 미신청이면 수집을 건너뛴다 | `DATA_GO_KR_KEY` |
| 지오코딩 대안 | developers.kakao.com REST 키 | `KAKAO_REST_KEY` |
| 광고 | admob.google.com 앱·광고단위 | `VITE_ADMOB_*` |

GitHub Actions 에서는 같은 이름의 Secrets 로 넣는다(저장소 Settings → Secrets and variables → Actions → New repository secret, 또는 `gh secret set DATA_GO_KR_KEY`).
데이터는 `gh-pages` 브랜치(= GitHub Pages)에 올라가며 앱의 `VITE_DATA_BASE` 를 그 주소로 지정한다.

- 저장소: https://github.com/nokeunsu-creator/playground-weather (공개)
- 데이터 주소: https://nokeunsu-creator.github.io/playground-weather/ (`index.json`, `places/{시군구}.json`, `wx/{시군구}.json`)
- 수동 실행: Actions 탭 → `weather-data` 또는 `places-data` → Run workflow. 날씨는 매시 15분, 장소는 매주 월요일 03:00 KST 자동 실행.

## 판정 기준(요약)
- 미세먼지 환경부 4등급(PM10 30/80/150, PM2.5 15/35/75). 나쁨 이상이면 실내 추천, 영아·민감군은 보통 상단부터 주의.
- 체감온도(풍속냉각/습구 기반) ≤4℃ 주의, ≤-3℃ 짧게, ≤-10℃ 실내 / ≥28℃ 주의, ≥31℃ 짧게, ≥35℃ 실내. 영아 1.3배, 유아 1.1배 가중.
- 강수(실황 또는 확률 60%↑), 강풍 6/9 m/s, 자외선 6/8, 꽃가루·감기가능지수, 해 진 뒤.
- 점수 100에서 감점, "bad" 사유가 하나라도 있으면 실내 추천.

## 데이터 출처·라이선스
기상청, 한국환경공단(에어코리아), 행정안전부(어린이놀이시설 안전관리시스템, 도시공원·공중화장실 표준데이터), 법정동코드(code.go.kr). 공공누리 제1유형(출처표시). 앱 안에 출처를 표시한다.

**수유실**: 전국 단위 공개 데이터가 없다(맘편한 세상은 이용허락 없음 → 사용 안 함). 좌표가 있는 부산시 API만 쓴다. 제주·성남·경기 광주 파일데이터는 주소만 있고 지오코딩 결과 저장이 약관상 막혀 있어 쓰지 않는다. 전국 기저귀교환대는 공중화장실 표준데이터의 기저귀교환대 위치 항목으로 보여 준다.

**놀이기구·바닥**: 행안부 기구정보(15124521)의 기구 유형을 그대로 저장하고, 앱이 `src/lib/rides.ts` 에서 기구 묶음(미끄럼틀·그네·짚라인 …)과 바닥(모래·고무)으로 나눈다.
