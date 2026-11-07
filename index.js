// DicePlot — SillyTavern extension
// The AI marks uncertain challenges with a <check/> tag at the end of its reply.
// Before the next generation, this extension rolls 2d20 in plain JS (no extra AI call),
// pre-computes the outcome for every approach category, and injects the result
// at the very bottom of the context. The AI only classifies the user's approach.

import { LEGACY_INSTRUCTIONS, LEGACY_RESULT_TEMPLATES, LEGACY_CATEGORY_DESC, LEGACY_TIER_TEXT } from './legacy-defaults.js';

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
    { key: 'overwhelming', label: '압도적 우위', promptLabel: 'Overwhelming advantage', aliases: ['overwhelming', 'overwhelmingadvantage', '압도적우위', '압도'] },
    { key: 'advantage', label: '우위', promptLabel: 'Advantage', aliases: ['advantage'] },
    { key: 'normal', label: '평범', promptLabel: 'Normal', aliases: ['normal', '보통'] },
    { key: 'disadvantage', label: '불리', promptLabel: 'Disadvantage', aliases: ['disadvantage'] },
    { key: 'irrelevant', label: '무관', promptLabel: 'Irrelevant', aliases: ['irrelevant', '해당없음'] },
];

const TIER_LABELS = {
    crit: '대성공',
    success: '성공',
    partial: '부분 성공',
    fail: '실패',
    fumble: '대실패',
};

const DEFAULT_INSTRUCTION = `[Dice Check Tag Rules]
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
- In combat, not on every attack; only at decisive moments that turn the fight`;

const DEFAULT_RESULT_TEMPLATE = `[Dice Check — follow this in the current response]
Check: {subject} — {action} / DC {dc} / On failure: {stake}
Dice (2d20): {d1}, {d2}

Classify {subject}'s action this turn into exactly one category below and follow its outcome as written.
Only facts already established in the character card, persona, or earlier conversation count as grounds. Abilities or resources newly claimed or invented this turn do not count. If unsure, choose Normal.
{outcomes}

Do not change or soften the outcome. Narrate it in a way true to the characters. Do not mention dice rolls or DC numbers in the story.
At the very end of the response, add <judged as="category" why="the established fact used as grounds"/> on its own line.`;

const DEFAULT_CATEGORY_DESC = {
    overwhelming: 'established facts make this practically no obstacle',
    advantage: 'directly uses established resources, abilities, or circumstances',
    normal: 'no particular edge or handicap',
    disadvantage: 'established as unskilled at this, underprepared, or a reckless approach',
    irrelevant: 'does something unrelated to this check',
};

const DEFAULT_TIER_TEXT = {
    crit: 'Critical success. Succeeds beyond expectations and gains an extra benefit.',
    success: 'Success. Achieves what was intended.',
    partial: 'Partial success. Succeeds, but at a cost or with a new complication.',
    fail: 'Failure. Does not succeed, and the risk comes true: {stake}',
    fumble: 'Critical failure. Fails, and the situation gets significantly worse: {stake}',
};

const IMPERSONATE_NOTE = `[Dice Check pending]
{{user}} faces a check: {action} (on failure: {stake}).
Write only {{user}}'s attempt. Do not narrate whether it succeeds or fails; dice decide that in the next response.`;

const OVERWHELMING_TEXT = 'Automatic success. No roll needed.';
const IRRELEVANT_TEXT = 'Ignore this check and continue naturally.';

const defaultSettings = Object.freeze({
    enabled: true,
    hideTags: true,
    showBadges: true,
    showToast: true,
    rerollOnSwipe: false,
    aiPlaysUser: false,
    partialMargin: 4,
    cooldown: 0,
    instructionPosition: 'chat', // 'chat' | 'prompt'
    instructionDepth: 1,
    instruction: DEFAULT_INSTRUCTION,
    resultTemplate: DEFAULT_RESULT_TEMPLATE,
    categoryDesc: DEFAULT_CATEGORY_DESC,
    tierText: DEFAULT_TIER_TEXT,
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
    if (LEGACY_INSTRUCTIONS.includes(s.instruction)) s.instruction = DEFAULT_INSTRUCTION;
    if (LEGACY_RESULT_TEMPLATES.includes(s.resultTemplate)) s.resultTemplate = DEFAULT_RESULT_TEMPLATE;
    for (const [key, legacy, current] of [['categoryDesc', LEGACY_CATEGORY_DESC, DEFAULT_CATEGORY_DESC], ['tierText', LEGACY_TIER_TEXT, DEFAULT_TIER_TEXT]]) {
        for (const sub of Object.keys(current)) {
            if (legacy.some(l => l[sub] === s[key][sub])) s[key][sub] = current[sub];
        }
    }
    delete s.sideText;
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
        who: String(attrs.who ?? '').toLowerCase() === 'char' ? 'char' : 'user',
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
        const names = [c.label, c.promptLabel].map(n => n.replace(/\s+/g, '').toLowerCase());
        if (names.includes(v) || c.aliases.includes(v)) return c.key;
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
    if (category === 'overwhelming') return { tier: 'success', text: OVERWHELMING_TEXT };
    if (category === 'irrelevant') return { tier: null, text: IRRELEVANT_TEXT };
    const die = dieFor(category, roll.d1, roll.d2);
    const tier = tierOf(die, roll.dc, Number(s.partialMargin) || 0);
    return { tier, die, text: `${die} → ${fill(s.tierText[tier], vars)}` };
}

function buildResultPrompt(roll, s) {
    const lines = CATEGORIES.map(c => {
        const desc = s.categoryDesc[c.key] ? ` (${s.categoryDesc[c.key]})` : '';
        return `- ${c.promptLabel}${desc} → ${describeOutcome(c.key, roll, s).text}`;
    });
    return fill(s.resultTemplate, {
        subject: roll.who === 'char' ? '{{char}}' : '{{user}}',
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

const isVisible = m => m && !m.is_system;

/**
 * The anchor is the message the upcoming reply responds to. Rolls are stored on it,
 * so swipes and continues of the same reply reuse the same dice.
 */
function findAnchorIndex(chat, type) {
    const last = findLastIndex(chat, isVisible);
    if (last < 0) return -1;
    if (type === 'swipe' || type === 'continue') return findLastIndex(chat, isVisible, last - 1);
    return last;
}

/**
 * Finds the <check/> that applies to the reply after the anchor.
 * - Anchor is a user message: the check in the AI message(s) right before it (user or char check).
 * - Anchor is an AI message (generation without user input): only a char check on that message,
 *   or any check when the AI also writes {{user}}'s actions (aiPlaysUser).
 */
function findSourceCheck(chat, anchorIdx, s) {
    const anchor = chat[anchorIdx];
    if (!anchor) return null;
    if (!anchor.is_user) {
        // Without user input only char checks resolve, unless the AI also writes {{user}}'s actions
        const check = parseCheck(anchor.mes);
        const resolvesNow = check?.who === 'char' || (check && s?.aiPlaysUser);
        return resolvesNow ? { index: anchorIdx, ...check } : null;
    }
    for (let i = anchorIdx - 1; i >= 0; i--) {
        const m = chat[i];
        if (!m) continue;
        if (m.is_user) break;
        if (m.is_system) continue;
        // A roll stored here means the checks up to this point were already resolved (e.g. by an empty send)
        if (m.extra?.[MODULE]) break;
        const check = parseCheck(m.mes);
        if (check) return { index: i, ...check };
    }
    return null;
}

/** A user check announced at the end of the chat that no user message has answered yet. */
function findPendingUserCheck(chat) {
    const state = getChatState();
    for (let i = chat.length - 1; i >= 0; i--) {
        const m = chat[i];
        if (!isVisible(m)) continue;
        if (m.is_user || m.extra?.[MODULE]) return null;
        const check = parseCheck(m.mes);
        if (check) return check.who === 'user' && state.cancelled !== i ? check : null;
    }
    return null;
}

/** True if a roll happened within the last `cooldown` user turns before the anchor. */
function isOnCooldown(chat, anchorIdx, cooldown) {
    if (!cooldown || cooldown <= 0) return false;
    let userTurns = 0;
    for (let i = anchorIdx - 1; i >= 0; i--) {
        const m = chat[i];
        if (!isVisible(m)) continue;
        if (m.extra?.[MODULE]) return true;
        if (m.is_user && ++userTurns >= cooldown) break;
    }
    return false;
}

/**
 * Returns the roll that applies to the upcoming generation, rolling new dice if needed.
 */
function resolveRoll(chat, type, s) {
    const anchorIdx = findAnchorIndex(chat, type);
    if (anchorIdx < 0) return null;
    const anchor = chat[anchorIdx];
    const state = getChatState();
    let roll = anchor.extra?.[MODULE] ?? null;

    if (roll) {
        // Keep check info in sync if the user edited the tag; drop the roll if the tag was removed
        if (typeof roll.source === 'number') {
            const check = parseCheck(chat[roll.source]?.mes);
            if (!check) {
                delete anchor.extra[MODULE];
                return null;
            }
            Object.assign(roll, check);
        }
        const isReroll = type === 'swipe' || type === 'regenerate';
        if (s.rerollOnSwipe && isReroll) {
            roll.d1 = rollD20();
            roll.d2 = rollD20();
            return { roll, anchorIdx, fresh: true };
        }
        return { roll, anchorIdx, fresh: false };
    }

    let check = null;
    let source = null;
    if (state.manual) {
        check = state.manual;
        source = 'manual';
        delete state.manual;
        saveChatState();
    } else {
        const found = findSourceCheck(chat, anchorIdx, s);
        if (!found) return null;
        if (state.cancelled === found.index) return null;
        if (isOnCooldown(chat, anchorIdx, Number(s.cooldown))) return null;
        check = found;
        source = found.index;
    }

    roll = {
        who: check.who ?? 'user',
        action: check.action,
        dc: check.dc,
        stake: check.stake,
        d1: rollD20(),
        d2: rollD20(),
        source,
    };
    anchor.extra = anchor.extra ?? {};
    anchor.extra[MODULE] = roll;
    return { roll, anchorIdx, fresh: true };
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
    if (type === 'quiet') return;

    const ctx = SillyTavern.getContext();

    if (type === 'impersonate') {
        // The AI is writing {{user}}'s message: keep tags out and stop it from deciding a pending check
        for (const m of coreChat) if (typeof m?.mes === 'string') m.mes = stripTags(m.mes);
        const pending = findPendingUserCheck(ctx.chat);
        if (pending) {
            ctx.setExtensionPrompt(KEY_RESULT, fill(IMPERSONATE_NOTE, pending), PROMPT_POSITION.IN_CHAT, 0, false, PROMPT_ROLE_SYSTEM);
        }
        return;
    }

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
    const { roll, anchorIdx, fresh } = resolved;

    ctx.setExtensionPrompt(KEY_RESULT, buildResultPrompt(roll, s), PROMPT_POSITION.IN_CHAT, 0, false, PROMPT_ROLE_SYSTEM);

    if (fresh) {
        try { ctx.saveChat?.(); } catch (e) { console.warn(`[${MODULE}] save failed`, e); }
        if (s.showToast) {
            toastr.info(`${subjectLabel(roll)} ${roll.action} · DC ${roll.dc}`, `🎲 d20: ${roll.d1} / ${roll.d2}`, { timeOut: 4000 });
        }
    }
    renderBadge(anchorIdx);
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

function subjectLabel(rollOrCheck) {
    const { name1, name2 } = SillyTavern.getContext();
    return rollOrCheck?.who === 'char' ? (name2 || '캐릭터') : (name1 || '유저');
}

/** The roll a reply used is stored on the message right before it. */
function findRollBefore(chat, idx) {
    const prev = findLastIndex(chat, isVisible, idx - 1);
    return prev >= 0 ? chat[prev].extra?.[MODULE] ?? null : null;
}

function badgeLines(chat, idx) {
    const msg = chat[idx];
    if (!isVisible(msg)) return [];
    const s = getSettings();
    const lines = [];

    if (!msg.is_user) {
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
            lines.push(`🎯 ${cancelled ? '(취소됨) ' : ''}${subjectLabel(check)}의 판정 대기 · ${check.action} · DC ${check.dc} · 실패 시: ${check.stake}`);
        }
    }

    const roll = msg.extra?.[MODULE];
    if (roll) lines.push(`🎲 ${subjectLabel(roll)}의 판정 · ${roll.action} · DC ${roll.dc} · 주사위: ${roll.d1} / ${roll.d2}`);
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
        helpString: '<div>다음 생성에 판정을 강제로 겁니다. 예: <code>/dp-check dc=13 stake="경비에게 발각" 담 넘기</code>, 캐릭터 판정은 <code>who=char</code></div>',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'dc', description: '난이도 (5~25)', typeList: [ARGUMENT_TYPE.NUMBER], isRequired: true }),
            SlashCommandNamedArgument.fromProps({ name: 'stake', description: '실패 시 벌어질 일', typeList: [ARGUMENT_TYPE.STRING] }),
            SlashCommandNamedArgument.fromProps({ name: 'who', description: 'user 또는 char (기본 user)', typeList: [ARGUMENT_TYPE.STRING], enumList: ['user', 'char'] }),
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
                who: String(args.who ?? '').toLowerCase() === 'char' ? 'char' : 'user',
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
            const lastIdx = findLastIndex(chat, isVisible);
            const last = chat[lastIdx];
            if (last && !last.is_user && parseCheck(last.mes) && !last.extra?.[MODULE]) {
                // Check announced but not rolled yet
                state.cancelled = lastIdx;
            } else {
                // Undo the most recent roll (back to the latest user message)
                for (let i = lastIdx; i >= 0; i--) {
                    const m = chat[i];
                    if (!isVisible(m)) continue;
                    const roll = m.extra?.[MODULE];
                    if (roll) {
                        if (typeof roll.source === 'number') state.cancelled = roll.source;
                        delete m.extra[MODULE];
                        SillyTavern.getContext().saveChat?.();
                        break;
                    }
                    if (m.is_user) break;
                }
            }
            saveChatState();
            renderAllBadges();
            toastr.info('판정을 취소했습니다.');
            return '';
        },
    }));
}

// ---------------------------------------------------------------------------
// Wand menu (extensions menu next to the chat input)
// ---------------------------------------------------------------------------

function updateWandButton() {
    const enabled = getSettings().enabled;
    const label = document.getElementById('diceplot_wand_label');
    if (label) label.textContent = `DicePlot: ${enabled ? '켜짐' : '꺼짐'}`;
    document.getElementById('diceplot_wand')?.classList.toggle('diceplot-off', !enabled);
}

function setEnabled(enabled) {
    const s = getSettings();
    s.enabled = enabled;
    if (!enabled) clearPrompts();
    SillyTavern.getContext().saveSettingsDebounced();
    syncSettingsUI();
    updateWandButton();
    renderAllBadges();
}

function createWandButton() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return false;
    if (document.getElementById('diceplot_wand')) return true;
    menu.insertAdjacentHTML('beforeend', `
        <div id="diceplot_wand" class="list-group-item flex-container flexGap5 interactable" tabindex="0" title="DicePlot 켜기/끄기">
            <div class="fa-solid fa-dice-d20 extensionsMenuExtensionButton"></div>
            <span id="diceplot_wand_label"></span>
        </div>`);
    document.getElementById('diceplot_wand').addEventListener('click', () => {
        setEnabled(!getSettings().enabled);
        toastr.info(getSettings().enabled ? '판정을 켰습니다.' : '판정을 껐습니다.', '🎲 DicePlot', { timeOut: 2000 });
    });
    updateWandButton();
    return true;
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
                <label class="checkbox_label" title="AI가 유저 행동까지 직접 쓰는 방식일 때 켜세요. 입력 없이 보내도 유저 판정을 바로 굴립니다."><input type="checkbox" data-dp-path="aiPlaysUser" /><span>AI가 유저 행동도 씀 (입력 없이도 유저 판정 굴림)</span></label>

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
                <small>사용 가능: {subject} {action} {dc} {stake} {d1} {d2} {outcomes}</small>
                <textarea class="text_pole textarea_compact" rows="8" data-dp-path="resultTemplate"></textarea>

                <b>분류 기준</b>
                ${categoryInputs}

                <b>결과 문구</b>
                <small>{stake} 등 사용 가능</small>
                ${tierInputs}

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
        for (const key of ['instruction', 'resultTemplate', 'categoryDesc', 'tierText']) {
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
    if (path === 'enabled') {
        if (!value) clearPrompts();
        updateWandButton();
    }
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
    if (!createWandButton() && ev.APP_READY) eventSource.on(ev.APP_READY, createWandButton);

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
