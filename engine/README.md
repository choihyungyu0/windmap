# engine — 데이터 파이프라인·확산·검증 (Python)

표준 라이브러리만 사용 (외부 패키지 0 — 시연 환경 리스크 최소화).

## 구성

```
collectors/   F-COL-01~03: TMS(CleanSYS)·기상(안정도 산출)·에어코리아
quality.py    AUTO-03: 결측·이상치·장애 감시 → quality_log
pipeline.py   AUTO-01: 수집→품질감시→저장→상태 내보내기 1사이클
scheduler.py  AUTO-01: 30분 주기 상시 루프
db.py         SQLite (기능명세 ⑥ 데이터모델)
export.py     public/data/pipeline-status.json (관제 대시보드 소비)
```

## 실행 (windmap 루트에서)

```bash
python -m engine.pipeline --mock                 # 1사이클 (키 불필요)
python -m engine.pipeline --mock --backfill 72   # 과거 72시간 채우기
python -m engine.scheduler --mock --interval 60  # 데모: 60초 주기 상시 수집
python -m engine.scheduler                       # 운영: 30분 주기 (키 필요)
```

## live 전환 (P2b — 서비스 키 발급 후)

1. `.env.local` 에 `DATA_GO_KR_SERVICE_KEY=` 채우기
2. 각 수집기의 실호출 스모크 테스트 → 응답 스키마 확인 → `TODO(P2b)` 파싱 확정
3. `config.py` 의 시범 배출원 CleanSYS 사업장 ID·하류 측정소 확정 (오픈이슈 #1)

키가 없으면 모든 수집기는 mock으로 폴백하고, 그 사실을 quality_log 에 남긴다.

## 예정 (같은 파이프라인에 끼워짐)

- P3: F-DSP-02 퍼프 예측 단계 (수집 직후 실행, 도달시각 산출)
- P6: F-AI-01 Δ분리 → F-AI-02 보정 → F-VAL-01 애블레이션 배치
- mock 배출 신호에는 36시간마다 4시간 정지 구간이 있어, 가동/정지
  자연실험(검증 방법 A) 로직을 mock 단계에서 미리 개발할 수 있다.
