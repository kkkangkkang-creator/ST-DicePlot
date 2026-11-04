// DicePlot — SillyTavern extension
// The AI marks uncertain challenges with a <check/> tag at the end of its reply.
// Before the next generation, this extension rolls 2d20 in plain JS (no extra AI call),
// pre-computes the outcome for every approach category, and injects the result
// at the very bottom of the context. The AI only classifies the user's approach.

const MODULE = 'diceplot';
const KEY_INSTRUCTION = 'diceplot_instruction';
const KEY_RESULT = 'diceplot_result';

// Mirrors of SillyTavern enums (not exposed through getContext)
const PROMPT_POSITION = { IN_PROMPT: 0, IN_CHAT: 1 };
const PROMPT_ROLE_SYSTEM = 0;

const CHECK_RE = /<check\b([^>]*?)\/?>(?:\s*<\/check>)?/gi;
const JUDGED_RE = /<judged\b([^>]*?)\/?>(?:\s*<\/judged>)?/gi;
const ESCAPED_TAG_RE = /&lt;(check|judged)\b[\s\S]*?&gt;(?:\s*&lt;\/\1&gt;)?/gi;

const CATEGORIES = [
    { key: 'overwhelming', label: '압도적 우위', aliases: ['overwhelming', '압도적우위', '압도'] },
    { key: 'advantage', label: '우위', aliases: ['advantage'] },
    { key: 'normal', label: '평범', aliases: ['normal', '보통'] },
    { key: 'disadvantage', label: '불리', aliases: ['disadvantage'] },
    { key: 'irrelevant', label: '무관', aliases: ['irrelevant', '해당없음'] },
];

const TIER_LABELS = {
    crit: '대성공',
    success: '성공',
    partial: '부분 성공',
    fail: '실패',
    fumble: '대실패',
};

const DEFAULT_INSTRUCTION = `[판정 태그 규칙]
이번 응답의 장면이 {{user}}에게 결과가 불확실한 도전(장애물, 위험, 설득해야 할 상대, 시간 압박 등)을 제시하고, 그 실패가 이야기를 의미 있게 바꾼다면 응답 맨 끝에 아래 태그를 한 줄로 남긴다.
<check action="도전의 내용" dc="숫자" stake="실패하면 벌어질 일"/>
- dc는 5~25. {{user}}나 캐릭터의 능력·자원은 고려하지 말고 상황 자체의 난이도만으로 정한다. (5 쉬움 / 10 보통 / 15 어려움 / 20 매우 어려움 / 25 거의 불가능)
- 일상 행동, 단순 대화, 결과가 뻔한 상황에는 붙이지 않는다. 확신이 없으면 붙이지 않는다.
- 태그는 한 응답에 최대 1개.
- 판정 결과를 미리 서술하거나 암시하지 않는다.`;

const DEFAULT_RESULT_TEMPLATE = `[주사위 판정 — 이번 응답에서 반드시 따를 것]
판정: {action} / DC {dc} / 실패 시: {stake}
주사위(d20 두 개): {d1}, {d2}

{{user}}의 이번 행동을 아래 분류 중 하나로 판단하고, 해당 결과를 그대로 따른다.
분류 근거는 캐릭터 카드, 페르소나, 이전 대화에서 이미 확정된 사실만 인정한다. 이번 입력에서 새로 주장한 능력이나 자원은 근거가 되지 않는다. 애매하면 '평범'으로 분류한다.
{outcomes}

결과를 바꾸거나 완화하지 말고, 캐릭터다운 방식으로 서술한다. 주사위 눈이나 DC 같은 수치는 본문에 쓰지 않는다.
응답 맨 끝에 <judged as="분류" why="근거가 된 확정 사실"/>를 한 줄로 남긴다.`;

const DEFAULT_CATEGORY_DESC = {
    overwhelming: '확정된 설정상 사실상 장애물이 되지 않음',
    advantage: '확정된 자원·능력·상황을 직접 활용함',
    normal: '특별한 이점도 불리함도 없음',
    disadvantage: '설정상 서투르거나, 준비가 부족하거나, 무리한 방법',
    irrelevant: '이 판정과 상관없는 행동을 함',
};

const DEFAULT_TIER_TEXT = {
    crit: '대성공. 기대 이상으로 해내고 추가 이득을 얻는다.',
    success: '성공. 의도한 대로 해낸다.',
    partial: '부분 성공. 해내긴 하지만 대가를 치르거나 새로운 문제가 생긴다.',
    fail: '실패. 해내지 못하고 위험이 현실이 된다: {stake}',
    fumble: '대실패. 실패할 뿐 아니라 상황이 크게 악화된다: {stake}',
};

const DEFAULT_SIDE_TEXT = {
    clean: '뒤탈 없이 깔끔하게 끝난다.',
    cost: '해결은 되지만 사소한 대가나 뒷말이 남는다.',
};

const defaultSettings = Object.freeze({
    enabled: true,
    hideTags: true,
    showBadges: true,
    showToast: true,
    rerollOnSwipe: false,
    partialMargin: 4,
    cooldown: 0,
    instructionPosition: 'chat', // 'chat' | 'prompt'
    instructionDepth: 1,
    instruction: DEFAULT_INSTRUCTION,
    resultTemplate: DEFAULT_RESULT_TEMPLATE,
    categoryDesc: DEFAULT_CATEGORY_DESC,
    tierText: DEFAULT_TIER_TEXT,
    sideText: DEFAULT_SIDE_TEXT,
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    if (!extensionSettings[MODULE]) {
        extensionSettings[MODULE] = structuredClone(defaultSettings);
    }
    const s = extensionSettings[MODULE];
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (!Object.hasOwn(s, key)) {
            s[key] = structuredClone(value);
        } else if (value && typeof value === 'object') {
            for (const [sub, subValue] of Object.entries(value)) {
                if (!Object.hasOwn(s[key], sub)) s[key][sub] = subValue;
            }
        }
    }
    return s;
}

function getChatState() {
    const { chatMetadata } = SillyTavern.getContext();
    if (!chatMetadata) return {};
    if (!chatMetadata[MODULE]) chatMetadata[MODULE] = {};
    return chatMetadata[MODULE];
}

function saveChatState() {
    const ctx = SillyTavern.getContext();
    (ctx.saveMetadataDebounced ?? ctx.saveMetadata)?.();
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function parseAttrs(str) {
    const attrs = {};
    const re = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+))/g;
    let m;
    while ((m = re.exec(str)) !== null) {
        attrs[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? '').trim();
    }
    return attrs;
}

function findLastTag(text, re) {
    if (typeof text !== 'string') return null;
    let last = null;
    for (const m of text.matchAll(re)) last = m;
    return last ? parseAttrs(last[1]) : null;
}

function parseCheck(text) {
    const attrs = findLastTag(text, CHECK_RE);
    if (!attrs) return null;
    const dc = parseInt(attrs.dc, 10);
    if (!Number.isFinite(dc)) return null;
    return {
        action: attrs.action || '도전',
        dc: Math.max(1, Math.min(30, dc)),
        stake: attrs.stake || '상황이 나빠진다',
    };
}

function parseJudged(text) {
    const attrs = findLastTag(text, JUDGED_RE);
    if (!attrs) return null;
    return { category: normalizeCategory(attrs.as), why: attrs.why || '' };
}

function normalizeCategory(value) {
    const v = String(value ?? '').replace(/\s+/g, '').toLowerCase();
    for (const c of CATEGORIES) {
        if (c.label.replace(/\s+/g, '') === v || c.aliases.includes(v)) return c.key;
    }
    return null;
}

function stripTags(text) {
    if (typeof text !== 'string') return text;
    return text.replace(CHECK_RE, '').replace(JUDGED_RE, '').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function rollD20() {
    const buf = new Uint32Array(1);
    // Rejection sampling keeps the distribution uniform
    const limit = Math.floor(0x100000000 / 20) * 20;
    do {
        crypto.getRandomValues(buf);
    } while (buf[0] >= limit);
    return (buf[0] % 20) + 1;
}

function tierOf(die, dc, margin) {
    if (die === 20) return 'crit';
    if (die === 1) return 'fumble';
    if (die >= dc) return 'success';
    if (die >= dc - margin) return 'partial';
    return 'fail';
}

function dieFor(category, d1, d2) {
    switch (category) {
        case 'advantage': return Math.max(d1, d2);
        case 'disadvantage': return Math.min(d1, d2);
        case 'normal': return d1;
        default: return null;
    }
}

function fill(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, (all, key) => (Object.hasOwn(vars, key) ? String(vars[key]) : all));
}

function describeOutcome(category, roll, s) {
    const vars = { action: roll.action, dc: roll.dc, stake: roll.stake, d1: roll.d1, d2: roll.d2 };
    if (category === 'overwhelming') {
        const side = roll.d1 >= roll.dc ? s.sideText.clean : s.sideText.cost;
        return { tier: 'success', text: `판정 없이 성공. ${fill(side, vars)}` };
    }
    if (category === 'irrelevant') {
        return { tier: null, text: '이 판정은 무시하고 자연스럽게 진행한다.' };
    }
    const die = dieFor(category, roll.d1, roll.d2);
    const tier = tierOf(die, roll.dc, Number(s.partialMargin) || 0);
    return { tier, die, text: `${die} → ${fill(s.tierText[tier], vars)}` };
}

function buildResultPrompt(roll, s) {
    const lines = CATEGORIES.map(c => {
        const desc = s.categoryDesc[c.key] ? ` (${s.categoryDesc[c.key]})` : '';
        return `- ${c.label}${desc} → ${describeOutcome(c.key, roll, s).text}`;
    });
    return fill(s.resultTemplate, {
        action: roll.action,
        dc: roll.dc,
        stake: roll.stake,
        d1: roll.d1,
        d2: roll.d2,
        outcomes: lines.join('\n'),
    });
}

// ---------------------------------------------------------------------------
// Pending check resolution
// ---------------------------------------------------------------------------

function findLastIndex(arr, pred, from = arr.length - 1) {
    for (let i = from; i >= 0; i--) if (pred(arr[i], i)) return i;
    return -1;
}

/** Finds the <check/> tag in the AI message(s) right before the given user message. */
function findSourceCheck(chat, userIdx) {
    for (let i = userIdx - 1; i >= 0; i--) {
        const m = chat[i];
        if (!m) continue;
        if (m.is_user) break;
        if (m.is_system) continue;
        const check = parseCheck(m.mes);
        if (check) return { index: i, ...check };
    }
    return null;
}

function isOnCooldown(chat, userIdx, cooldown) {
    if (!cooldown || cooldown <= 0) return false;
    let seen = 0;
    for (let i = userIdx - 1; i >= 0 && seen < cooldown; i--) {
        const m = chat[i];
        if (!m?.is_user || m.is_system) continue;
        seen++;
        if (m.extra?.[MODULE]) return true;
    }
    return false;
}

/**
 * Returns the roll that applies to the upcoming generation, rolling new dice if needed.
 * The roll is stored on the latest user message so swipes reuse it.
 */
function resolveRoll(chat, type, s) {
    const userIdx = findLastIndex(chat, m => m?.is_user && !m.is_system);
    if (userIdx < 0) return null;
    const userMsg = chat[userIdx];
    const state = getChatState();
    let roll = userMsg.extra?.[MODULE] ?? null;

    if (roll) {
        // Keep check info in sync if the user edited the tag; drop the roll if the tag was removed
        if (typeof roll.source === 'number') {
            const check = parseCheck(chat[roll.source]?.mes);
            if (!check) {
                delete userMsg.extra[MODULE];
                return null;
            }
            Object.assign(roll, check);
        }
        const isReroll = type === 'swipe' || type === 'regenerate';
        if (s.rerollOnSwipe && isReroll) {
            roll.d1 = rollD20();
            roll.d2 = rollD20();
            return { roll, userIdx, fresh: true };
        }
        return { roll, userIdx, fresh: false };
    }

    let check = null;
    let source = null;
    if (state.manual) {
        check = state.manual;
        source = 'manual';
        delete state.manual;
        saveChatState();
    } else {
        const found = findSourceCheck(chat, userIdx);
        if (!found) return null;
        if (state.cancelled === found.index) return null;
        if (isOnCooldown(chat, userIdx, Number(s.cooldown))) return null;
        check = found;
        source = found.index;
    }

    roll = {
        action: check.action,
        dc: check.dc,
        stake: check.stake,
        d1: rollD20(),
        d2: rollD20(),
        source,
    };
    userMsg.extra = userMsg.extra ?? {};
    userMsg.extra[MODULE] = roll;
    return { roll, userIdx, fresh: true };
}

// ---------------------------------------------------------------------------
// Generation interceptor
// ---------------------------------------------------------------------------

function clearPrompts() {
    const { setExtensionPrompt } = SillyTavern.getContext();
    setExtensionPrompt(KEY_INSTRUCTION, '', PROMPT_POSITION.IN_CHAT, 0);
    setExtensionPrompt(KEY_RESULT, '', PROMPT_POSITION.IN_CHAT, 0);
}

globalThis.diceplotInterceptor = async function (coreChat, _contextSize, _abort, type) {
    clearPrompts();
    const s = getSettings();
    if (!s.enabled) return;
    if (type === 'quiet' || type === 'impersonate') return;

    const ctx = SillyTavern.getContext();

    // 1. The rule that tells the AI when to emit <check/>
    const instructionInChat = s.instructionPosition !== 'prompt';
    ctx.setExtensionPrompt(
        KEY_INSTRUCTION,
        s.instruction,
        instructionInChat ? PROMPT_POSITION.IN_CHAT : PROMPT_POSITION.IN_PROMPT,
        instructionInChat ? Math.max(0, Number(s.instructionDepth) || 0) : 0,
        false,
        PROMPT_ROLE_SYSTEM,
    );

    // 2. Remove old tags from the prompt copy (stored messages stay intact)
    for (let i = 0; i < coreChat.length; i++) {
        const isContinuePrefix = type === 'continue' && i === coreChat.length - 1;
        if (!isContinuePrefix && typeof coreChat[i]?.mes === 'string') {
            coreChat[i].mes = stripTags(coreChat[i].mes);
        }
    }

    // 3. Roll and inject the result at the very bottom
    const resolved = resolveRoll(ctx.chat, type, s);
    if (!resolved) return;
    const { roll, userIdx, fresh } = resolved;

    ctx.setExtensionPrompt(KEY_RESULT, buildResultPrompt(roll, s), PROMPT_POSITION.IN_CHAT, 0, false, PROMPT_ROLE_SYSTEM);

    if (fresh) {
        try { ctx.saveChat?.(); } catch (e) { console.warn(`[${MODULE}] save failed`, e); }
        if (s.showToast) {
            toastr.info(`${roll.action} · DC ${roll.dc}`, `🎲 d20: ${roll.d1} / ${roll.d2}`, { timeOut: 4000 });
        }
    }
    renderBadge(userIdx);
};

// ---------------------------------------------------------------------------
// Display: hide tags, show badges
// ---------------------------------------------------------------------------

let formatterHookInstalled = false;

function installFormatterHook() {
    const { messageFormatter } = SillyTavern.getContext();
    if (!messageFormatter?.addHook) return;
    messageFormatter.addHook((mes) => (getSettings().hideTags ? stripTags(mes) : mes), {
        stage: messageFormatter.stage?.BEFORE_REGEX ?? 'beforeRegex',
        order: messageFormatter.order?.EARLIEST ?? 0,
    });
    formatterHookInstalled = true;
}

/** Fallback for SillyTavern versions without the message formatter hook API. */
function hideTagsInDom(mesTextEl) {
    if (formatterHookInstalled || !getSettings().hideTags || !mesTextEl) return;
    const html = mesTextEl.innerHTML;
    const cleaned = html.replace(ESCAPED_TAG_RE, '');
    if (cleaned !== html) mesTextEl.innerHTML = cleaned;
}

function findRollBefore(chat, aiIdx) {
    for (let i = aiIdx - 1; i >= 0; i--) {
        const m = chat[i];
        if (m?.is_user && !m.is_system) return m.extra?.[MODULE] ?? null;
    }
    return null;
}

function badgeLines(chat, idx) {
    const msg = chat[idx];
    if (!msg || msg.is_system) return [];
    const s = getSettings();
    const lines = [];

    if (msg.is_user) {
        const roll = msg.extra?.[MODULE];
        if (roll) lines.push(`🎲 ${roll.action} · DC ${roll.dc} · d20: ${roll.d1} / ${roll.d2}`);
        return lines;
    }

    const judged = parseJudged(msg.mes);
    if (judged) {
        const roll = findRollBefore(chat, idx);
        const label = CATEGORIES.find(c => c.key === judged.category)?.label ?? '알 수 없음';
        let text = `⚖️ ${label}`;
        if (roll && judged.category) {
            const outcome = describeOutcome(judged.category, roll, s);
            if (outcome.die != null) text += ` → ${outcome.die} vs DC ${roll.dc}`;
            if (outcome.tier) text += ` → ${TIER_LABELS[outcome.tier]}`;
        }
        if (judged.why) text += ` · ${judged.why}`;
        lines.push(text);
    }

    const check = parseCheck(msg.mes);
    if (check) {
        const cancelled = getChatState().cancelled === idx;
        lines.push(`🎯 ${cancelled ? '(취소됨) ' : ''}판정 대기: ${check.action} · DC ${check.dc} · 실패 시: ${check.stake}`);
    }
    return lines;
}

function renderBadge(idx) {
    const el = document.querySelector(`#chat .mes[mesid="${idx}"]`);
    if (!el) return;
    const mesText = el.querySelector('.mes_text');
    hideTagsInDom(mesText);
    el.querySelector('.diceplot-badges')?.remove();

    const s = getSettings();
    if (!s.enabled || !s.showBadges || !mesText) return;
    const { chat } = SillyTavern.getContext();
    const lines = badgeLines(chat, idx);
    if (!lines.length) return;

    const box = document.createElement('div');
    box.className = 'diceplot-badges';
    for (const line of lines) {
        const div = document.createElement('div');
        div.className = 'diceplot-badge';
        div.textContent = line;
        box.appendChild(div);
    }
    mesText.insertAdjacentElement('afterend', box);
}

let renderAllTimer = null;
function renderAllBadges() {
    clearTimeout(renderAllTimer);
    renderAllTimer = setTimeout(() => {
        document.querySelectorAll('#chat .mes[mesid]').forEach(el => renderBadge(Number(el.getAttribute('mesid'))));
    }, 50);
}

// ---------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------

function registerCommands() {
    const { SlashCommandParser, SlashCommand, SlashCommandNamedArgument, SlashCommandArgument, ARGUMENT_TYPE } = SillyTavern.getContext();
    if (!SlashCommandParser?.addCommandObject) return;

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'dp-check',
        helpString: '<div>다음 생성에 판정을 강제로 겁니다. 예: <code>/dp-check dc=13 stake="경비에게 발각" 담 넘기</code></div>',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'dc', description: '난이도 (5~25)', typeList: [ARGUMENT_TYPE.NUMBER], isRequired: true }),
            SlashCommandNamedArgument.fromProps({ name: 'stake', description: '실패 시 벌어질 일', typeList: [ARGUMENT_TYPE.STRING] }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({ description: '도전 내용', typeList: [ARGUMENT_TYPE.STRING] }),
        ],
        callback: (args, value) => {
            const dc = parseInt(args.dc, 10);
            if (!Number.isFinite(dc)) {
                toastr.warning('dc를 숫자로 입력해 주세요.');
                return '';
            }
            getChatState().manual = {
                action: String(value ?? '').trim() || '도전',
                dc: Math.max(1, Math.min(30, dc)),
                stake: String(args.stake ?? '').trim() || '상황이 나빠진다',
            };
            saveChatState();
            toastr.success(`다음 생성에 판정을 겁니다 (DC ${dc})`);
            return '';
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'dp-cancel',
        helpString: '<div>대기 중인 판정을 취소합니다. 이미 굴린 결과가 있으면 지웁니다.</div>',
        callback: () => {
            const { chat } = SillyTavern.getContext();
            const state = getChatState();
            delete state.manual;
            const userIdx = findLastIndex(chat, m => m?.is_user && !m.is_system);
            const lastIdx = chat.length - 1;
            // Pending check on the latest AI message (user hasn't replied yet)
            const pending = chat[lastIdx] && !chat[lastIdx].is_user && parseCheck(chat[lastIdx].mes) ? lastIdx : null;
            if (pending !== null) {
                state.cancelled = pending;
            } else if (userIdx >= 0) {
                const roll = chat[userIdx].extra?.[MODULE];
                if (typeof roll?.source === 'number') state.cancelled = roll.source;
                if (chat[userIdx].extra) delete chat[userIdx].extra[MODULE];
                SillyTavern.getContext().saveChat?.();
            }
            saveChatState();
            renderAllBadges();
            toastr.info('판정을 취소했습니다.');
            return '';
        },
    }));
}

// ---------------------------------------------------------------------------
// Settings UI
// ---------------------------------------------------------------------------

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[ch]));
}

function settingsHtml(s) {
    const categoryInputs = CATEGORIES.map(c => `
        <label class="diceplot-row">
            <span>${c.label}</span>
            <input class="text_pole" data-dp-path="categoryDesc.${c.key}" type="text" />
        </label>`).join('');
    const tierInputs = Object.keys(DEFAULT_TIER_TEXT).map(k => `
        <label class="diceplot-row">
            <span>${TIER_LABELS[k]}</span>
            <input class="text_pole" data-dp-path="tierText.${k}" type="text" />
        </label>`).join('');

    return `
    <div id="diceplot_settings" class="extension_settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>🎲 DicePlot</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content diceplot-settings">
                <label class="checkbox_label"><input type="checkbox" data-dp-path="enabled" /><span>사용</span></label>
                <label class="checkbox_label"><input type="checkbox" data-dp-path="hideTags" /><span>채팅 화면에서 태그 숨기기</span></label>
                <label class="checkbox_label"><input type="checkbox" data-dp-path="showBadges" /><span>판정 배지 표시</span></label>
                <label class="checkbox_label"><input type="checkbox" data-dp-path="showToast" /><span>굴릴 때 알림 표시</span></label>
                <label class="checkbox_label"><input type="checkbox" data-dp-path="rerollOnSwipe" /><span>스와이프/재생성 시 다시 굴리기</span></label>

                <label class="diceplot-row">
                    <span>부분 성공 범위 (DC보다 이만큼 낮아도 부분 성공)</span>
                    <input class="text_pole" type="number" min="0" max="10" data-dp-path="partialMargin" />
                </label>
                <label class="diceplot-row">
                    <span>쿨다운 (판정 후 N턴 동안 새 판정 무시, 0 = 끔)</span>
                    <input class="text_pole" type="number" min="0" max="20" data-dp-path="cooldown" />
                </label>

                <hr />
                <b>판정 태그 지침</b>
                <small>AI가 언제 &lt;check/&gt; 태그를 붙일지 정하는 규칙입니다.</small>
                <div class="diceplot-inline">
                    <select class="text_pole" data-dp-path="instructionPosition">
                        <option value="chat">채팅 안 (깊이 지정)</option>
                        <option value="prompt">시스템 프롬프트 뒤</option>
                    </select>
                    <label>깊이 <input class="text_pole" type="number" min="0" max="20" data-dp-path="instructionDepth" /></label>
                </div>
                <textarea class="text_pole textarea_compact" rows="8" data-dp-path="instruction"></textarea>

                <hr />
                <b>결과 주입 템플릿</b>
                <small>사용 가능: {action} {dc} {stake} {d1} {d2} {outcomes}</small>
                <textarea class="text_pole textarea_compact" rows="8" data-dp-path="resultTemplate"></textarea>

                <b>분류 기준</b>
                ${categoryInputs}

                <b>결과 문구</b>
                <small>{stake} 등 사용 가능</small>
                ${tierInputs}

                <b>압도적 우위의 부작용 (첫 번째 주사위가 DC 이상이면 깔끔)</b>
                <label class="diceplot-row"><span>깔끔</span><input class="text_pole" type="text" data-dp-path="sideText.clean" /></label>
                <label class="diceplot-row"><span>대가</span><input class="text_pole" type="text" data-dp-path="sideText.cost" /></label>

                <div class="diceplot-inline">
                    <div id="diceplot_reset" class="menu_button">문구를 기본값으로 되돌리기</div>
                </div>
            </div>
        </div>
    </div>`;
}

function getPath(obj, path) {
    return path.split('.').reduce((o, k) => o?.[k], obj);
}

function setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => o[k], obj);
    target[last] = value;
}

function syncSettingsUI() {
    const s = getSettings();
    document.querySelectorAll('#diceplot_settings [data-dp-path]').forEach(el => {
        const value = getPath(s, el.dataset.dpPath);
        if (el.type === 'checkbox') el.checked = !!value;
        else el.value = value ?? '';
    });
}

function createSettingsUI() {
    const container = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!container) return;
    container.insertAdjacentHTML('beforeend', settingsHtml(getSettings()));
    syncSettingsUI();

    const root = document.getElementById('diceplot_settings');
    root.addEventListener('input', onSettingChange);
    root.addEventListener('change', onSettingChange);
    root.querySelector('#diceplot_reset').addEventListener('click', async () => {
        const { Popup } = SillyTavern.getContext();
        const ok = Popup?.show?.confirm ? await Popup.show.confirm('DicePlot', '지침, 템플릿, 문구를 모두 기본값으로 되돌릴까요?') : confirm('기본값으로 되돌릴까요?');
        if (!ok) return;
        const s = getSettings();
        for (const key of ['instruction', 'resultTemplate', 'categoryDesc', 'tierText', 'sideText']) {
            s[key] = structuredClone(defaultSettings[key]);
        }
        SillyTavern.getContext().saveSettingsDebounced();
        syncSettingsUI();
    });
}

function onSettingChange(event) {
    const el = event.target;
    const path = el?.dataset?.dpPath;
    if (!path) return;
    let value;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.type === 'number') value = Number(el.value) || 0;
    else value = el.value;
    setPath(getSettings(), path, value);
    SillyTavern.getContext().saveSettingsDebounced();
    if (['enabled', 'showBadges', 'hideTags'].includes(path)) renderAllBadges();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

(function init() {
    const { eventSource, eventTypes, event_types } = SillyTavern.getContext();
    const ev = eventTypes ?? event_types;

    getSettings();
    installFormatterHook();
    createSettingsUI();
    registerCommands();

    const rerender = () => renderAllBadges();
    for (const name of [
        'CHARACTER_MESSAGE_RENDERED',
        'USER_MESSAGE_RENDERED',
        'MESSAGE_UPDATED',
        'MESSAGE_EDITED',
        'MESSAGE_SWIPED',
        'MESSAGE_DELETED',
        'MORE_MESSAGES_LOADED',
        'CHAT_CHANGED',
    ]) {
        if (ev[name]) eventSource.on(ev[name], rerender);
    }

    // Prompts are rebuilt by the interceptor on every generation; keep them empty otherwise
    for (const name of ['GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_CHANGED']) {
        if (ev[name]) eventSource.on(ev[name], clearPrompts);
    }

    console.log(`[${MODULE}] loaded`);
})();
