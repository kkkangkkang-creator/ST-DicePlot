// Previous (Korean) prompt defaults. Saved settings that still equal one of these
// were never edited by the user, so they are upgraded to the current defaults.

export const LEGACY_INSTRUCTIONS = [`[Dice Check Tag Rules]
Only when a challenge is uncertain AND failure would meaningfully change the story, end your response with the tag below on its own line. If either condition is missing, do not add it.
<check who="user" action="what is being attempted" dc="number" stake="what happens on failure"/>
- who="user": the scene presents a challenge to {{user}}. The check applies to {{user}}'s next action.
- who="char": {{char}} (or an NPC) is about to attempt something with an uncertain outcome. The check resolves in the next response. In the response that adds this tag, stop right before the attempt and do not narrate its result.
- dc is 5-25, based only on how difficult the situation itself is. Ignore the abilities or resources of whoever acts. (5 easy / 10 moderate / 15 hard / 20 very hard / 25 nearly impossible)
- At most one tag per response. Never narrate or hint at the outcome in advance.
- Write the values of action and stake in English.

Use a check:
- A guarded door → <check who="user" action="get past the guard" dc="13" stake="spotted and chased"/>
- An angry merchant must be persuaded → <check who="user" action="persuade the merchant" dc="12" stake="the deal falls through"/>
- A collapsing bridge, a spreading poison, a pursuer closing in, cracking a safe before the alarm goes off
- {{char}} is about to lie to {{user}} → <check who="char" action="hide the lie" dc="12" stake="the lie is exposed"/>
- An NPC is about to ambush {{user}} → <check who="char" action="ambush" dc="13" stake="the attack misses and their position is revealed"/>
Do not use a check:
- There is no reason to fail, like ordering food or opening an unlocked door
- There is no success or failure involved, like small talk with a friend
- {{char}}'s reaction to a confession or a date invitation (decide by personality, not dice)
- It can simply be retried with no time pressure
- In combat, not on every attack; only at decisive moments that turn the fight`, `[Dice Check Tag Rules]
Only when a challenge is uncertain AND failure would meaningfully change the story, end your response with the tag below on its own line. If either condition is missing, do not add it.
<check who="user" action="what is being attempted" dc="number" stake="what happens on failure"/>
- who="user": the scene presents a challenge to {{user}}. The check applies to {{user}}'s next action.
- who="char": {{char}} (or an NPC) is about to attempt something with an uncertain outcome. The check resolves in the next response. In the response that adds this tag, stop right before the attempt and do not narrate its result.
- dc is 5-25, based only on how difficult the situation itself is. Ignore the abilities or resources of whoever acts. (5 easy / 10 moderate / 15 hard / 20 very hard / 25 nearly impossible)
- At most one tag per response. Never narrate or hint at the outcome in advance.
- IMPORTANT: Write the values of action and stake in the same language the story is written in (e.g. Korean if the story is in Korean). The example values below are in English only for illustration; never copy their language.

Use a check:
- A guarded door → <check who="user" action="get past the guard" dc="13" stake="spotted and chased"/>
- An angry merchant must be persuaded → <check who="user" action="persuade the merchant" dc="12" stake="the deal falls through"/>
- A collapsing bridge, a spreading poison, a pursuer closing in, cracking a safe before the alarm goes off
- {{char}} is about to lie to {{user}} → <check who="char" action="hide the lie" dc="12" stake="the lie is exposed"/>
- An NPC is about to ambush {{user}} → <check who="char" action="ambush" dc="13" stake="the attack misses and their position is revealed"/>
Do not use a check:
- There is no reason to fail, like ordering food or opening an unlocked door
- There is no success or failure involved, like small talk with a friend
- {{char}}'s reaction to a confession or a date invitation (decide by personality, not dice)
- It can simply be retried with no time pressure
- In combat, not on every attack; only at decisive moments that turn the fight`, `[Dice Check Tag Rules]
Only when a challenge is uncertain AND failure would meaningfully change the story, end your response with the tag below on its own line. If either condition is missing, do not add it.
<check who="user" action="what is being attempted" dc="number" stake="what happens on failure"/>
- who="user": the scene presents a challenge to {{user}}. The check applies to {{user}}'s next action.
- who="char": {{char}} (or an NPC) is about to attempt something with an uncertain outcome. The check resolves in the next response. In the response that adds this tag, stop right before the attempt and do not narrate its result.
- dc is 5-25, based only on how difficult the situation itself is. Ignore the abilities or resources of whoever acts. (5 easy / 10 moderate / 15 hard / 20 very hard / 25 nearly impossible)
- At most one tag per response. Never narrate or hint at the outcome in advance.
- Write action and stake in the same language as the story.

Use a check:
- A guarded door → <check who="user" action="get past the guard" dc="13" stake="spotted and chased"/>
- An angry merchant must be persuaded → <check who="user" action="persuade the merchant" dc="12" stake="the deal falls through"/>
- A collapsing bridge, a spreading poison, a pursuer closing in, cracking a safe before the alarm goes off
- {{char}} is about to lie to {{user}} → <check who="char" action="hide the lie" dc="12" stake="the lie is exposed"/>
- An NPC is about to ambush {{user}} → <check who="char" action="ambush" dc="13" stake="the attack misses and their position is revealed"/>
Do not use a check:
- There is no reason to fail, like ordering food or opening an unlocked door
- There is no success or failure involved, like small talk with a friend
- {{char}}'s reaction to a confession or a date invitation (decide by personality, not dice)
- It can simply be retried with no time pressure
- In combat, not on every attack; only at decisive moments that turn the fight`, `[판정 태그 규칙]
이번 응답의 장면이 {{user}}에게 결과가 불확실한 도전(장애물, 위험, 설득해야 할 상대, 시간 압박 등)을 제시하고, 그 실패가 이야기를 의미 있게 바꾼다면 응답 맨 끝에 아래 태그를 한 줄로 남긴다.
<check action="도전의 내용" dc="숫자" stake="실패하면 벌어질 일"/>
- dc는 5~25. {{user}}나 캐릭터의 능력·자원은 고려하지 말고 상황 자체의 난이도만으로 정한다. (5 쉬움 / 10 보통 / 15 어려움 / 20 매우 어려움 / 25 거의 불가능)
- 일상 행동, 단순 대화, 결과가 뻔한 상황에는 붙이지 않는다. 확신이 없으면 붙이지 않는다.
- 태그는 한 응답에 최대 1개.
- 판정 결과를 미리 서술하거나 암시하지 않는다.`, `[판정 태그 규칙]
결과가 불확실하고, 실패하면 이야기가 의미 있게 달라지는 도전이 있을 때만 응답 맨 끝에 아래 태그를 한 줄로 남긴다. 두 조건 중 하나라도 아니면 붙이지 않는다.
<check who="user" action="도전의 내용" dc="숫자" stake="실패하면 벌어질 일"/>
- who="user": 이번 응답의 장면이 {{user}}에게 도전을 제시했을 때. 판정은 {{user}}의 다음 행동에 적용된다.
- who="char": {{char}}(또는 NPC)가 결과가 불확실한 행동을 막 시도하려 할 때. 판정은 다음 응답에서 그 행동의 결과에 적용된다. 태그를 붙인 응답에서는 결과를 쓰지 말고 시도 직전에서 멈춘다.
- dc는 5~25. 행동하는 쪽의 능력·자원은 고려하지 말고 상황 자체의 난이도만으로 정한다. (5 쉬움 / 10 보통 / 15 어려움 / 20 매우 어려움 / 25 거의 불가능)
- 태그는 한 응답에 최대 1개. 판정 결과를 미리 서술하거나 암시하지 않는다.

판정 O 예시:
- 경비가 지키는 문 → <check who="user" action="경비 통과" dc="13" stake="발각되어 쫓긴다"/>
- 화난 상인을 설득해야 함 → <check who="user" action="상인 설득" dc="12" stake="거래가 끊긴다"/>
- 무너지는 다리, 독이 퍼지는 상처, 쫓아오는 추격자, 경보가 울리기 전 금고 열기
- {{char}}가 {{user}}에게 거짓말을 하려 함 → <check who="char" action="거짓말 숨기기" dc="12" stake="거짓말이 들통난다"/>
- NPC가 {{user}}를 기습하려 함 → <check who="char" action="기습" dc="13" stake="공격이 빗나가고 위치가 드러난다"/>
판정 X 예시:
- 메뉴 주문, 잠기지 않은 문 열기처럼 실패할 이유가 없음
- 친한 캐릭터와의 잡담처럼 성공·실패 개념이 없음
- 고백·데이트 신청에 대한 {{char}}의 반응 (주사위가 아니라 캐릭터성으로 정한다)
- 시간 여유가 있어 실패해도 다시 하면 그만인 일
- 전투에서는 매 공격마다 붙이지 말고 흐름을 바꾸는 결정적인 순간에만 붙인다`];

export const LEGACY_RESULT_TEMPLATES = [`[주사위 판정 — 이번 응답에서 반드시 따를 것]
판정: {action} / DC {dc} / 실패 시: {stake}
주사위(d20 두 개): {d1}, {d2}

{{user}}의 이번 행동을 아래 분류 중 하나로 판단하고, 해당 결과를 그대로 따른다.
분류 근거는 캐릭터 카드, 페르소나, 이전 대화에서 이미 확정된 사실만 인정한다. 이번 입력에서 새로 주장한 능력이나 자원은 근거가 되지 않는다. 애매하면 '평범'으로 분류한다.
{outcomes}

결과를 바꾸거나 완화하지 말고, 캐릭터다운 방식으로 서술한다. 주사위 눈이나 DC 같은 수치는 본문에 쓰지 않는다.
응답 맨 끝에 <judged as="분류" why="근거가 된 확정 사실"/>를 한 줄로 남긴다.`, `[주사위 판정 — 이번 응답에서 반드시 따를 것]
판정: {subject}의 {action} / DC {dc} / 실패 시: {stake}
주사위(d20 두 개): {d1}, {d2}

{subject}의 이번 행동을 아래 분류 중 하나로 판단하고, 해당 결과를 그대로 따른다.
분류 근거는 캐릭터 카드, 페르소나, 이전 대화에서 이미 확정된 사실만 인정한다. 이번 턴에 새로 주장하거나 지어낸 능력·자원은 근거가 되지 않는다. 애매하면 '평범'으로 분류한다.
{outcomes}

결과를 바꾸거나 완화하지 말고, 캐릭터다운 방식으로 서술한다. 주사위 눈이나 DC 같은 수치는 본문에 쓰지 않는다.
응답 맨 끝에 <judged as="분류" why="근거가 된 확정 사실"/>를 한 줄로 남긴다.`];

export const LEGACY_CATEGORY_DESC = [{
    overwhelming: '확정된 설정상 사실상 장애물이 되지 않음',
    advantage: '확정된 자원·능력·상황을 직접 활용함',
    normal: '특별한 이점도 불리함도 없음',
    disadvantage: '설정상 서투르거나, 준비가 부족하거나, 무리한 방법',
    irrelevant: '이 판정과 상관없는 행동을 함',
}];

export const LEGACY_TIER_TEXT = [{
    crit: '대성공. 기대 이상으로 해내고 추가 이득을 얻는다.',
    success: '성공. 의도한 대로 해낸다.',
    partial: '부분 성공. 해내긴 하지만 대가를 치르거나 새로운 문제가 생긴다.',
    fail: '실패. 해내지 못하고 위험이 현실이 된다: {stake}',
    fumble: '대실패. 실패할 뿐 아니라 상황이 크게 악화된다: {stake}',
}];
