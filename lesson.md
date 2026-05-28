# Lesson Log — lastofdl

이 문서는 이 프로젝트에서 **같은 실수를 반복하지 않기 위해** 매번 새 세션이 시작될 때 가장 먼저 읽어야 하는 파일이다. 새 작업을 시작하기 전에 관련 섹션을 빠르게 훑고, 변경이 끝나면 새로운 교훈이 있으면 추가한다.

---

## 1. CSS `width: min(...calc(...))`은 fallback 위험

**증상**: `.postcard`의 텍스트가 viewport 전체로 흘러나옴.

**원인**: `width: min(88vw, 700px, calc((68vh - 140px) * 1.45))`처럼 `min()` 안에 `calc()`를 넣으면 일부 브라우저가 파싱 실패 시 `width: auto`로 fallback. 그러면 flex 부모에 가득 채워져 postcard가 viewport 전체로 커진다.

**교훈**:
- `min()` 안에는 단순 값만 (`min(88vw, 700px)`).
- 뷰포트 높이 의존이 필요하면 `max-height: 62vh`를 별도로.
- 반드시 `overflow: hidden`을 안전망으로 — 부모가 잘못 커져도 자식 텍스트는 안 새어나옴.

## 2. `letter.png`은 단순 엽서가 아니라 "책상 위 엽서"

**증상**: `inset: 9% 9% 10% 9%`로 잡았더니 글자가 "POST CARD" 헤더와 "FROM:" 라벨, 우표 위에 덧씌워짐.

**원인**: 이미지를 미리 안 보고 좌표를 가정했음.

**교훈**:
- **새 이미지를 받으면 먼저 `Read` 툴로 시각 확인**.
- 그 위에 텍스트 올리는 좌표는 이미지의 실제 안전 영역(여기서는 약 `top: 32%, 양옆 14%, bottom 14%`)을 기준.
- 향후 자산 교체 시(예: lock.png → lock (2).png) 다이얼/스탬프 위치가 달라졌는지 시각 검증 필수.

## 3. flex 레이아웃 안에서는 `scrollHeight`로 overflow 측정 불가

**증상**: `fitLetterBody`가 11px까지 줄여도 본문이 잘림.

**원인**: `.letter-body { display: flex; flex-direction: column; }`에 자식 `.body-text { flex: 1 1 auto; min-height: 0; }`이면, flex가 자식 박스 자체를 축소해버려서 `scrollHeight === clientHeight`가 되어 overflow가 안 잡힘. 자식 *내용*만 잘리고 박스는 안 넘침.

**교훈**:
- 측정용 컨테이너는 **block 레이아웃** 사용. `display: flex` 금지.
- 더 안전한 측정은 `getBoundingClientRect()` 비교: 자식의 `rect.bottom`이 컨테이너의 `rect.bottom`을 넘는지 확인.
- 측정 전 강제 reflow: `void el.offsetHeight`.

## 4. 데이터 파일(`*.json`, `*.md`)은 브라우저가 적극 캐싱

**증상**: `lyrics.json` 수정해도 새로고침하면 옛 데이터로 동작.

**원인**: 기본 `fetch()`는 브라우저 캐시 사용. JSON/MD 같은 작은 데이터 파일도 캐싱됨.

**교훈**:
- 데이터 파일 fetch는 항상 `{ cache: 'no-store' }` 옵션.
- 변경이 즉시 반영되어야 하는 파일(`letters.md`, `lyrics.json`)에 한정. mp3/png는 캐시되어도 무관.

## 5. 시간 기반 자료(LRC/SRT)는 **출처를 명시**받기 전에는 정확하지 않음

**증상**: LRC 적용했더니 가사가 4-5초 늦게 떠 보였음.

**원인**: 다른 버전(앨범/리믹스)의 LRC였을 수 있음. 사용자의 실제 mp3와 동기화되지 않은 timeline.

**교훈**:
- 사용자가 LRC/SRT를 보내주면 **그대로** 적용하고 결과를 사용자에게 검증받기.
- 두 자료의 timing이 다르면 어느 쪽이 사용자의 mp3와 맞는지 사용자가 결정해야 함.
- 자동 분배는 어디까지나 fallback (모든 t가 null일 때만).

## 6. `{ once: true }` 리스너는 reset 후 다시 안 붙음

**증상**: postcard에서 ↺ 누르면 메인으로 돌아가지만, 그 뒤 양철통을 클릭해도 아무 일도 안 일어남.

**원인**: `scenes.tincan.addEventListener('pointerdown', ..., { once: true })`. 한 번 발화 후 자동 제거.

**교훈**:
- "한 번만" 처리가 필요하면 **`{ once: true }` 대신 state 가드**: `if (state.scene !== 'tincan' || document.body.classList.contains('is-zooming')) return;`.
- 일반적으로 reset 시나리오가 있는 어떤 핸들러에도 `{ once: true }` 사용 금지.

## 7. PowerShell이 UTF-8 파일을 cp949로 읽음

**증상**: `Get-Content lyrics.json | ConvertFrom-Json`이 "Invalid object" 오류.

**원인**: PowerShell 5.1 (Windows)는 기본 인코딩이 시스템 로케일(한국은 cp949). UTF-8 파일을 잘못 디코드.

**교훈**:
- 한글 JSON/MD 검증은 항상 `[System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json`.
- 파일 자체는 정상이어도 PS 출력은 깨져 보일 수 있으니 인코딩 분리해서 진단.

## 8. AI 디폴트 미감 절대 금지

**금지 패턴**:
- 보라/시안/핑크 그라데이션
- glassmorphism (반투명 + blur 기본 카드)
- neon glow
- shadcn 디폴트 다크 룩
- 빠른 마이크로 인터랙션 (이 프로젝트는 *천천히* 음미하는 의식적 톤)

**허용**: 종이/금속/빈티지, serif 본문, 손글씨 강조, 800–1200ms easing.

## 9. CLAUDE.md의 결정은 코드보다 우선

- CLAUDE.md에 "12초 → 4초로 변경"이 적혔으면 다음 세션에서 자료 갱신 시 그 결정을 잊지 말 것.
- 사용자 결정이 바뀌면 CLAUDE.md를 **먼저** 갱신하고 코드 변경.

## 10. 한 번에 너무 많은 가정을 바꾸지 말 것

- 폰트 + 마진 + 인셋 + 레이아웃을 동시에 손대면 어느 변화가 효과가 있었는지 모름.
- 다음 turn에 "그게 아니라"는 피드백이 와도 어디서부터 되돌릴지 막막해짐.
- **한 번에 하나씩, 측정 → 변경 → 검증**.

## 11. `class`만 있고 `id`가 없는 요소를 id 셀렉터로 찾으면 silent fail

**증상**: `fitLetterBody`를 4번이나 호출하고 폰트 크기 조정 로직도 여러 번 손봤는데도 본문이 계속 잘림. 효과가 0이었음. 사용자에게 "auto-fit이 됩니다" 라고 보고하고 실제로는 한 번도 실행되지 않은 상황.

**원인**: `<article class="letter-body">`에 `id="letter-body"`가 없었는데 JS는 `$('#letter-body')`로 가져옴 → `null` → 함수 첫줄 `if (!el) return;`에서 조용히 종료. 에러도 안 남.

**교훈**:
- **함수가 동작 안 한다 싶으면 가장 먼저 셀렉터부터 의심**. 화려한 측정 로직을 고치기 전에 `console.log` 한 줄로 `el`이 null인지 확인.
- 새 HTML 구조 도입할 때 JS에서 참조하는 id를 **반드시 함께 추가**. class만으로는 부족.
- "동일 효과가 0인 fix를 여러 번 반복하고 있다"면 그 fix가 **아예 실행되고 있지 않을** 가능성이 매우 높음.
- 침묵하는 null check (`if (!el) return;`)는 디버깅의 적. `console.warn`이라도 남기자.

---

## 추가 시 가이드

새 교훈을 추가할 때:
1. 위 번호를 이어서 `## N. 짧은 제목` 형식.
2. **증상 → 원인 → 교훈** 세 줄이 핵심. 코드 스니펫은 짧게.
3. 이미 있는 항목을 보강해야 하면 새 번호 말고 기존 항목 아래에 sub-bullet.
