/* ---------------------------------------------------------------
   JAPANESE RADICALS (部首)
   ---------------------------------------------------------------
   Same structure as src/data/radicals.js, with Japanese forms and
   readings rather than a copy of the Chinese set:

   - Japanese keeps the full forms that simplified Chinese reduced:
     門 not 门, 言 not 讠, 金 not 钅, 車 not 车, 見 not 见, 飠 not 饣.
   - `kana` is the radical's Japanese name (さんずい, きへん...), and
     example readings are kana — the way Japanese materials teach it.
   - Every example and quiz character has that radical as its
     dictionary (Kangxi) radical. 街 and 取 look like they belong to
     彳 and 耳 but do not, so they are left out.
   - 父 is dropped (爸 and 爺 are not useful Japanese) and 糸 thread
     is added: 紙 paper, 線 line and 結 tie are early, common kanji.

   `quizChars` follow the same rule as the Chinese set: only where
   the radical really predicts the meaning. 月 stays empty — in
   Japanese the flesh form even has its own name, にくづき (胸 chest,
   腕 arm), which makes the trap more obvious, not less.
   --------------------------------------------------------------- */

export const radicalCategories = ['Nature', 'People', 'Body', 'Objects', 'Actions'];

const r = (radical, standalone, kana, meaning, burmese, strokes, category, examples, quizChars) => ({
  radical, standalone, kana, meaning, burmese, strokes, category,
  examples: examples.map(([char, k, english]) => ({ char, kana: k, english })),
  quizChars: quizChars.map(([char, k, english]) => ({ char, kana: k, english }))
});

export const radicals = [
  // Nature
  r('氵', '水', 'さんずい', 'water', 'ရေ', 3, 'Nature',
    [['海', 'うみ', 'sea'], ['池', 'いけ', 'pond'], ['洗', 'あらう', 'to wash']],
    [['湖', 'みずうみ', 'lake'], ['涙', 'なみだ', 'tears'], ['汗', 'あせ', 'sweat']]),
  r('木', null, 'きへん', 'tree, wood', 'သစ်ပင်', 4, 'Nature',
    [['林', 'はやし', 'woods'], ['森', 'もり', 'forest'], ['机', 'つくえ', 'desk']],
    [['松', 'まつ', 'pine tree'], ['桜', 'さくら', 'cherry tree'], ['板', 'いた', 'board, plank']]),
  r('火', null, 'ひへん', 'fire', 'မီး', 4, 'Nature',
    [['焼', 'やく', 'to grill, to burn'], ['灯', 'あかり', 'light, lamp'], ['炭', 'すみ', 'charcoal']],
    [['炎', 'ほのお', 'flame'], ['煙', 'けむり', 'smoke'], ['炒', 'いためる', 'to stir-fry']]),
  r('土', null, 'つちへん', 'earth, soil', 'မြေ', 3, 'Nature',
    [['地', 'ち', 'ground, land'], ['坂', 'さか', 'slope'], ['場', 'ば', 'place']],
    [['壁', 'かべ', 'wall'], ['墓', 'はか', 'grave'], ['堀', 'ほり', 'moat']]),
  r('日', null, 'にちへん', 'sun, day', 'နေ', 4, 'Nature',
    [['明', 'あかるい', 'bright'], ['時', 'とき', 'time'], ['早', 'はやい', 'early']],
    [['晩', 'ばん', 'evening'], ['星', 'ほし', 'star'], ['暑', 'あつい', 'hot (weather)']]),
  r('月', null, 'つきへん', 'moon, month', 'လ', 4, 'Nature',
    [['朝', 'あさ', 'morning'], ['期', 'き', 'period'], ['朗', 'ほがらか', 'bright, cheerful']],
    []),
  r('山', null, 'やまへん', 'mountain', 'တောင်', 3, 'Nature',
    [['岩', 'いわ', 'rock'], ['島', 'しま', 'island'], ['峠', 'とうげ', 'mountain pass']],
    [['峰', 'みね', 'peak'], ['崖', 'がけ', 'cliff'], ['岳', 'たけ', 'high mountain']]),
  r('雨', null, 'あめかんむり', 'rain', 'မိုး', 8, 'Nature',
    [['雪', 'ゆき', 'snow'], ['雷', 'かみなり', 'thunder'], ['雲', 'くも', 'cloud']],
    [['霜', 'しも', 'frost'], ['霧', 'きり', 'fog, mist'], ['露', 'つゆ', 'dew']]),
  r('艹', '草', 'くさかんむり', 'grass, plant', 'မြက်', 3, 'Nature',
    [['花', 'はな', 'flower'], ['茶', 'ちゃ', 'tea'], ['葉', 'は', 'leaf']],
    [['薬', 'くすり', 'medicine (from herbs)'], ['芽', 'め', 'sprout, bud'], ['菜', 'な', 'greens, vegetables']]),

  // People
  r('亻', '人', 'にんべん', 'person', 'လူ', 2, 'People',
    [['休', 'やすむ', 'to rest'], ['体', 'からだ', 'body'], ['住', 'すむ', 'to live']],
    [['働', 'はたらく', 'to work'], ['仕', 'つかえる', 'to serve'], ['係', 'かかり', 'person in charge']]),
  r('女', null, 'おんなへん', 'woman', 'အမျိုးသမီး', 3, 'People',
    [['姉', 'あね', 'older sister'], ['妹', 'いもうと', 'younger sister'], ['好', 'すき', 'to like']],
    [['娘', 'むすめ', 'daughter'], ['婦', 'ふ', 'woman, wife'], ['嫁', 'よめ', 'bride']]),
  r('子', null, 'こへん', 'child', 'ကလေး', 3, 'People',
    [['学', 'がく', 'learning'], ['字', 'じ', 'character, letter'], ['孫', 'まご', 'grandchild']],
    [['孤', 'こ', 'orphaned, alone'], ['孝', 'こう', 'devotion to parents']]),

  // Body
  r('口', null, 'くちへん', 'mouth', 'ပါးစပ်', 3, 'Body',
    [['味', 'あじ', 'taste'], ['呼', 'よぶ', 'to call'], ['吸', 'すう', 'to breathe in']],
    [['叫', 'さけぶ', 'to shout'], ['吹', 'ふく', 'to blow'], ['唄', 'うた', 'song']]),
  r('心', null, 'こころ', 'heart, mind', 'နှလုံး', 4, 'Body',
    [['思', 'おもう', 'to think'], ['忙', 'いそがしい', 'busy'], ['悲', 'かなしい', 'sad']],
    [['感', 'かんじる', 'to feel'], ['忘', 'わすれる', 'to forget'], ['怒', 'おこる', 'to get angry']]),
  r('扌', '手', 'てへん', 'hand', 'လက်', 3, 'Body',
    [['持', 'もつ', 'to hold'], ['打', 'うつ', 'to hit'], ['押', 'おす', 'to push']],
    [['投', 'なげる', 'to throw'], ['拾', 'ひろう', 'to pick up'], ['指', 'ゆび', 'finger']]),
  r('目', null, 'めへん', 'eye', 'မျက်လုံး', 5, 'Body',
    [['眼', 'め', 'eye'], ['眠', 'ねむる', 'to sleep'], ['看', 'みる', 'to watch over']],
    [['瞳', 'ひとみ', 'pupil of the eye'], ['眺', 'ながめる', 'to gaze'], ['盲', 'もう', 'blind']]),
  r('足', null, 'あしへん', 'foot', 'ခြေထောက်', 7, 'Body',
    [['路', 'みち', 'road, path'], ['跳', 'とぶ', 'to jump'], ['踊', 'おどる', 'to dance']],
    [['蹴', 'ける', 'to kick'], ['踏', 'ふむ', 'to step on'], ['跡', 'あと', 'footprint, trace']]),
  r('耳', null, 'みみへん', 'ear', 'နား', 6, 'Body',
    [['聞', 'きく', 'to hear'], ['聴', 'きく', 'to listen']],
    [['聡', 'さとい', 'sharp-eared, quick-witted']]),

  // Objects
  r('宀', null, 'うかんむり', 'roof', 'အမိုး', 3, 'Objects',
    [['家', 'いえ', 'house'], ['安', 'やすい', 'peaceful, cheap'], ['室', 'しつ', 'room']],
    [['客', 'きゃく', 'guest'], ['宿', 'やど', 'inn'], ['宅', 'たく', 'home, residence']]),
  // Unlike simplified Chinese, the Japanese 門 still carries meaning:
  // 開 open and 閉 close are both about the door.
  r('門', null, 'もんがまえ', 'door, gate', 'တံခါး', 8, 'Objects',
    [['開', 'ひらく', 'to open'], ['閉', 'しめる', 'to close'], ['間', 'あいだ', 'between']],
    [['関', 'せき', 'checkpoint, barrier']]),
  r('車', null, 'くるまへん', 'vehicle, wheel', 'ကား', 7, 'Objects',
    [['転', 'ころぶ', 'to roll over'], ['輪', 'わ', 'wheel, ring'], ['軽', 'かるい', 'light (in weight)']],
    [['軸', 'じく', 'axle'], ['輸', 'ゆ', 'to transport']]),
  r('金', null, 'かねへん', 'metal, money', 'သတ္တု; ပိုက်ဆံ', 8, 'Objects',
    [['銀', 'ぎん', 'silver'], ['鉄', 'てつ', 'iron'], ['銭', 'ぜに', 'coin']],
    [['針', 'はり', 'needle'], ['鍋', 'なべ', 'pot'], ['鍵', 'かぎ', 'key']]),
  r('衤', '衣', 'ころもへん', 'clothing', 'အဝတ်အထည်', 5, 'Objects',
    [['袖', 'そで', 'sleeve'], ['被', 'かぶる', 'to wear (on the head)'], ['裸', 'はだか', 'naked']],
    [['襟', 'えり', 'collar'], ['裾', 'すそ', 'hem'], ['袴', 'はかま', 'hakama (pleated trousers)']]),
  r('飠', '食', 'しょくへん', 'food, eat', 'အစားအစာ', 8, 'Objects',
    [['飲', 'のむ', 'to drink'], ['飯', 'めし', 'meal, rice'], ['餅', 'もち', 'rice cake']],
    [['飴', 'あめ', 'candy'], ['餌', 'えさ', 'animal feed'], ['飢', 'うえる', 'to starve']]),
  r('米', null, 'こめへん', 'rice', 'ဆန်', 6, 'Objects',
    [['粉', 'こな', 'powder, flour'], ['糖', 'とう', 'sugar'], ['粒', 'つぶ', 'grain']],
    [['粥', 'かゆ', 'rice porridge'], ['糊', 'のり', 'paste, glue'], ['粘', 'ねばる', 'to be sticky']]),
  r('糸', null, 'いとへん', 'thread', 'ချည်', 6, 'Objects',
    [['紙', 'かみ', 'paper'], ['線', 'せん', 'line'], ['結', 'むすぶ', 'to tie']],
    [['綿', 'わた', 'cotton'], ['編', 'あむ', 'to knit'], ['縫', 'ぬう', 'to sew']]),

  // Actions
  r('言', null, 'ごんべん', 'speech, words', 'စကား', 7, 'Actions',
    [['話', 'はなす', 'to speak'], ['語', 'ご', 'language'], ['読', 'よむ', 'to read']],
    [['詩', 'し', 'poem'], ['謝', 'あやまる', 'to apologise'], ['訳', 'やく', 'translation']]),
  r('辶', null, 'しんにょう', 'walk, movement', 'သွားလာ', 3, 'Actions',
    [['道', 'みち', 'road'], ['近', 'ちかい', 'near'], ['遠', 'とおい', 'far']],
    [['送', 'おくる', 'to send'], ['迎', 'むかえる', 'to welcome'], ['逃', 'にげる', 'to run away']]),
  r('彳', null, 'ぎょうにんべん', 'step, go', 'လမ်းလျှောက်', 3, 'Actions',
    [['待', 'まつ', 'to wait'], ['後', 'あと', 'after, behind'], ['往', 'おう', 'to go']],
    [['徒', 'と', 'on foot'], ['径', 'けい', 'path'], ['従', 'したがう', 'to follow']]),
  r('力', null, 'ちから', 'strength, power', 'အား', 2, 'Actions',
    [['動', 'うごく', 'to move'], ['助', 'たすける', 'to help'], ['努', 'つとめる', 'to strive']],
    [['勉', 'べん', 'effort (as in 勉強, study)'], ['勇', 'いさむ', 'brave'], ['労', 'ろう', 'labour']]),
  r('刀', null, 'かたな', 'knife', 'ဓား', 2, 'Actions',
    [['切', 'きる', 'to cut'], ['分', 'わける', 'to divide'], ['刻', 'きざむ', 'to carve']],
    [['剣', 'けん', 'sword'], ['削', 'けずる', 'to shave down'], ['刺', 'さす', 'to stab']]),
  r('見', null, 'みる', 'to see', 'မြင်သည်', 7, 'Actions',
    [['視', 'し', 'sight, vision'], ['観', 'かん', 'to view'], ['覚', 'おぼえる', 'to remember']],
    [['覧', 'らん', 'to look over'], ['覗', 'のぞく', 'to peek']])
];
