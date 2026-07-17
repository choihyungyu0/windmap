# backend/data — 충북 전역 실수집 데이터 + 확산 대시보드

수집기(`backend/collectors/`)가 공공 API에서 실제로 받아온 **충청북도 전역** 데이터와,
그 데이터로 구동되는 확산 대시보드입니다.

## raw/ — 공공 API 실수집 스냅샷

| 파일 | 내용 | 출처 API |
|---|---|---|
| `tms_chungbuk.csv` | 굴뚝 TMS 배출농도(64사업장/167배출구), 30분 누적 시계열 | CleanSYS `rltmMesureResult` |
| `airkorea_chungbuk.csv` | 34개 측정소 NO₂·SO₂·PM10·PM2.5 등 (최근 30일) | 에어코리아 `getMsrstnAcctoRltmMesureDnsty` |
| `weather_chungbuk.csv` | ASOS 5개 지점 풍향·풍속·기온·안정도 (최근 30일) | 기상청 `getWthrDataList` |
| `stations_chungbuk.json` | 34개 측정소 실좌표·도시 | 에어코리아 `getMsrstnList` |
| `facility_coords_chungbuk.json` | 사업장 59곳 지오코딩 실좌표 | VWorld 지오코더 |
| `facility_meta_chungbuk.json` | 사업장 주소·도시 매핑 | CleanSYS 연간통계 |
| `source_coords_chungbuk.json` | 시범배출원 교정 좌표 | VWorld |

> `collectors/` 의 live 파이프라인은 이 API들을 SQLite(`windmap.sqlite`)에 적재합니다.
> 여기 CSV/JSON은 **도 전역 누적 스냅샷**으로, 아래 확산 대시보드와 EDA·분석에 바로 씁니다.
> TMS는 스냅샷만 제공되므로 스케줄러 30분 누적으로 시계열을 쌓습니다(현재 ~6일치).

## chungbuk_dispersion_dashboard.html — 충북 전역 확산 대시보드

브라우저로 열면 바로 구동됩니다(자체완결, 인터넷=지도타일만 필요).
위 `raw/` 데이터로 생성되었으며 포함 기능:
- 지도: 배출 굴뚝 59 + 대기측정소 34 (실좌표)
- 시군 필터 · 물질(NO₂·SO₂·HCl·PM10·PM2.5) 선택
- 시간 슬라이더 · 재생/정지 · 배속 · 날짜 점프
- 풍향·풍속·배출량 기반 확산 히트맵(농도 색상)
- 하단 데이터 그리드(날짜·시군·굴뚝·배출량·풍속·풍향·풍하·측정농도) + CSV export

한계: 도 전역 히트맵은 **풍향·풍속·배출량 기반 근사 확산**(검증된 물리 아님).
PM10·PM2.5는 입자상이라 굴뚝 먼지(TSP)를 가스모델로 근사(경고 배너 표기).
자세한 물질 선정 근거는 `../docs/오염물질_선정_분석.md`, API 상세는 `../docs/API_명세서.md`.
