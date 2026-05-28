# CLAUDE.md — lastofdl

> 이 문서는 이 저장소에서 작업하는 Claude(또는 다른 개발자)를 위한 단일 출처(single source of truth)다. 이 파일만 읽고도 사이트를 끝까지 구현하고 배포할 수 있어야 한다.
>
> **새 세션을 시작할 때 [`lesson.md`](./lesson.md)부터 반드시 읽을 것.** 과거에 같은 실수로 시간을 낭비한 항목들이 정리되어 있다.

---

## 1. Project Intent

직장 퇴사를 기념하여 동료 한 명 한 명에게 전하는 **인터랙티브 작별 편지** 정적 웹사이트.

**사용 흐름 (의식처럼 느껴져야 함):**

1. 화면 중앙에 양철 도시락통(`tincan.png`)이 떠 있다.
2. 화면을 클릭/탭하면 카메라가 자물쇠로 줌인된다.
3. 자물쇠 위에 4자리 입력 박스가 나타나고, 본인만의 4자리 비밀번호를 입력한다.
4. 일치하면 *철컥* — 옛 도시락통이 열리는 효과음(`freesound_community-old-metal-lunch-box-71223.mp3`의 0–4초)이 재생되며 잠금이 풀린다.
5. 배경이 암전되고 `letter.png`(엽서) 위에 **그 사람만을 위한 손편지**가 펼쳐진다.
6. 동시에 `smile.mp3`(Katy Perry — *Smile*)가 흐르고, 엽서 아래에 가사가 싱크에 맞춰 자막으로 흘러간다.

**톤 & 분위기:**

- 감성적, 잔잔, 따뜻함. 종이/금속/빈티지 미감.
- **AI 디폴트 룩 금지**: 보라/네온 그라데이션, glassmorphism, neon glow, generic shadcn 다크모드 룩 절대 사용 금지.
- 모든 트랜지션은 길고(800–1200ms) 부드럽게 — 빠른 인터랙션이 아니라 *천천히 음미하는 경험*.

---

## 2. Tech Stack & Repo Layout

- **순수 정적 사이트**: HTML + CSS + JS. 빌드 도구 없음, 프레임워크 없음, npm 없음.
- 배포: GitHub Pages (Actions로 main 브랜치 → 자동 publish).
- 폰트만 Google Fonts에서 로드 허용 (예: `Caveat` 손글씨, `EB Garamond` 본문).

```
/
├── index.html
├── styles.css
├── app.js
├── assets/
│   ├── tincan.png
│   ├── lock.png
│   ├── letter.png
│   ├── lunchbox.mp3            ← freesound_community-old-metal-lunch-box-71223.mp3 복사/리네임
│   └── smile.mp3
├── data/
│   ├── letters.md            ← 수신자별 편지 (개인정보, 커밋 전 확인)
│   └── lyrics.json             ← 타임스탬프 포함 가사
├── tools/
│   └── sync.html               ← 가사 타임스탬프 채우는 유틸 (개발용)
├── lyrics.md                   ← 원본 영문+한국어 가사 (타임스탬프 없음)
└── CLAUDE.md
```

**왜 빌드 없이?** GitHub Pages에 push 즉시 반영되어 편지/가사 수정 사이클이 짧다. 이 프로젝트 규모에 toolchain은 과함.

---

## 3. Scene-by-Scene Spec

### Scene 1 — Tin Can (`#scene-tincan`)

- 중앙에 `tincan.png`. CSS `animation: float 6s ease-in-out infinite`로 ±6px 정도 떠다닌다.
- 그림자는 살짝 떨리도록(블러/오프셋 미세 변화).
- 페이지 진입 3초 후, 하단 중앙에 `"화면을 누르면 열려요 · Click anywhere"` 자막이 천천히 페이드인.
- **클릭/탭 시 (단 한 번)**:
  - `unlockAudio()` 호출 — Scene 5 참조.
  - Scene 1 → Scene 2 트랜지션: tincan 자체를 `transform: scale(2.4) translateY(-10%)` 정도로 줌인하여 자물쇠 영역이 화면을 채우게 한다. 1000ms.
  - 줌이 끝날 즈음 Scene 2의 `lock.png` + 입력 패널이 페이드인.

### Scene 2 — Lock & Inputs (`#scene-lock`)

- `lock.png`이 화면 중앙. 그 위에 어두운 패널이 떠 있고, 패널 안에 3개의 1자리 숫자 입력 박스.
- **입력 인터랙션**:
  - 숫자 입력 시 다음 칸으로 자동 이동(auto-advance).
  - Backspace로 빈 칸일 때 이전 칸으로 이동.
  - ←/→ 화살표로 칸 이동, Enter로 즉시 검증.
  - 4자리 코드 붙여넣기(paste) 한 번에 입력 가능.
  - 모바일은 `inputmode="numeric"` + `type="tel"`로 숫자 키패드.
- **자동 검증**: 세 칸이 모두 채워지면 ~120ms 후 자동 검증.
  - `letters.md`에 해당 키가 있으면 → **잠금 해제**.
  - 없으면 → 자물쇠 + 패널 좌우 shake 0.45s 후 입력 클리어. 메시지/힌트 없음.
- **잠금 해제 시퀀스 (총 4초)**:
  1. 입력 패널 페이드 아웃 + 자물쇠가 살짝 떨어지는 듯한 transform.
  2. `assets/lunchbox.mp3` 재생 시작 (`currentTime = 0`).
  3. `audio.ontimeupdate`로 `currentTime >= 4.0`이 되면 `pause()` → Scene 3 전환 → smile.mp3 시작.
  4. 보호 장치로 `setTimeout(4200ms)`도 함께 등록(timeupdate가 일시 정지된 탭 등에서 누락될 수 있어).

### Scene 3 — Postcard (`#scene-postcard`)

- 배경을 페이드해 `#0a0807`(거의 검정)로.
- `letter.png`을 postcard 비율(약 7:5)로 화면 가운데 배치. 살짝 기울어진 듯한 회전(`rotate(-1.5deg)`)을 권장.
- 그 위(엽서 안쪽)에 해당 사람의 편지 본문 텍스트(`letters.md[code].body`):
  - 손글씨 폰트(`Caveat` 등)로 렌더.
  - `white-space: pre-wrap`으로 줄바꿈 보존.
  - 글자가 한 줄씩 타이프라이터처럼 등장하지 말 것 — 그냥 부드럽게 페이드인. 편지는 *읽는 것*이지 *연출되는 것*이 아니다.
- 엽서 카드 아래쪽 빈 공간에 **노래방식 가사 자막**:
  - 현재 라인: 밝은 잉크색(`#f4ecd8`), 강조.
  - 직전/직후 라인: 흐릿(`opacity: 0.3`)하게 위/아래에 노출하여 흐름이 보이게.
  - 영문이 위, 한국어가 아래 (작게, `0.85em`).
  - 라인 전환 시 0.4s 페이드 + 8px 위로 떠오름.
- `smile.mp3` 자동 시작 (`volume = 0.5`). lunchbox.mp3가 4초에 끝나는 그 순간 `smile.play()` (페이드 없음, 자연스럽게 이어짐).
- 우상단에 작은 닫기(✕), 좌상단에 다시보기(↺) 아이콘 버튼.

---

## 4. Data Files

### `data/letters.md`

**4자리 비밀번호(MMDD, 생일) → 편지 매핑**을 마크다운으로 관리.
GitHub 웹 에디터에서 그대로 편집하고 push하면 다음 페이지 로드부터 반영된다 (`cache: 'no-store'`).

```markdown
**발신자**: 김민석

## 0101 김민영
> 맏누나, 우리 팀 비공식 4대보험.

처음 회사가 무너질 것 같던 ...

## 0202 고경진
> 번아웃엔 물세례, 그다음엔 양지바른 자리.

제가 완전히 번아웃으로 ...
```

**규칙:**
- 최상단 `**발신자**: 이름` — postcard의 FROM 위치에 표시될 발신인.
- 각 편지는 `## CCCC 이름`으로 시작 (CCCC = 4자리 비밀번호, 보통 MMDD).
- 그 다음 `> 한 줄 요약`이 부제(이탤릭)로 표시됨.
- 빈 줄 다음부터는 본문 — 단락은 빈 줄로 구분, `white-space: pre-wrap`으로 그대로 렌더.
- **같은 코드(CCCC)가 두 번 이상 나오면** (생일이 겹치는 경우), 사이트가 자동으로 "누구신가요?" 선택 화면을 띄움.

파싱은 `app.js`의 `parseLettersMd()`가 처리한다. 마크다운 라이브러리 의존 없음.

### `data/lyrics.json`

LRC를 단순화한 JSON. `t`는 `smile.mp3` 시작점(0초) 기준 라인 시작 시각(초).

```json
[
  { "t": 0.0,  "en": "You're out of touch and over time",
                "ko": "바쁜 업무와 끝없는 야근에 치여서" },
  { "t": 5.2,  "en": "You're running and you're running",
                "ko": "그저 앞만 보고 정신없이 달리느라" }
]
```

- 원본 가사는 `lyrics.md`에 영문+한국어로 정리되어 있다. 모든 라인을 JSON에 옮기되 타임스탬프는 직접 채울 수 있다.
- **`t`가 모두 `null`인 상태**라면 `app.js`가 노래 재생 시작 시 곡 길이를 기준으로 자동 분배한다(균등 간격). 정확한 싱크가 필요하면 `tools/sync.html`에서 스페이스바로 마킹해 채워 넣는다.
- 마지막 라인 뒤에 `{ "t": <song length>, "en": "", "ko": "" }`를 두면 마지막 라인이 *언제 사라지는지* 깔끔하게 표현된다.

---

## 5. Audio Engine

- HTML 안에 `<audio>` 두 개:
  ```html
  <audio id="sfx-lunchbox" src="assets/lunchbox.mp3" preload="auto"></audio>
  <audio id="bgm-smile"    src="assets/smile.mp3"    preload="auto"></audio>
  ```
- **모바일 자동재생 정책 대응**:
  - Scene 1 첫 클릭(`pointerdown`)에서 두 오디오 모두 `audio.muted = true; audio.play().then(() => { audio.pause(); audio.currentTime = 0; audio.muted = false; })` — 사용자 제스처 컨텍스트 안에서 unlock.
  - 이 unlock 후엔 `play()`를 코드에서 자유롭게 호출 가능.
- **4초 제한 + 볼륨**:
  - `lunchbox.volume = 0.6; smile.volume = 0.5`
  - `lunchbox.ontimeupdate = () => { if (lunchbox.currentTime >= 4) { lunchbox.pause(); smile.play(); } }`
  - 안전망으로 `setTimeout(4200)`도 동시 등록 — 일부 브라우저(백그라운드 탭)에서 timeupdate가 지연/누락될 수 있음.
- **가사 동기 루프**:
  ```js
  function tick() {
    const t = smile.currentTime;
    // binary search lyrics[i].t <= t < lyrics[i+1].t
    setCurrentLine(i);
    requestAnimationFrame(tick);
  }
  ```

---

## 6. Animations & Style

**팔레트**

| 역할 | 값 |
|---|---|
| 배경(어둠) | `#0a0807` |
| 배경(일반) | `#1a1410` |
| 종이 | `#f4ecd8` |
| 잉크 | `#2c1810` |
| 강조 금속 | `#a08060` |

**타이포**

- 본문/UI: `EB Garamond` 또는 `Spectral` (serif).
- 편지/가사 영문: `Caveat` 또는 `Homemade Apple` (손글씨).
- 한국어: `Nanum Myeongjo` 또는 시스템 명조.

**모션**

- 모든 트랜지션: `cubic-bezier(0.22, 1, 0.36, 1)`, 800–1200ms.
- 가사 라인 전환: 0.4s 페이드 + `translateY(8px → 0)`.
- 자물쇠 shake: `keyframes shake { 0%,100%{x:0} 25%{x:-10px} 75%{x:10px} }` 0.4s.

**금지**

- 보라/시안/핑크 그라데이션, neon glow, glassmorphism, 둥근-사각형-에-블러 박스, 일반 shadcn 다크 룩.
- 빠른 마이크로 인터랙션. 모든 게 *느리고 신중*해야 함.

---

## 7. Accessibility

- 입력 박스는 키보드만으로 완전히 조작 가능 (숫자 입력 시 다음 칸으로 자동 이동, Backspace로 이전 칸, ←→로 칸 이동, Enter로 검증).
- `@media (prefers-reduced-motion: reduce)` 시 줌/shake/float 비활성, 페이드만 유지.
- 가사 컨테이너는 `aria-live="polite"`.
- 이미지에 의미 있는 `alt`: tincan은 `"양철 도시락통"`, lock은 `"자물쇠"`, letter는 `""` (장식, 본문은 텍스트로).
- 닫기/다시보기 버튼에 `aria-label`.

---

## 8. GitHub Pages 배포

빌드 단계가 없으므로 **Deploy from a branch** 방식을 사용한다 (Actions 워크플로 불필요).

**설정 (1회):**

1. 저장소 Settings → **Pages**
2. **Source**: *Deploy from a branch*
3. **Branch**: `main` / `/ (root)`
4. Save

이후 `main`에 push할 때마다 1–2분 내 자동 반영. 빌드 로그 없이 GitHub이 그대로 파일을 서빙한다.

**경로 주의:**

- 사이트 URL은 `https://<user>.github.io/<repo>/` 형태이므로 모든 자산 경로는 **상대 경로**(`assets/...`, `data/...`)로 작성해야 한다. 절대 경로(`/assets/...`)는 깨진다.
- 커스텀 도메인을 쓸 경우 `CNAME` 파일을 루트에 추가.

**왜 Actions가 아닌가?**
빌드 산출물이 곧 소스 그대로(`index.html` + 정적 자산)라서 Actions로 한 단계 거치는 것은 불필요한 복잡도다. 향후 빌드 도구(Vite 등)를 도입한다면 그때 Actions 워크플로로 전환.

---

## 9. Security Note

정적 사이트 특성상 `letters.md`은 누구나 다운로드 가능하다. 즉 4자리 비밀번호는 *실제 잠금*이 아니라 **소유자 의식(identification ritual)**이다.

**선택적 강화 (v2)**: 각 편지를 비밀번호 기반 AES-GCM(PBKDF2)으로 암호화하여 ciphertext만 배포. 비밀번호 입력 시 클라이언트가 복호화 시도 → 성공한 것이 본인 편지. 4자리 PIN은 1000개라 brute force가 자명하므로 PIN 길이를 6+ 자리로 늘려야 의미가 있음. v1에서는 평문으로 둔다.

**개인정보 주의**: `letters.md`은 동료의 이름/실제 메시지를 담는다. 공개 저장소라면 이 점을 본인이 인지하고 push할 것. 비공개로 두려면 저장소를 private로 하되 Pages는 Public 옵션을 켜야 한다(Pro 이상).

---

## 10. Developer Workflow

### 로컬 미리보기

```powershell
python -m http.server 8000
# 또는
npx serve .
```

브라우저: `http://localhost:8000`

### 가사 타임스탬프 채우기

1. `tools/sync.html`을 연다.
2. `smile.mp3`가 재생되며 `lyrics.md`의 라인이 한 줄씩 표시된다.
3. 각 라인의 시작 순간에 **Space**를 누르면 그 라인의 `t`가 현재 `audio.currentTime`으로 기록된다.
4. 끝나면 화면의 JSON을 복사해 `data/lyrics.json`에 저장.
5. 미세 조정: 같은 라인의 `t` 셀을 클릭해 ±0.1s 단위로 조정.

### 동료 편지 추가

`data/letters.md`에 한 줄(또는 블록) 추가하고 commit/push. 빌드 없음.

### 시각 톤 점검 체크리스트 (PR 머지 전)

- [ ] 보라/네온/glassmorphism 흔적 없음
- [ ] 모든 트랜지션이 800ms 이상
- [ ] 손글씨 폰트가 실제로 로드됨 (네트워크 탭 확인)
- [ ] 모바일 사파리에서 첫 클릭 후 오디오가 재생됨
- [ ] `prefers-reduced-motion: reduce` 토글 시 무거운 모션이 비활성됨
- [ ] 키보드만으로 비밀번호 입력 가능

---

## 11. What This File Should NOT Contain

- 코드 전체 구현 — 코드는 `index.html`/`styles.css`/`app.js`에 둔다.
- 실제 동료 이름/편지 본문 — `data/letters.md`에만 두고 이 문서엔 예시만.
- 임시 디버깅 메모 — 작업 끝나면 정리.

---

## 12. Open Questions (구현 중 결정)

- 편지가 매우 긴 경우 postcard 안에서 스크롤 허용 여부? — 일단 허용하되 스크롤바는 숨김 처리.
- "다시보기(↺)" 클릭 시 Scene 1으로 복귀할지, Scene 2(입력 패널)로 복귀할지? — 일단 Scene 1으로.
- 효과음 4초가 동료마다 너무 짧거나 길게 느껴진다면 `SFX_HOLD_SEC` 상수만 조정.

이 결정들은 구현하며 자연스럽게 답을 찾고, 답이 잡히면 이 문서의 해당 절을 갱신할 것.
