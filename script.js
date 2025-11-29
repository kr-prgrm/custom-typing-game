// script.js

// --- グローバル変数 ---
let words = []; 
let romajiRules = {}; 
let currentWordIndex = 0;
let currentKanji = '';
let currentKana = ''; // 現在のお題のひらがな
let currentRomajiOptions = []; // 現在のお題に対する可能なローマ字入力のリスト
let shortestRomajiOptions = []; // 現在のお題に対する最短のローマ字入力のリスト
let currentRomaji = ''; // 現在選択されている（表示に使う）ローマ字
let typedRomaji = ''; // ユーザーが入力したローマ字の状態を保持する変数
let score = 0;
let missCount = 0;
let gameActive = false;
const maxGameTime = 60; // ゲーム時間 (秒)
let timeLeft = maxGameTime;
let timerInterval;
let totalKeystrokes = 0;
let totalCharacters = 0;
let gameStartTimestamp = null;

let errorSound = new Audio('sounds/error.mp3'); 
let keyPressSound = new Audio('sounds/key-press.mp3'); 

/**
 * カタカナをひらがなに正規化するヘルパー
 * @param {string} text
 * @returns {string}
 */
const toHiragana = (text = '') => {
    return text.replace(/[ァ-ヿ]/g, (match) => {
        return String.fromCharCode(match.charCodeAt(0) - 0x60);
    });
};

/**
 * 全角英数字・記号を半角に正規化するヘルパー
 * @param {string} ch
 * @returns {string}
 */
const toHalfWidthAscii = (ch = '') => {
    if (!ch) return ch;
    const code = ch.charCodeAt(0);
    // 全角スペース
    if (code === 0x3000) {
        return ' ';
    }
    // 全角の ! 〜 ~ (0xFF01-0xFF5E) を半角に
    if (code >= 0xFF01 && code <= 0xFF5E) {
        return String.fromCharCode(code - 0xFEE0);
    }
    return ch;
};

/**
 * 配列の中から「最短」のローマ字オプションを返す。
 * prefix が指定されていれば、その prefix で始まる候補の中から選ぶ。
 * @param {string[]} options
 * @param {string} [prefix]
 * @returns {string}
 */
const getShortestOption = (options = [], prefix = '') => {
    if (!options.length) {
        return '';
    }
    const filtered = prefix ? options.filter(option => option.startsWith(prefix)) : options;
    const targetList = filtered.length ? filtered : options;
    return targetList.reduce((shortest, candidate) => {
        if (!shortest || candidate.length < shortest.length) {
            return candidate;
        }
        return shortest;
    }, '');
};

/**
 * 打鍵系の統計表示を更新する
 */
const getTypingSpeedValue = () => {
    if (!gameStartTimestamp) {
        return '0.00';
    }
    const elapsedMs = Date.now() - gameStartTimestamp;
    if (elapsedMs <= 0) {
        return '0.00';
    }
    const elapsedSec = elapsedMs / 1000;
    return (totalKeystrokes / elapsedSec).toFixed(2);
};

const getAccuracyValue = () => {
    if (totalKeystrokes === 0) {
        return '100.0';
    }
    const correctStrokes = totalKeystrokes - missCount;
    const accuracy = (correctStrokes / totalKeystrokes) * 100;
    return accuracy.toFixed(1);
};

const updateTypingStatsDisplay = () => {
    if (keystrokesDisplay) {
        keystrokesDisplay.textContent = totalKeystrokes;
    }
    if (charactersDisplay) {
        charactersDisplay.textContent = totalCharacters;
    }
    if (typingSpeedDisplay) {
        typingSpeedDisplay.textContent = getTypingSpeedValue();
    }
    if (accuracyDisplay) {
        accuracyDisplay.textContent = getAccuracyValue();
    }
};

// ファイルロードの状態を追跡する変数
let romajiLoaded = false;
let wordsLoaded = false;
const DEFAULT_ROMAJI_FILE = 'data/standard-romaji.txt';
const DEFAULT_WORDS_FILE = 'data/question-words.txt';
const STORAGE_KEYS = {
    romaji: 'typingGame_localRomajiRules',
    words: 'typingGame_localWords'
};

// --- DOM要素 ---
// HTML側の最新構造に合わせて要素を取得
const wordsFile = document.getElementById('wordsFile');
const romajiFile = document.getElementById('romajiFile');
const targetKanji = document.getElementById('targetKanji');
const targetKana = document.getElementById('targetKana');
const targetRomaji = document.getElementById('targetRomaji');
const scoreDisplay = document.getElementById('score');
const missDisplay = document.getElementById('miss');
const timeLeftDisplay = document.getElementById('time-left-display');
const keystrokesDisplay = document.getElementById('keystrokes');
const charactersDisplay = document.getElementById('characters');
const typingSpeedDisplay = document.getElementById('typingSpeed');
const accuracyDisplay = document.getElementById('accuracy');
const finalAccuracy = document.getElementById('finalAccuracy');
const romajiFileName = document.getElementById('romajiFileName');
const wordsFileName = document.getElementById('wordsFileName');
const resultModal = document.getElementById('resultModal');
const finalMiss = document.getElementById('finalMiss');
const restartButton = document.getElementById('restartButton');
const quitButton = document.getElementById('quitButton');
const finalKeystrokes = document.getElementById('finalKeystrokes');
const finalCharacters = document.getElementById('finalCharacters');
const finalTypingSpeed = document.getElementById('finalTypingSpeed');
const resetRomajiButton = document.getElementById('resetRomajiButton');
const resetWordsButton = document.getElementById('resetWordsButton');
const showResultButton = document.getElementById('showResultButton');

// --- ファイル読み込み処理 ---

/**
 * ファイルの内容を読み込む
 * @param {File} file - 読み込むファイルオブジェクト
 * @returns {Promise<string>} ファイル内容の文字列
 */
const readFileContent = (file) => {
    console.log('readFileContent: Reading file ->', file.name);
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('ファイルの読み込み中にエラーが発生しました。'));
        reader.readAsText(file);
    });
};

const saveToLocalStorage = (key, value) => {
    try {
        console.log(`saveToLocalStorage: Saving data to localStorage with key: ${key}`);
        localStorage.setItem(key, value);
    } catch (error) {
        console.warn(`ローカル保存に失敗しました (${key})`, error);
    }
};

const loadFromLocalStorage = (key) => {
    try {
        const data = localStorage.getItem(key);
        console.log(`loadFromLocalStorage: Loading data from localStorage with key: ${key}`, data ? 'Data found' : 'No data');
        return data;
    } catch (error) {
        console.warn(`ローカルデータの取得に失敗しました (${key})`, error);
        return null;
    }
};

const ROMAJI_LABEL_DEFAULT = '未選択（デフォルトを使用）';
const WORDS_LABEL_DEFAULT = '未選択（デフォルトを使用）';

const setRomajiSourceLabel = (label = ROMAJI_LABEL_DEFAULT) => {
    if (romajiFileName) {
        romajiFileName.textContent = label;
    }
};

const setWordsSourceLabel = (label = WORDS_LABEL_DEFAULT) => {
    if (wordsFileName) {
        wordsFileName.textContent = label;
    }
};

setRomajiSourceLabel();
setWordsSourceLabel();

const parseWordsContent = (content = '') => {
    console.log('parseWordsContent: Parsing words content.');
    const blocks = content.split(/\r?\n\s*\r?\n/);
    const parsed = [];
    blocks.forEach(block => {
        const lines = block.trim().split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
        if (lines.length >= 2) {
            parsed.push({ kanji: lines[0], kana: lines[1] });
        }
    });
    console.log('parseWordsContent: Parsed words ->', parsed.length, 'words found.');
    return parsed;
};

const applyWordsData = (parsedWords = [], sourceLabel = WORDS_LABEL_DEFAULT) => {
    console.log('applyWordsData: Applying words data. Source ->', sourceLabel);
    words = parsedWords;
    if (words.length > 0) {
        wordsLoaded = true;
        words.sort(() => Math.random() - 0.5); // 問題が尽きたらシャッフル
        setWordsSourceLabel(sourceLabel || WORDS_LABEL_DEFAULT);
        console.log(`${sourceLabel || '問題ファイル'} を読み込みました。問題数: ${words.length}`);
        targetRomaji.textContent = '準備ができたら **Space** または **Enter** キーを押して開始してください。';
    } else {
        wordsLoaded = false;
        setWordsSourceLabel('読み込みに失敗しました');
        targetKanji.textContent = '問題ファイルの形式が不正なため、問題が読み込めませんでした。';
        targetKana.textContent = '';
        targetRomaji.textContent = '';
    }
    checkReadyToStart();
};

/**
 * 問題ファイルを読み込み、words配列に格納する
 */
const loadWords = async (event) => {
    console.log('loadWords: Words file input changed.');
    const file = event.target.files[0];
    if (!file) return;

    try {
        const content = await readFileContent(file);
        const parsed = parseWordsContent(content);
        applyWordsData(parsed, file.name);
        saveToLocalStorage(STORAGE_KEYS.words, content);
    } catch (error) {
        console.error('問題ファイルの読み込みエラー:', error);
        targetKanji.textContent = '問題ファイルの読み込み中にエラーが発生しました。';
        wordsLoaded = false;
        setWordsSourceLabel('読み込みに失敗しました');
        checkReadyToStart();
    }
};

/**
 * ローマ字ルールファイルを読み込み、romajiRulesオブジェクトに格納する
 */
const loadRomajiRules = async (e) => {
    console.log('loadRomajiRules: Romaji file input changed.');
    try {
        const file = e.target.files[0];
        const content = await readFileContent(file);
        parseRomajiRules(content);
        romajiLoaded = true;
        setRomajiSourceLabel(file.name);
        saveToLocalStorage(STORAGE_KEYS.romaji, content);
        checkReadyToStart();
    } catch (error) {
        console.error('ローマ字ルールファイルの読み込みエラー:', error);
        alert('ローマ字ルールファイルの読み込みに失敗しました。');
        setRomajiSourceLabel('読み込みに失敗しました');
    }
};

const loadDefaultFiles = async () => {
    console.log('loadDefaultFiles: Attempting to load default files.');
    if (!romajiLoaded) {
        try {
            console.log('loadDefaultFiles: Fetching default romaji file.');
            const response = await fetch(DEFAULT_ROMAJI_FILE);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const content = await response.text();
            parseRomajiRules(content);
            romajiLoaded = true;
            setRomajiSourceLabel(`${DEFAULT_ROMAJI_FILE} (デフォルト)`);
            console.log(`デフォルトローマ字ルール (${DEFAULT_ROMAJI_FILE}) を読み込みました。`);
        } catch (error) {
            console.warn('デフォルトローマ字ルールの読み込みに失敗しました。', error);
            if (!romajiLoaded) {
                setRomajiSourceLabel('デフォルト読み込み失敗');
            }
        } finally {
            checkReadyToStart();
        }
    }

    if (!wordsLoaded) {
        try {
            console.log('loadDefaultFiles: Fetching default words file.');
            const response = await fetch(DEFAULT_WORDS_FILE);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const content = await response.text();
            const parsed = parseWordsContent(content);
            applyWordsData(parsed, `${DEFAULT_WORDS_FILE} (デフォルト)`);
        } catch (error) {
            console.warn('デフォルト問題ファイルの読み込みに失敗しました。', error);
            if (!wordsLoaded) {
                setWordsSourceLabel('デフォルト読み込み失敗');
            }
        }
    }
};

const resetRomajiToDefault = async () => {
    console.log('resetRomajiToDefault: Resetting romaji rules to default.');
    try {
        const response = await fetch(DEFAULT_ROMAJI_FILE);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const content = await response.text();
        parseRomajiRules(content);
        romajiLoaded = true;
        saveToLocalStorage(STORAGE_KEYS.romaji, content);
        setRomajiSourceLabel(`${DEFAULT_ROMAJI_FILE} (デフォルト)`);
        if (romajiFile) {
            romajiFile.value = '';
        }
        checkReadyToStart();
    } catch (error) {
        console.error('デフォルトローマ字ルールの再読み込みに失敗しました。', error);
        alert('デフォルトのローマ字ルールを読み込めませんでした。');
    }
};

const resetWordsToDefault = async () => {
    console.log('resetWordsToDefault: Resetting words to default.');
    try {
        const response = await fetch(DEFAULT_WORDS_FILE);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const content = await response.text();
        const parsed = parseWordsContent(content);
        applyWordsData(parsed, `${DEFAULT_WORDS_FILE} (デフォルト)`);
        saveToLocalStorage(STORAGE_KEYS.words, content);
        if (wordsFile) {
            wordsFile.value = '';
        }
    } catch (error) {
        console.error('デフォルト問題ファイルの再読み込みに失敗しました。', error);
        alert('デフォルトの問題ファイルを読み込めませんでした。');
    }
};

const loadStoredFiles = () => {
    console.log('loadStoredFiles: Attempting to load from localStorage.');
    const storedRomaji = loadFromLocalStorage(STORAGE_KEYS.romaji);
    if (storedRomaji && !romajiLoaded) {
        parseRomajiRules(storedRomaji);
        romajiLoaded = true;
        setRomajiSourceLabel('前回のローマ字ルール（ローカル保存）');
        console.log('ローカル保存済みのローマ字ルールを復元しました。');
    }

    const storedWords = loadFromLocalStorage(STORAGE_KEYS.words);
    if (storedWords && !wordsLoaded) {
        const parsed = parseWordsContent(storedWords);
        applyWordsData(parsed, '前回の問題ファイル（ローカル保存）');
    }
};

/**
 * あるローマ字が別の定義の接頭辞になる場合、その後続文字列を記録しておく。
 * これにより「n」「l」など他の定義の先頭と被るキーを、後続の入力内容で制御できる。
 * @param {{romaji:string}[]} entries
 */
const attachBlockedPrefixes = (entries) => {
    console.log('attachBlockedPrefixes: Attaching blocked prefixes.');
    const prefixMap = new Map();

    entries.forEach(({ romaji }) => {
        for (let i = 1; i <= romaji.length; i++) {
            const prefix = romaji.slice(0, i);
            if (!prefixMap.has(prefix)) {
                prefixMap.set(prefix, new Set());
            }
            prefixMap.get(prefix).add(romaji);
        }
    });

    entries.forEach(entry => {
        const candidates = prefixMap.get(entry.romaji) || new Set();
        const blocked = new Set();
        candidates.forEach(candidate => {
            if (candidate.length > entry.romaji.length && candidate.startsWith(entry.romaji)) {
                const remainder = candidate.slice(entry.romaji.length);
                if (remainder) {
                    blocked.add(remainder);
                }
            }
        });
        entry.blockedPrefixes = Array.from(blocked).sort((a, b) => {
            if (a.length !== b.length) {
                return a.length - b.length;
            }
            return a.localeCompare(b);
        });
    });
};

/**
 * ローマ字ルールファイルをパースする
 * @param {string} content - ファイル内容
 */
const parseRomajiRules = (content) => {
    console.log('parseRomajiRules: Parsing romaji rules.');
    romajiRules = {};
    const lines = content.split(/\r?\n/);
    const ruleEntries = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
            return;
        }

        const parts = trimmed.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            const romaji = parts[0].toLowerCase();
            const kana = toHiragana(parts[1]);
            const nextTrigger = parts[2] ? parts[2].toLowerCase() : null;
            ruleEntries.push({ romaji, kana, nextTrigger });
        }
    });

    attachBlockedPrefixes(ruleEntries);

    // ひらがなの長いルールを優先的に評価できるように整列
    ruleEntries.sort((a, b) => {
        if (b.kana.length !== a.kana.length) {
            return b.kana.length - a.kana.length;
        }
        return b.romaji.length - a.romaji.length;
    });

    ruleEntries.forEach(({ romaji, kana, nextTrigger, blockedPrefixes }) => {
        if (!romajiRules[kana]) {
            romajiRules[kana] = [];
        }
        const exists = romajiRules[kana].some(
            (rule) => rule.romaji === romaji && rule.nextTrigger === nextTrigger
        );
        if (!exists) {
            romajiRules[kana].push({ romaji, nextTrigger, blockedPrefixes });
        }
    });
    console.log('parseRomajiRules: Parsed romaji rules ->', romajiRules);
};

// --- ローマ字変換ロジック ---

/**
 * ひらがな/カタカナの文字列を、ローマ字テーブルのルールに従って展開する。
 * テーブル側で定義された「後続条件(nextTrigger)付きルール」もここで吸収する。
 * @param {string} kanaWord - 変換するひらがなの文字列
 * @returns {string[]} 可能なローマ字入力のリスト
 */
const kanaToRomaji = (kanaWord) => {
    console.log(`kanaToRomaji: Converting "${kanaWord}" to romaji.`);
    const hiraWord = toHiragana(kanaWord);
    if (!hiraWord) {
        return [];
    }

    const kanaKeys = Object.keys(romajiRules);
    if (kanaKeys.length === 0) {
        return [hiraWord];
    }

    const keyLengths = [...new Set(kanaKeys.map(key => key.length))].sort((a, b) => b - a);
    const memo = new Map();

    const dfs = (index) => {
        if (index >= hiraWord.length) {
            return [''];
        }
        if (memo.has(index)) {
            return memo.get(index);
        }

        const results = new Set();
        let matched = false;

        for (const len of keyLengths) {
            if (index + len > hiraWord.length) {
                continue;
            }
            const chunk = hiraWord.slice(index, index + len);
            const rules = romajiRules[chunk];
            if (!rules) {
                continue;
            }

            matched = true;
            const suffixList = dfs(index + len);

            rules.forEach(rule => {
                const blocked = rule.blockedPrefixes || [];
                suffixList.forEach(suffix => {
                    if (rule.nextTrigger && !suffix.startsWith(rule.nextTrigger)) {
                        return;
                    }
                    const violatesBlock = blocked.some(prefix => suffix.startsWith(prefix));
                    if (violatesBlock) {
                        return;
                    }

                    if (rule.nextTrigger) {
                        const trimLength = Math.max(rule.romaji.length - rule.nextTrigger.length, 0);
                        const prefix = rule.romaji.slice(0, trimLength);
                        results.add(prefix + suffix);
                    } else {
                        results.add(rule.romaji + suffix);
                    }
                });
            });
        }

        if (!matched) {
            const suffixList = dfs(index + 1);
            const currentChar = hiraWord[index];
            suffixList.forEach(suffix => {
                results.add(currentChar + suffix);
            });
        }

        const uniqueResults = Array.from(results);
        memo.set(index, uniqueResults);
        return uniqueResults;
    };

    const romajiList = dfs(0);
    console.log(`kanaToRomaji: Conversion result for "${kanaWord}" ->`, romajiList);
    return [...new Set(romajiList)];
};

/**
 * 互換用のラッパー関数。
 * 以前のコードで使用していた `kanaToRomajiOptions(kana, romajiRules)` 呼び出しに対応するため、
 * 現在の `kanaToRomaji` をそのまま呼び出すだけの関数として定義しておく。
 * @param {string} kanaWord - 変換するひらがなの文字列
 * @param {Object} rules - ローマ字ルール（現在はグローバル変数 `romajiRules` を使用するため未使用）
 * @returns {string[]} 可能なローマ字入力のリスト
 */
const kanaToRomajiOptions = (kanaWord, rules) => {
    // 将来的に `rules` を引数から受け取る設計にしたい場合は、
    // この関数内で `kanaToRomaji` の実装を調整する。
    return kanaToRomaji(kanaWord);
};

/**
 * 現在の入力状態に基づいて、表示用のローマ字HTML文字列を生成する
 * @param {string} targetRomaji - ターゲットとなるローマ字
 * @param {string} typedRomaji - ユーザーの入力済みローマ字
 * @returns {string} 色分けされたHTML文字列
 */
const getRomajiDisplay = (targetRomaji, typedRomaji) => {
    let html = '';
    let foundFirstRemaining = false;

    for (let i = 0; i < targetRomaji.length; i++) {
        const char = targetRomaji[i];
        
        if (i < typedRomaji.length) {
            // 入力済みの部分
            if (char === typedRomaji[i]) {
                html += `<span class="typed-correct">${char}</span>`;
            } else {
                html += `<span class="typed-miss">${char}</span>`;
            }
        } else {
            // 未入力の部分
            if (!foundFirstRemaining) {
                html += `<span class="typed-remaining current-char">${char}</span>`;
                foundFirstRemaining = true;
            } else {
                html += `<span class="typed-remaining">${char}</span>`;
            }
        }
    }
    return html;
};

// --- ゲーム制御ロジック ---

const updateScroll = () => {
    if (!targetRomaji || !targetRomaji.parentElement) return;

    const container = targetRomaji.parentElement;
    const activeChar = targetRomaji.querySelector('.current-char');

    // コンテナが実際にオーバーフローしているか確認
    if (targetRomaji.scrollWidth <= container.clientWidth) {
        // オーバーフローしていないならスクロールは不要
        targetRomaji.style.transform = 'translateX(0)';
        return;
    }

    if (activeChar) {
        const containerWidth = container.clientWidth;
        const charLeft = activeChar.offsetLeft;
        const charWidth = activeChar.offsetWidth;

        // スクロール位置を計算して、アクティブな文字がコンテナの中央あたりに来るように調整
        // ただし、スクロール位置が左端や右端を超えないようにする
        let scrollOffset = charLeft - (containerWidth / 2) + (charWidth / 2);

        // スクロール量が負にならないように（左に余白ができないように）
        scrollOffset = Math.max(0, scrollOffset);

        // スクロール量が最大スクロール可能範囲を超えないように
        const maxScroll = targetRomaji.scrollWidth - containerWidth;
        scrollOffset = Math.min(scrollOffset, maxScroll);

        targetRomaji.style.transform = `translateX(-${scrollOffset}px)`;
    }
};

/**
 * 問題セットの準備ができているか確認し、UIを更新する (修正)
 */
const checkReadyToStart = () => {
    console.log(`checkReadyToStart: Checking readiness. romajiLoaded: ${romajiLoaded}, wordsLoaded: ${wordsLoaded}, word count: ${words.length}`);
    // 【前のターンで指摘された TypeError 対策】要素の存在チェックは不要だが、
    // 関数が実行される時点で要素は存在することを想定。
    // HTMLの初期表示メッセージを利用するが、ファイルロード状態に応じて更新する。
    if (romajiLoaded && wordsLoaded && words.length > 0) {
        targetKanji.textContent = 'SpaceまたはEnterを押して開始';
    } else {
        // デフォルト状態（まだファイルが読めていないなど）の文言は
        // index.html 側の初期テキストに任せる
    }
    // 常にかなとローマ字行は空にしておく
    targetKana.textContent = '';
    targetRomaji.textContent = '';
};

/**
 * 次の単語を設定する
 */
const setNextWord = () => {
    console.log('setNextWord: Setting next word.');
    if (words.length === 0) {
        endGame();
        return;
    }

    // 問題を循環させる
    if (currentWordIndex >= words.length) {
        currentWordIndex = 0;
        words.sort(() => Math.random() - 0.5); // 問題が尽きたらシャッフル
        console.log('setNextWord: All words completed. Shuffling words.');
    }

    const nextWord = words[currentWordIndex];
    currentKanji = nextWord.kanji; // 漢字をセット
    currentKana = nextWord.kana;   // ひらがなをセット
    console.log(`setNextWord: New word: ${currentKanji} (${currentKana})`);


    currentWordIndex++;
    typedRomaji = ''; // 入力状態をリセット

    // ひらがなから可能なローマ字入力を全て生成
    currentRomajiOptions = kanaToRomajiOptions(currentKana, romajiRules);
    if (currentRomajiOptions.length === 0) {
        currentRomajiOptions = [currentKana];
    }
    console.log('setNextWord: Romaji options ->', currentRomajiOptions);
    
    // 最短のローマ字オプションを全て抽出
    let minLength = Infinity;
    if (currentRomajiOptions.length > 0) {
        minLength = Math.min(...currentRomajiOptions.map(option => option.length));
    }
    shortestRomajiOptions = currentRomajiOptions.filter(option => option.length === minLength);
    console.log('setNextWord: Shortest romaji options ->', shortestRomajiOptions);


    // 最も短いオプションを初期表示として選択
    currentRomaji = getShortestOption(currentRomajiOptions);
    console.log('setNextWord: Initial display romaji ->', currentRomaji);

    // 画面表示を更新
    targetKanji.textContent = currentKanji;
    targetKana.textContent = currentKana;
    targetRomaji.innerHTML = getRomajiDisplay(currentRomaji, typedRomaji);
    
    // スクロール位置をリセット・更新
    targetRomaji.style.transform = 'translateX(0)';
    updateScroll();
};

/**
 * ゲーム開始
 */
const startGame = () => {
    console.log('startGame: Starting game.');
    if (!romajiLoaded || !wordsLoaded || words.length === 0) {
        alert('ローマ字ルールファイルと問題ファイルをインポートしてください。');
        console.warn('startGame: Start conditions not met.');
        return;
    }

    // ゲーム状態のリセット
    score = 0;
    missCount = 0;
    timeLeft = maxGameTime;
    currentWordIndex = 0;
    gameActive = true;
    totalKeystrokes = 0;
    totalCharacters = 0;
    gameStartTimestamp = Date.now();
    console.log('startGame: Game state reset.');
    
    if (scoreDisplay) {
        scoreDisplay.textContent = score;
    }
    missDisplay.textContent = missCount;
    updateTypingStatsDisplay();
    resultModal.style.display = 'none';
    if (showResultButton) {
        showResultButton.style.display = 'none';
    }

    // 残り時間表示の初期化
    if (timeLeftDisplay) {
        timeLeftDisplay.textContent = timeLeft;
        timeLeftDisplay.parentElement.classList.remove('low-time');
    }

    // 問題セット
    // シャッフルしたい場合はここで `words` をシャッフルするロジックを追加

    setNextWord();
    
    // タイマー開始
    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
    console.log('startGame: Timer started.');
};

/**
 * ゲームを終了する
 */
const endGame = () => {
    console.log('endGame: Ending game.');
    gameActive = false;
    clearInterval(timerInterval);
    console.log('endGame: Timer stopped.');

    // 残り時間表示の終了表示
    if (timeLeftDisplay) {
        timeLeftDisplay.textContent = '--';
        timeLeftDisplay.parentElement.classList.remove('low-time');
    }
    
    // 最終結果を表示
    finalMiss.textContent = missCount;
    if (finalKeystrokes) {
        finalKeystrokes.textContent = totalKeystrokes;
    }
    if (finalCharacters) {
        finalCharacters.textContent = totalCharacters;
    }
    if (finalTypingSpeed) {
        finalTypingSpeed.textContent = getTypingSpeedValue();
    }
    if (finalAccuracy) {
        finalAccuracy.textContent = getAccuracyValue();
    }
    resultModal.style.display = 'block';
    console.log(`endGame: Final score - Misses: ${missCount}, Keystrokes: ${totalKeystrokes}`);


    targetKanji.textContent = '終了！';
    targetKana.textContent = '「もう一度遊ぶ」ボタンを押すか、SpaceまたはEnterを押して再開してください。';
    targetRomaji.textContent = '';
};


/**
 * タイマーを更新する
 */
const updateTimer = () => {
    timeLeft--;
    if (timeLeftDisplay) {
        timeLeftDisplay.textContent = timeLeft;
        if (timeLeft <= 10) {
            timeLeftDisplay.parentElement.classList.add('low-time');
        } else {
            timeLeftDisplay.parentElement.classList.remove('low-time');
        }
    }

    if (timeLeft <= 0) {
        console.log('updateTimer: Time is up.');
        endGame();
    }
};

/**
 * キーボード入力イベントのハンドラ
 * @param {KeyboardEvent} e - キーボードイベントオブジェクト
 */
const handleKeydownTyping = (e) => {
    // IME などで全角になった英数字記号も受け付けられるよう、まず半角に正規化する
    const key = toHalfWidthAscii(e.key).toLowerCase();
    
    if (gameActive) {
        if (e.key === 'Escape') {
            e.preventDefault();
            console.log('handleKeydownTyping: Escape key pressed. Ending game.');
            endGame();
            return;
        }
        // ゲーム中のタイピング処理
        // 半角に正規化された 1 文字の ASCII 印字可能文字のみを処理
        // （ローマ字テーブル側で使用される記号にも広く対応）
        if (key.length === 1 && /[ -~]/.test(key)) {
            e.preventDefault(); // ブラウザのデフォルト動作を抑止（例：Spaceでページスクロール）
            totalKeystrokes++;
            
            const nextTyped = typedRomaji + key;
            console.log(`handleKeydownTyping: Key pressed: "${key}", Current buffer: "${typedRomaji}", Next buffer: "${nextTyped}"`);
            let foundMatch = false;
            let fullMatch = false;
            
            // ★変更点: shortestRomajiOptions のみをチェック対象にする
            // 可能な「最短」ローマ字入力のいずれかの先頭部分と一致するかチェック
            for (const option of shortestRomajiOptions) {
                if (option.startsWith(nextTyped)) {
                    foundMatch = true;
                    if (option === nextTyped) {
                        fullMatch = true;
                        break; // 完全一致が見つかればチェック終了
                    }
                }
            }

            if (foundMatch) {
                // 入力が正しい（最短経路のいずれかに部分一致）
                console.log('handleKeydownTyping: Match found in shortest options.');
                typedRomaji = nextTyped;
                totalCharacters++;
                
                keyPressSound.currentTime = 0; 
                keyPressSound.play().catch(e => console.error("Error playing sound:", e)); 

                // 完全一致した場合、次の単語へ
                if (fullMatch) {
                    console.log('handleKeydownTyping: Full shortest match found. Advancing to next word.');
                    score++;
                    if (scoreDisplay) {
                        scoreDisplay.textContent = score;
                    }
                    setNextWord();
                } else {
                    // 部分一致の場合、表示用のローマ字を最短候補の中から更新
                    const shortestMatch = getShortestOption(shortestRomajiOptions, typedRomaji);
                    if (shortestMatch) {
                        currentRomaji = shortestMatch;
                    }
                    targetRomaji.innerHTML = getRomajiDisplay(currentRomaji, typedRomaji);
                    updateScroll(); // スクロール更新
                    console.log('handleKeydownTyping: Partial shortest match. UI updated.');
                }
            } else {
                // 入力が間違っている場合
                console.log('handleKeydownTyping: Miss. No match found in shortest options.');
                missCount++;
                missDisplay.textContent = missCount;
                // ミスした文字は受け付けない
                targetRomaji.innerHTML = getRomajiDisplay(currentRomaji, typedRomaji);
                updateScroll(); // スクロール更新
                
                errorSound.currentTime = 0; 
                errorSound.play().catch(e => console.error("Error playing sound:", e)); 

                targetRomaji.classList.add('error-flash'); 
                setTimeout(() => { 
                    targetRomaji.classList.remove('error-flash'); 
                }, 200); 
            }
            updateTypingStatsDisplay(); // 統計情報を更新
        }
    } else {
        // ゲーム開始前の処理（スペース/エンターキー）
        if ((e.key === ' ' || e.key === 'Enter') && romajiLoaded && wordsLoaded && words.length > 0) {
            e.preventDefault();
            console.log('handleKeydownTyping: Start game trigger detected.');
            startGame();
        }
    }
};


// --- 初期イベントリスナー ---
// ファイルインポートのイベントリスナー
wordsFile.addEventListener('change', loadWords);
romajiFile.addEventListener('change', loadRomajiRules);

// リスタートボタンのイベントリスナー（モーダル内のボタン）
restartButton.addEventListener('click', () => {
    console.log('Restart button clicked.');
    resultModal.style.display = 'none';
    if (showResultButton) {
        showResultButton.style.display = 'none';
    }
    gameActive = false;
    typedRomaji = '';
    currentRomaji = '';
    targetKanji.textContent = '';
    totalKeystrokes = 0;
    totalCharacters = 0;
    gameStartTimestamp = null;
    updateTypingStatsDisplay();
    checkReadyToStart();
});

quitButton.addEventListener('click', () => {
    console.log('Quit button clicked.');
    resultModal.style.display = 'none';
    if (showResultButton) {
        showResultButton.style.display = 'block';
    }
});

if (showResultButton) {
    showResultButton.addEventListener('click', () => {
        console.log('Show Result button clicked.');
        resultModal.style.display = 'block';
    });
}

if (resetRomajiButton) {
    resetRomajiButton.addEventListener('click', (e) => {
        e.preventDefault();
        resetRomajiToDefault();
    });
}

if (resetWordsButton) {
    resetWordsButton.addEventListener('click', (e) => {
        e.preventDefault();
        resetWordsToDefault();
    });
}

// document全体にキーダウンイベントリスナーを設定し、ゲームの状態に応じて処理を分岐
// これにより、入力フィールドにフォーカスがなくても文字入力やゲーム開始が可能になる
document.addEventListener('keydown', handleKeydownTyping);

// 初期化処理のログ
console.log('Initializing script...');
checkReadyToStart();
updateTypingStatsDisplay();
loadStoredFiles();
loadDefaultFiles();
console.log('Initialization complete.');
