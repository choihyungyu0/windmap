# 바람의 지도 — 공공 API 명세서

> **목적**: 「바람의 지도」가 실제로 호출하는 공공데이터 API를 한 곳에 정리한
> 개발자·AI엔지니어 공유용 명세입니다. `docs/`의 원본 기술문서 6종은 전체
> 파라미터 참조용이고, **이 문서는 우리가 실제로 쓰는 엔드포인트·파라미터·응답
> 필드만** 코드(`src/data_collector.py`)·실측 응답 기준으로 확정해 정리했습니다.
>
> - 기준 코드: `src/data_collector.py`
> - 실측 검증일: **2026-07-10** (청주 실수집으로 응답 구조·함정 확인 완료)
> - 서비스 제공: 한국환경공단(B552584)·기상청(1360000) / 공공데이터포털(data.go.kr)

---

## 0. 한눈에 보기

**수집 범위: 충청북도 전역(11개 시군).** 우리는 **5개 엔드포인트**를 호출합니다.
3개 도메인(환경공단 CleanSYS, 환경공단 에어코리아, 기상청 ASOS)에서 나옵니다.

| # | 데이터 | 제공 API | 엔드포인트 | 산출 파일 | 결과물에서의 역할 |
|---|---|---|---|---|---|
| 0 | 사업장 주소·도시 | CleanSYS 연간통계 | `recentThYearCmprFyerBsnesStatsInfo` | `facility_meta_chungbuk.json` | 배출원 도시 매핑 (1번 주석용) |
| 1 | 굴뚝 실시간 배출농도 | CleanSYS TMS | `rltmMesureResult` | `tms_chungbuk.csv` | 배출원 입력 (확산 모델의 소스 Q) |
| 2 | 측정소 목록·좌표 | 에어코리아 측정소정보 | `getMsrstnList` | `stations_chungbuk.json` | 측정소 실명·좌표 (3번의 선행 호출) |
| 3 | 측정소별 대기오염 실측 | 에어코리아 대기오염정보 | `getMsrstnAcctoRltmMesureDnsty` | `airkorea_chungbuk.csv` | 검증 정답지 + 보정 AI 학습 타깃 |
| 4 | 기상 시간자료 | 기상청 지상(ASOS) | `getWthrDataList` | `weather_chungbuk.csv` | 풍향·풍속·대기안정도 (확산 방향·정도) |

실측 규모(2026-07-10): CleanSYS 64사업장/167배출구, 에어코리아 34측정소,
ASOS 5지점(청주 131·충주 127·제천 221·보은 226·추풍령 135).

### 데이터 흐름

```
[CleanSYS rltmMesureResult] ──▶ 배출량(ppm→g/s) ─┐
                                                  ├─▶ 가우시안 확산 모델 ─▶ 대시보드 히트맵
[ASOS getWthrDataList] ──▶ 풍향·풍속·안정도 ──────┘                          │
                                                                            ▼
[에어코리아 getMsrstnList] ──▶ 측정소 좌표 ─┐                          보정 AI(XGBoost)
[에어코리아 ...RltmMesureDnsty] ──▶ NO₂ 실측 ┴─▶ 검증·학습 타깃 ──────────┘
```

---

## 1. 공통 사항

### 1-1. 인증 (서비스키)

모든 요청에 공공데이터포털 서비스키가 `serviceKey` 파라미터로 필요합니다.

- 키는 프로젝트 루트 `apikey.txt` 또는 `--api-key` 인자로 주입 (`load_api_key()`)
- **URL 인코딩된 키(`%2F`, `%3D` 포함)는 디코딩 후 사용**해야 합니다. `requests`가
  `params`를 다시 인코딩하므로, 인코딩된 키를 그대로 넣으면 이중 인코딩되어 인증
  실패(`SERVICE_KEY_IS_NOT_REGISTERED`)가 납니다.
  ```python
  if "%" in key:
      key = urllib.parse.unquote(key)   # 이중 인코딩 방지
  ```

### 1-2. 공통 응답 헤더 / 에러코드

포털 표준 래퍼는 `response.header.resultCode`로 성공 여부를 알립니다.

| resultCode | 의미 | 대응 |
|---|---|---|
| `00` | 정상 | 정상 처리 |
| `99` | 파라미터 오류 등 | ASOS에서 **날짜 범위 초과 시** 발생 (§5-2 함정 참조) |
| `03` | 데이터 없음(NODATA) | 빈 결과로 처리 |
| `20`,`22`,`30` | 트래픽/키/등록 오류 | 키·일일 한도 확인 |

> 코드에서는 `check_result_code()`가 `00`/`0` 외 코드를 로그로 남기고 해당 소스를
> 건너뜁니다(부분 실패가 전체 수집을 막지 않도록).

### 1-3. 호출 정책

- 재시도 3회(지수 백오프 `2·attempt`초), 타임아웃 30초 (`get_json()`)
- 페이징: `numOfRows`(페이지당 행수) × `pageNo`(페이지 번호). `totalCount`로 종료 판단
- 측정소 순회 시 호출 간 `0.3초` 대기 (트래픽 제한 예방)

---

## 2. CleanSYS — 굴뚝 실시간 TMS

**"어느 사업장의 어느 굴뚝에서 지금 무엇이 얼마나 나오는가."** 확산 모델의 배출원
입력.

### 2-1. 요청

```
GET https://apis.data.go.kr/B552584/cleansys/rltmMesureResult
```

| 파라미터 | 값 (우리 사용) | 설명 |
|---|---|---|
| `serviceKey` | (디코딩된 키) | 인증키 |
| `type` | `json` | 응답 형식 |
| `areaNm` | `충청북도` | 시·도명 (한 번 호출로 도 전역 64사업장) |

> `factManageNm`(사업장명 부분검색)로 특정 도시만 좁힐 수 있으나, 도 전역 수집을
> 위해 생략합니다.
>
> **주소·도시 확보 (0단계, 실사용)**: 실시간 응답에는 주소가 없어 도시를 알 수
> 없으므로, 연간통계 `recentThYearCmprFyerBsnesStatsInfo`
> (`?areaNm=충청북도&searchYear=2024`)의 `fact_adres`(주소)·`fact_manage_nm`으로
> {사업장→주소·도시} 매핑을 만들어 TMS 각 행에 `city`·`fact_adres`를 붙입니다.
> 주소 커버리지 64/64(100%). (기간 통계 `fyerBsnesStatsInfo`는 미사용.)

### 2-2. 응답 필드 (우리가 소비하는 것)

응답 경로: `response.body.items[]` (배출구 1개 = 1행).

| 필드 | 예시 | 의미 | 우리 사용 |
|---|---|---|---|
| `mesure_dt` | `2026-07-10 05:30` | 측정 시각 | 시계열 인덱스 |
| `area_nm` | `충청북도` | 지역 | 보관 |
| `fact_manage_nm` | `청주시 생활폐기물처리시설` | 사업장명 | 배출원 매칭 키 |
| `stack_code` | `2` | 배출구 번호 | **배출구별 분리** (같은 사업장도 굴뚝마다 별도) |
| `hcl_mesure_value` | `6.50` / `보수중` | HCl 농도(ppm) | 소각장 추적물질 |
| `nox_mesure_value` | `9.46` | NOx 농도(ppm) | 주 배출량 |
| `sox_mesure_value` | `0.00` | SOx 농도(ppm) | 보조 |
| `co_mesure_value` | `2.29` | CO 농도(ppm) | 보조 |
| `tsp_mesure_value` | `1.01` | 먼지(mg/m³) | 보조 |
| `hcl_exhst_perm_stdr_value` | `9.6` | HCl 허용기준 | 미측정 판정·기준선 |
| `nox_exhst_perm_stdr_value` | `42.5` | NOx 허용기준 | 〃 |
| `sox_·co_·tsp_exhst_perm_stdr_value` | … | 각 허용기준 | 〃 |

측정값 필드 접미사 규칙: `{물질}_mesure_value`(측정값) / `{물질}_exhst_perm_stdr_value`(허용기준).

> 수집 시 우리가 덧붙이는 컬럼: `city`·`fact_adres`(0단계 매핑), `collected_at`(수집시각).

### 2-3. 실측 응답 예시 (2026-07-10 05:30, 발췌)

```
fact_manage_nm             stack_code  hcl    nox                    sox
청주시 생활폐기물처리시설    1           보수중  보수중                  보수중
청주시 생활폐기물처리시설    2           6.50   9.46                   0.00
깨끗한나라㈜ 청주공장        6           0.07   32.50                  (null)
깨끗한나라㈜ 청주공장        3           보수중  측정자료확인중(가동중지)  측정자료확인중(가동중지)
청주시환경관리본부(하수처리과) 2         0.00   22.26                  0.24
```

### 2-4. 특이사항 / 전처리 규칙 ⚠

1. **측정값이 숫자가 아닌 문자열**로 오는 경우가 흔함 → **NaN 처리**.
   실측 확인 토큰: `미수신`, `보수중`, `측정자료확인중`, `측정자료확인중(가동중지)`,
   `기기점검`. (`config.TMS_NON_NUMERIC_TOKENS`)
2. **허용기준이 null인 물질 = 해당 굴뚝 미측정** → 그 컬럼 제외.
3. **같은 사업장도 `stack_code`별로 분리**해 독립 시계열로 다룸.
4. **★ 실시간 API는 '현재 스냅샷'만 반환** — 과거 시계열이 없음. 시계열은
   30분 간격 반복 수집으로 축적해야 함(§4). PoC 실 데이터 모드는 스냅샷을 분석
   기간 전체에 상수로 확장(가정 명시).

---

## 3. 에어코리아 (1) — 측정소 목록·좌표

**"청주에 어떤 측정소가 있고 좌표는 어디인가."** 3번 호출의 **선행 단계**(정확한
`stationName`을 얻어야 실측 조회가 됨).

### 3-1. 요청

```
GET https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList
```

| 파라미터 | 값 (우리 사용) | 설명 |
|---|---|---|
| `serviceKey` | (디코딩된 키) | 인증키 |
| `returnType` | `json` | 응답 형식 |
| `addr` | `충북` | 주소 부분검색 (도 전역 34측정소) |
| `numOfRows` | `300` | 페이지당 행수 |
| `pageNo` | `1` | 페이지 |

### 3-2. 응답 필드

응답 경로: `response.body.items[]`.

| 필드 | 예시 | 의미 | 우리 사용 |
|---|---|---|---|
| `stationName` | `복대동` | 측정소명 | 3번 조회 키 |
| `dmX` | `36.634423` | **위도(lat)** | 지도 좌표 |
| `dmY` | `127.447045` | **경도(lon)** | 지도 좌표 |
| `addr` | `충북 청주시 흥덕구 복대동 111 …` | 설치 주소 | 툴팁 |

> ⚠ **`dmX`=위도, `dmY`=경도** (이름과 축이 직관과 반대). 실측(오창읍 dmX 36.71 /
> dmY 127.42)으로 확인.

### 3-3. 특이사항 ⚠

- **`addr=충청북도`는 0건**, **`addr=충북`은 34건** 반환(실측). 행정구역 풀네임이
  아니라 축약 부분검색어를 써야 함. (도시 단위로 좁히려면 `addr=청주`=9건 등.)
- 수집 시 `addr`에 "충북"이 포함된 측정소만 남겨 인접도 측정소를 제외하고,
  주소에서 시군(`city`)을 추출해 태깅합니다.
- 실측 34개 측정소(11개 시군): 청주 9(오창읍·복대동…), 충주 4, 제천 4, 단양 3,
  음성 3, 괴산 3, 진천 2, 증평 2, 영동 2, 보은 1, 옥천 1.

---

## 4. 에어코리아 (2) — 측정소별 대기오염 실측

**"각 동네 공기의 시간별 NO₂·SO₂·미세먼지."** 모델 검증의 정답지이자 보정 AI의
학습 타깃.

### 4-1. 요청

```
GET https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty
```

| 파라미터 | 값 (우리 사용) | 설명 |
|---|---|---|
| `serviceKey` | (디코딩된 키) | 인증키 |
| `returnType` | `json` | 응답 형식 |
| `stationName` | `복대동` 등 | **측정소 실명**(3번에서 획득) |
| `dataTerm` | `MONTH` | 조회 기간: `DAILY`(1일)/`MONTH`(1달)/`3MONTH`(3달). `--days`로 자동 선택 |
| `ver` | `1.0` | 응답 버전 |
| `numOfRows` | `min(days·24+24, 999)` | 페이지당 행수 |
| `pageNo` | `1..N` | `totalCount`까지 순회 |

> 측정소 5곳 이상을 순회 호출(`for station in station_names`), 각 호출 간 0.3초 대기.

### 4-2. 응답 필드

응답 경로: `response.body.items[]` (측정소×시각 1개 = 1행).

| 필드 | 예시 | 의미 | 우리 사용 |
|---|---|---|---|
| `dataTime` | `2026-07-10 06:00` / `… 24:00` | 측정 시각 | 시계열 인덱스 |
| `stationName` | `복대동` | 측정소 | 측정소 키(응답에 없으면 요청값 주입) |
| `no2Value` | `0.006` | 이산화질소(ppm) | **핵심 타깃**(NO₂ 검증·보정) |
| `so2Value` | `0.002` | 아황산가스(ppm) | 보조(EDA) |
| `o3Value` | `0.005` | 오존(ppm) | 보관 |
| `coValue` | `-` | 일산화탄소(ppm) | 보관 |
| `pm10Value` | `-` | 미세먼지(㎍/m³) | 보관 |
| `pm25Value` | `-` | 초미세먼지(㎍/m³) | 보관 |
| `khaiValue` / `khaiGrade` | … | 통합대기환경지수/등급 | 보관 |

### 4-3. 특이사항 / 전처리 규칙 ⚠

1. **결측은 문자열 `"-"`** → NaN 처리 (`clean_airkorea`).
2. **시각 `24:00` 표기** → 익일 `00:00`로 변환(하루 경계). 실측 확인:
   ```python
   is24 = ts.str.endswith("24:00")
   ts = ts.str.replace(" 24:00", " 00:00")
   df.loc[is24, "datetime"] += pd.Timedelta(days=1)
   ```
3. **단위는 ppm** — 확산 모델의 µg/m³와 비교하려면 환산 필요
   (`config.UGM3_PER_PPM`, 예: NO₂ 1 ppm ≈ 1880 µg/m³).

---

## 5. 기상청 — 지상(ASOS) 시간자료

**"시간별 바람과 대기 상태."** 확산의 방향(풍향·풍속)과 정도(일사·운량→대기안정도).

### 5-1. 요청

```
GET https://apis.data.go.kr/1360000/AsosHourlyInfoService/getWthrDataList
```

| 파라미터 | 값 (우리 사용) | 설명 |
|---|---|---|
| `serviceKey` | (디코딩된 키) | 인증키 |
| `dataType` | `JSON` | 응답 형식 |
| `dataCd` | `ASOS` | 자료 종류 |
| `dateCd` | `HR` | 시간 단위 |
| `startDt`/`startHh` | `20260610`/`00` | 시작 일시(YYYYMMDD/HH) |
| `endDt`/`endHh` | `20260709`/`23` | 종료 일시 |
| `stnIds` | `131`,`127`,`221`,`226`,`135` | 충북 5개 지점을 각각 호출 |
| `numOfRows` | `999` | 페이지당 행수 |
| `pageNo` | `1..N` | `totalCount`까지 순회 |

> 충북 ASOS 지점: 청주(131)·충주(127)·제천(221)·보은(226)·추풍령(135, 영동군).
> 지점별로 개별 호출해 `weather_chungbuk.csv`에 합칩니다(`stnId`·`stnNm` 컬럼으로 구분).
> 분석 시 `regions.asos_for_city()`가 시군→담당 지점을 매핑합니다(관측소 없는 시군은
> 최근접 지점 근사).

### 5-2. 응답 필드

응답 경로: `response.body.items.item[]` (시각 1개 = 1행). *← 다른 API와 달리
`items` 아래 `item` 배열로 한 단계 더 들어감.*

| 필드 | 예시 | 의미 | 우리 사용 |
|---|---|---|---|
| `tm` | `2026-06-09 00:00` | 관측 시각 | 시계열 인덱스 |
| `stnId` | `131` | 지점번호 | 보관 |
| `wd` | `270` | **풍향(deg, 16방위 환산값)** | 확산 방향 |
| `ws` | `1.0` | **풍속(m/s)** | 확산 세기 |
| `ta` | `19.8` | 기온(°C) | 배출가스 환산·EDA |
| `hm` | `62` | 습도(%) | EDA |
| `pa` | `1001.0` | 현지기압(hPa) | 보관 |
| `icsr` | `` / `2.8` | 일사량(MJ/m²) | **주간 대기안정도** |
| `ss` | `1.0` | 일조(hr) | 보조 |
| `dc10Tca` | `8` | 전운량(1/10) | **야간 대기안정도** |
| `rn` | `` | 강수량(mm) | 보관 |

### 5-3. 특이사항 ⚠

1. **`icsr`(일사)는 야간·결측 시 빈 문자열** → 0/보간 처리. 대기안정도 산정
   (Pasquill-Gifford)에서 주간=`icsr`×`ws`, 야간=`dc10Tca`×`ws` 사용.
2. **당일 시간자료는 미확정** → 종료일을 `오늘-1일`로 요청(`resultCode=99`
   "잘못된 자료요청" 회피). 실측으로 확인해 반영.
3. `wd` 결측·급변은 sin/cos 경유 원형 보간(≤3h) (`clean_weather`).

---

## 6. 수집 운영 (스케줄러 · 누적)

TMS만 스냅샷이라 잦은 수집이 필요하고, 나머지는 느리게 변하므로 **분리 실행**합니다.

```bash
python src/data_collector.py --days 30      # 전체 수집 (0~4단계, 충북 전역)
python src/data_collector.py --tms-only     # TMS만 (1단계) append 누적
```

Windows 작업 스케줄러 2종(`scripts/register_scheduler.ps1`로 등록):

| 작업 | 주기 | 명령 | 로그 |
|---|---|---|---|
| `WindMap_TMS_Collect` | 30분 | `--tms-only` | `logs/tms_collect.log` |
| `WindMap_Full_Collect` | 매일 05:10 | `--days 30` | `logs/collect_full.log` |

- `collect_tms()`는 `append` + `collected_at` 컬럼으로 스냅샷을 누적 → 실제 배출
  시계열이 쌓입니다. `--tms-only`는 캐시된 `facility_meta_chungbuk.json`으로 도시 주석.
- 산출물: `data/raw/{tms,airkorea,weather}_chungbuk.csv`,
  `{stations,facility_meta}_chungbuk.json` → `city_overview.py`(도시 랭킹) 또는
  `run_poc.py --source real --city <도시>`.

---

## 7. 함정 요약 (개발자 체크리스트)

| # | 함정 | 증상 | 해결 |
|---|---|---|---|
| 1 | 서비스키 이중 인코딩 | 인증 실패 | 인코딩 키는 `unquote` 후 사용 |
| 2 | 측정소 주소 검색 | `충청북도` 0건 | `addr=충북` 축약 부분검색 |
| 3 | `dmX`/`dmY` 축 | 좌표 뒤바뀜 | dmX=위도, dmY=경도 |
| 4 | 에어코리아 `24:00` | 파싱 오류/시각 밀림 | 익일 00:00 변환 |
| 5 | 에어코리아 `"-"` | 숫자 변환 실패 | NaN 처리 |
| 6 | ASOS 당일 요청 | `resultCode=99` | 종료일 `오늘-1일` |
| 7 | ASOS 응답 경로 | items 파싱 실패 | `items.item[]` (한 단계 더) |
| 8 | TMS 문자열 측정값 | 숫자 변환 실패 | 토큰 목록으로 NaN 처리 |
| 9 | TMS 스냅샷 한계 | 시계열 없음 | 30분 반복 수집 누적 |

---

## 8. 참조 원본 문서 (`docs/`)

이 명세는 요약본입니다. 전체 파라미터·에러코드·응답 스키마는 원본을 참조하세요.

| 파일 | 내용 | 이 명세 매핑 |
|---|---|---|
| `api_01_cleansys_tms.docx` | 굴뚝 TMS | §2 |
| `api_02_airkorea_pollution.docx` | 대기오염정보(측정소별 실시간) | §4 |
| `api_03_airkorea_statistics.docx` | 대기오염통계 | (미사용) |
| `api_04_airkorea_support.docx` | 사용자지원(측정소 목록·좌표) | §3 |
| `api_05_airkorea_cai.docx` | 통합대기환경지수(CAI) | (khaiValue 참고) |
| `api_06_kma_asos.docx` | 기상청 ASOS 시간자료 | §5 |

---

## 부록 A. 필드 → 결과물 매핑

| 원천 필드 | 가공 | 최종 산출물 위치 |
|---|---|---|
| TMS `*_mesure_value`(ppm) | → 배출률 g/s → 확산 그리드 | 대시보드 히트맵, 애블레이션 B1 |
| ASOS `wd`,`ws` | → 이류 방향·속도 | 대시보드 풍향 화살표, 확산 방향 |
| ASOS `icsr`,`dc10Tca`,`ws` | → Pasquill-Gifford 안정도 | EDA §3, 확산 σ, 보정 피처 |
| 에어코리아 `no2Value`(ppm) | → µg/m³ | 대시보드 측정소 패널, 검증·보정 타깃 |
| 측정소 `dmX`,`dmY` | → 좌표 | 지도 마커, 풍하각·거리 피처 |

## 부록 B. docx가 필요하면

이 문서를 Word로 변환하려면(Pandoc 설치 시):

```bash
pandoc docs/API_명세서.md -o docs/API_명세서.docx
```

Pandoc 없이도 대부분의 Markdown 뷰어(VS Code, Typora, GitHub)에서 표·코드가 그대로
렌더링됩니다.
