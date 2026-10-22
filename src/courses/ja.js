import { radicals, radicalCategories } from './ja-radicals';

/* ---------------------------------------------------------------
   JAPANESE COURSE
   ---------------------------------------------------------------
   Same shape as the Chinese course, so every screen renders it with
   no Japanese-specific code of its own.

   Fields that are new here and simply absent in Chinese:
     kana     — the reading of a word that contains kanji (食べる → たべる)
     reading  — romaji, Hepburn with macrons (kyō, gakkō, ōkii)

   Word counts per level are the widely cited approximations: the
   JLPT has published no official vocabulary list since 2010, which
   is why the totals are written "~10,000" rather than as a fact.

   A new learner starts at zero — no `demo` numbers, no pre-filled
   saved words — so nothing on screen claims progress nobody made.

   BURMESE TRANSLATIONS ARE DRAFTS and should be reviewed by a
   native speaker before release.
   --------------------------------------------------------------- */

const levels = [
  { badge: 'N5', num: 5, words: 800,  phrases: 200, tier: 'BEGINNER',     numeral: '五', gradientStart: '#7DD3FC', gradientEnd: '#0369A1', shadow: 'rgba(3, 105, 161, 0.4)' },
  { badge: 'N4', num: 4, words: 700,  phrases: 250, tier: 'BEGINNER',     numeral: '四', gradientStart: '#FCA5A5', gradientEnd: '#DC2626', shadow: 'rgba(220, 38, 38, 0.4)' },
  { badge: 'N3', num: 3, words: 2250, phrases: 300, tier: 'INTERMEDIATE', numeral: '三', gradientStart: '#FDBA74', gradientEnd: '#EA580C', shadow: 'rgba(234, 88, 12, 0.4)' },
  { badge: 'N2', num: 2, words: 2250, phrases: 300, tier: 'ADVANCED',     numeral: '二', gradientStart: '#FDE047', gradientEnd: '#CA8A04', shadow: 'rgba(202, 138, 4, 0.4)' },
  { badge: 'N1', num: 1, words: 4000, phrases: 300, tier: 'ADVANCED',     numeral: '一', gradientStart: '#86EFAC', gradientEnd: '#15803D', shadow: 'rgba(21, 128, 61, 0.4)' }
].map((l) => ({
  ...l,
  id: l.badge,
  name: l.badge,
  kicker: l.tier,
  btnColor: l.gradientEnd,
  demo: { completed: 0, review: 0, phraseProgress: 0 }
}));

/* N5 starter vocabulary. Ordered so the first session (five cards)
   is a usable self-introduction: I, Japan, student, teacher, water. */
const vocabulary = [
  {
    character: '私', kana: 'わたし', pronunciation: 'watashi', definition: 'I; me',
    burmese_definition: 'ကျွန်တော် / ကျွန်မ', part_of_speech: 'pronoun',
    examples: [
      { text: '私は学生です。', reading: 'Watashi wa gakusei desu.', english: 'I am a student.', burmese: 'ကျွန်တော်/မ ကျောင်းသားပါ။' },
      { text: '私の名前はアウンです。', reading: 'Watashi no namae wa Aun desu.', english: 'My name is Aung.', burmese: 'ကျွန်တော့်နာမည် အောင် ပါ။' }
    ]
  },
  {
    character: '日本', kana: 'にほん', pronunciation: 'Nihon', definition: 'Japan',
    burmese_definition: 'ဂျပန်နိုင်ငံ', part_of_speech: 'noun',
    examples: [
      { text: '日本へ行きます。', reading: 'Nihon e ikimasu.', english: 'I am going to Japan.', burmese: 'ဂျပန်ကို သွားမယ်။' },
      { text: 'これは日本の本です。', reading: 'Kore wa Nihon no hon desu.', english: 'This is a Japanese book.', burmese: 'ဒါက ဂျပန်စာအုပ်ပါ။' }
    ]
  },
  {
    character: '学生', kana: 'がくせい', pronunciation: 'gakusei', definition: 'student',
    burmese_definition: 'ကျောင်းသား', part_of_speech: 'noun',
    examples: [
      { text: '彼は大学生です。', reading: 'Kare wa daigakusei desu.', english: 'He is a university student.', burmese: 'သူက တက္ကသိုလ်ကျောင်းသားပါ။' },
      { text: '学生は七人います。', reading: 'Gakusei wa shichinin imasu.', english: 'There are seven students.', burmese: 'ကျောင်းသား ခုနစ်ယောက် ရှိတယ်။' }
    ]
  },
  {
    character: '先生', kana: 'せんせい', pronunciation: 'sensei', definition: 'teacher',
    burmese_definition: 'ဆရာ / ဆရာမ', part_of_speech: 'noun',
    examples: [
      { text: '先生、おはようございます。', reading: 'Sensei, ohayō gozaimasu.', english: 'Good morning, teacher.', burmese: 'မင်္ဂလာနံနက်ခင်းပါ ဆရာ။' },
      { text: '山田先生は日本語の先生です。', reading: 'Yamada-sensei wa Nihongo no sensei desu.', english: 'Mr Yamada is a Japanese teacher.', burmese: 'ဆရာ ယာမာဒါက ဂျပန်စာ ဆရာပါ။' }
    ]
  },
  {
    character: '水', kana: 'みず', pronunciation: 'mizu', definition: 'water',
    burmese_definition: 'ရေ', part_of_speech: 'noun',
    examples: [
      { text: '水をください。', reading: 'Mizu o kudasai.', english: 'Water, please.', burmese: 'ရေ ပေးပါ။' },
      { text: '毎日水を飲みます。', reading: 'Mainichi mizu o nomimasu.', english: 'I drink water every day.', burmese: 'နေ့တိုင်း ရေ သောက်တယ်။' }
    ]
  },
  {
    character: '食べる', kana: 'たべる', pronunciation: 'taberu', definition: 'to eat',
    burmese_definition: 'စားသည်', part_of_speech: 'verb',
    examples: [
      { text: '朝ごはんを食べます。', reading: 'Asagohan o tabemasu.', english: 'I eat breakfast.', burmese: 'မနက်စာ စားတယ်။' },
      { text: '一緒に食べましょう。', reading: 'Issho ni tabemashō.', english: 'Let\'s eat together.', burmese: 'အတူတူ စားကြရအောင်။' }
    ]
  },
  {
    character: '飲む', kana: 'のむ', pronunciation: 'nomu', definition: 'to drink',
    burmese_definition: 'သောက်သည်', part_of_speech: 'verb',
    examples: [
      { text: 'お茶を飲みます。', reading: 'Ocha o nomimasu.', english: 'I drink green tea.', burmese: 'ရေနွေးကြမ်း သောက်တယ်။' },
      { text: 'コーヒーを飲みませんか。', reading: 'Kōhī o nomimasen ka.', english: 'Would you like some coffee?', burmese: 'ကော်ဖီ သောက်မလား။' }
    ]
  },
  {
    character: '行く', kana: 'いく', pronunciation: 'iku', definition: 'to go',
    burmese_definition: 'သွားသည်', part_of_speech: 'verb',
    examples: [
      { text: '学校へ行きます。', reading: 'Gakkō e ikimasu.', english: 'I go to school.', burmese: 'ကျောင်း သွားတယ်။' },
      { text: 'どこへ行きますか。', reading: 'Doko e ikimasu ka.', english: 'Where are you going?', burmese: 'ဘယ်ကို သွားမလဲ။' }
    ]
  },
  {
    character: '見る', kana: 'みる', pronunciation: 'miru', definition: 'to see; to watch',
    burmese_definition: 'ကြည့်သည် / မြင်သည်', part_of_speech: 'verb',
    examples: [
      { text: 'テレビを見ます。', reading: 'Terebi o mimasu.', english: 'I watch TV.', burmese: 'တီဗွီ ကြည့်တယ်။' },
      { text: '映画を見ましょう。', reading: 'Eiga o mimashō.', english: 'Let\'s watch a movie.', burmese: 'ရုပ်ရှင် ကြည့်ကြရအောင်။' }
    ]
  },
  {
    character: '本', kana: 'ほん', pronunciation: 'hon', definition: 'book',
    burmese_definition: 'စာအုပ်', part_of_speech: 'noun',
    examples: [
      { text: 'これは私の本です。', reading: 'Kore wa watashi no hon desu.', english: 'This is my book.', burmese: 'ဒါ ကျွန်တော့်စာအုပ်ပါ။' },
      { text: '本を読みます。', reading: 'Hon o yomimasu.', english: 'I read a book.', burmese: 'စာအုပ် ဖတ်တယ်။' }
    ]
  },
  {
    character: '友達', kana: 'ともだち', pronunciation: 'tomodachi', definition: 'friend',
    burmese_definition: 'သူငယ်ချင်း', part_of_speech: 'noun',
    examples: [
      { text: '友達と話します。', reading: 'Tomodachi to hanashimasu.', english: 'I talk with my friend.', burmese: 'သူငယ်ချင်းနဲ့ စကားပြောတယ်။' },
      { text: '彼は私の友達です。', reading: 'Kare wa watashi no tomodachi desu.', english: 'He is my friend.', burmese: 'သူက ကျွန်တော့်သူငယ်ချင်းပါ။' }
    ]
  },
  {
    character: '家', kana: 'いえ', pronunciation: 'ie', definition: 'house; home',
    burmese_definition: 'အိမ်', part_of_speech: 'noun',
    examples: [
      { text: '家に帰ります。', reading: 'Ie ni kaerimasu.', english: 'I am going home.', burmese: 'အိမ် ပြန်မယ်။' },
      { text: '私の家は駅の近くです。', reading: 'Watashi no ie wa eki no chikaku desu.', english: 'My house is near the station.', burmese: 'ကျွန်တော့်အိမ်က ဘူတာနားမှာပါ။' }
    ]
  },
  {
    character: '今日', kana: 'きょう', pronunciation: 'kyō', definition: 'today',
    burmese_definition: 'ဒီနေ့', part_of_speech: 'noun',
    examples: [
      { text: '今日は暑いです。', reading: 'Kyō wa atsui desu.', english: 'It is hot today.', burmese: 'ဒီနေ့ ပူတယ်။' },
      { text: '今日は何曜日ですか。', reading: 'Kyō wa nan\'yōbi desu ka.', english: 'What day is it today?', burmese: 'ဒီနေ့ ဘာနေ့လဲ။' }
    ]
  },
  {
    character: '明日', kana: 'あした', pronunciation: 'ashita', definition: 'tomorrow',
    burmese_definition: 'မနက်ဖြန်', part_of_speech: 'noun',
    examples: [
      { text: '明日また来ます。', reading: 'Ashita mata kimasu.', english: 'I will come again tomorrow.', burmese: 'မနက်ဖြန် ထပ်လာမယ်။' },
      { text: '明日は休みです。', reading: 'Ashita wa yasumi desu.', english: 'Tomorrow is a day off.', burmese: 'မနက်ဖြန် ပိတ်ရက်ပါ။' }
    ]
  },
  {
    character: '時間', kana: 'じかん', pronunciation: 'jikan', definition: 'time; hour',
    burmese_definition: 'အချိန် / နာရီ', part_of_speech: 'noun',
    examples: [
      { text: '時間がありません。', reading: 'Jikan ga arimasen.', english: 'I don\'t have time.', burmese: 'အချိန် မရှိဘူး။' },
      { text: '二時間勉強しました。', reading: 'Nijikan benkyō shimashita.', english: 'I studied for two hours.', burmese: 'နှစ်နာရီ စာလေ့လာခဲ့တယ်။' }
    ]
  },
  {
    character: '大きい', kana: 'おおきい', pronunciation: 'ōkii', definition: 'big',
    burmese_definition: 'ကြီးသော', part_of_speech: 'i-adjective',
    examples: [
      { text: '大きい犬ですね。', reading: 'Ōkii inu desu ne.', english: 'That is a big dog!', burmese: 'ခွေးကြီးပဲနော်။' },
      { text: 'この部屋は大きいです。', reading: 'Kono heya wa ōkii desu.', english: 'This room is big.', burmese: 'ဒီအခန်းက ကြီးတယ်။' }
    ]
  },
  {
    character: '小さい', kana: 'ちいさい', pronunciation: 'chiisai', definition: 'small',
    burmese_definition: 'သေးသော', part_of_speech: 'i-adjective',
    examples: [
      { text: '小さいかばんを買いました。', reading: 'Chiisai kaban o kaimashita.', english: 'I bought a small bag.', burmese: 'အိတ်သေးသေးလေး ဝယ်ခဲ့တယ်။' },
      { text: '猫はとても小さいです。', reading: 'Neko wa totemo chiisai desu.', english: 'The cat is very small.', burmese: 'ကြောင်က အရမ်းသေးတယ်။' }
    ]
  },
  {
    character: '好き', kana: 'すき', pronunciation: 'suki', definition: 'liked; to like',
    burmese_definition: 'ကြိုက်သော', part_of_speech: 'na-adjective',
    examples: [
      { text: '日本料理が好きです。', reading: 'Nihon ryōri ga suki desu.', english: 'I like Japanese food.', burmese: 'ဂျပန်အစားအစာကို ကြိုက်တယ်။' },
      { text: '何が好きですか。', reading: 'Nani ga suki desu ka.', english: 'What do you like?', burmese: 'ဘာကို ကြိုက်လဲ။' }
    ]
  },
  {
    character: '猫', kana: 'ねこ', pronunciation: 'neko', definition: 'cat',
    burmese_definition: 'ကြောင်', part_of_speech: 'noun',
    examples: [
      { text: '猫が好きです。', reading: 'Neko ga suki desu.', english: 'I like cats.', burmese: 'ကြောင်ကို ကြိုက်တယ်။' },
      { text: '家に猫が二匹います。', reading: 'Ie ni neko ga nihiki imasu.', english: 'There are two cats at home.', burmese: 'အိမ်မှာ ကြောင် နှစ်ကောင် ရှိတယ်။' }
    ]
  },
  {
    character: '駅', kana: 'えき', pronunciation: 'eki', definition: 'station',
    burmese_definition: 'ဘူတာ', part_of_speech: 'noun',
    examples: [
      { text: '駅はどこですか。', reading: 'Eki wa doko desu ka.', english: 'Where is the station?', burmese: 'ဘူတာက ဘယ်မှာလဲ။' },
      { text: '駅で友達に会います。', reading: 'Eki de tomodachi ni aimasu.', english: 'I will meet my friend at the station.', burmese: 'ဘူတာမှာ သူငယ်ချင်းနဲ့ တွေ့မယ်။' }
    ]
  }
];

const phrases = [
  { id: 1, level: 'N5', phrase: 'こんにちは', reading: 'Konnichiwa', english: 'Hello', burmese: 'မင်္ဂလာပါ' },
  { id: 2, level: 'N5', phrase: 'ありがとうございます', reading: 'Arigatō gozaimasu', english: 'Thank you', burmese: 'ကျေးဇူးတင်ပါတယ်' },
  { id: 3, level: 'N5', phrase: 'すみません', reading: 'Sumimasen', english: 'Excuse me / Sorry', burmese: 'ခွင့်ပြုပါ / တောင်းပန်ပါတယ်' },
  { id: 4, level: 'N5', phrase: 'さようなら', reading: 'Sayōnara', english: 'Goodbye', burmese: 'တာ့တာ' },
  { id: 5, level: 'N5', phrase: 'おはようございます', reading: 'Ohayō gozaimasu', english: 'Good morning', burmese: 'မင်္ဂလာနံနက်ခင်းပါ' },
  { id: 6, level: 'N5', phrase: 'はじめまして', reading: 'Hajimemashite', english: 'Nice to meet you', burmese: 'တွေ့ရတာ ဝမ်းသာပါတယ်' },
  { id: 7, level: 'N5', phrase: 'いただきます', reading: 'Itadakimasu', english: 'Said before a meal', burmese: 'ထမင်းမစားခင် ပြောတဲ့ စကား' },
  { id: 8, level: 'N5', phrase: '大丈夫です', kana: 'だいじょうぶです', reading: 'Daijōbu desu', english: 'It\'s okay / I\'m fine', burmese: 'ရပါတယ် / အဆင်ပြေပါတယ်' }
];

const dictionary = [
  { id: 'j1', phrase: 'りんご', reading: 'Ringo', english: 'Apple', burmese: 'ပန်းသီး' },
  { id: 'j2', phrase: '水', kana: 'みず', reading: 'Mizu', english: 'Water', burmese: 'ရေ' },
  { id: 'j3', phrase: '友達', kana: 'ともだち', reading: 'Tomodachi', english: 'Friend', burmese: 'သူငယ်ချင်း' },
  { id: 'j4', phrase: '愛', kana: 'あい', reading: 'Ai', english: 'Love', burmese: 'အချစ်' },
  { id: 'j5', phrase: '家', kana: 'いえ', reading: 'Ie', english: 'House / Home', burmese: 'အိမ်' },
  { id: 'j6', phrase: '学校', kana: 'がっこう', reading: 'Gakkō', english: 'School', burmese: 'ကျောင်း' },
  { id: 'j7', phrase: '医者', kana: 'いしゃ', reading: 'Isha', english: 'Doctor', burmese: 'ဆရာဝန်' },
  { id: 'j8', phrase: '猫', kana: 'ねこ', reading: 'Neko', english: 'Cat', burmese: 'ကြောင်' },
  { id: 'j9', phrase: '犬', kana: 'いぬ', reading: 'Inu', english: 'Dog', burmese: 'ခွေး' },
  { id: 'j10', phrase: '嬉しい', kana: 'うれしい', reading: 'Ureshii', english: 'Happy / Glad', burmese: 'ပျော်ရွှင်သော' },
  { id: 'j11', phrase: '電車', kana: 'でんしゃ', reading: 'Densha', english: 'Train', burmese: 'ရထား' },
  { id: 'j12', phrase: 'お金', kana: 'おかね', reading: 'Okane', english: 'Money', burmese: 'ပိုက်ဆံ' }
];

export default {
  id: 'ja',
  name: 'Japanese',
  nativeName: '日本語',
  flag: '🇯🇵',
  status: 'active',

  levelSystem: 'JLPT',
  levels,

  speech: {
    defaultAccent: 'ja-JP',
    accents: [{ value: 'ja-JP', label: 'Standard (標準語)' }]
  },

  script: {
    romanization: 'romaji',
    romanizationHint: 'Romanisation on cards',
    writtenForm: 'Word',
    character: 'word',
    hasScriptVariants: false
  },

  copy: {
    coursesTitle: 'JLPT Courses',
    pathPill: 'JLPT N5–N1 Learning Path',
    pickerHeadline: 'Choose a JLPT level',
    pickerSubtitle: 'Start at N5 and work up to N1.',
    totalWords: '~10,000 words',
    levelCount: '5 progressive levels',
    allLevels: 'All JLPT Levels',
    searchPlaceholder: 'Search Japanese, romaji, English...',
    dictionarySubtitle: 'Search all JLPT words',
    heroWatermark: '学',          // course banner, Premium hero, Home premium card
    flashcardsWatermark: '字',
    exploreWatermark: '課',
    reviewWatermark: '習',
    lessonName: 'Basics',
    newDeckLevel: 'N4',
    writingNote: 'Writing practice needs stroke-order data for Japanese. The data this app uses is Chinese, and would teach the wrong stroke order for some characters.',
    premium: {
      planSubtitle: 'All five JLPT levels and unlimited cards',
      headline: ['All five levels.', 'One subscription.'],
      subhead: 'About 10,000 words, every one explained in Burmese and English.',
      firstLevel: 'N5',
      laterLevels: 'N4–N1 levels',
      promo: 'Unlimited flashcards for every JLPT level.'
    }
  },

  toolChars: { flashcards: '札', review: '復', saved: '保', dictionary: '辞', phrases: '句', interest: '類' },

  exploreTools: [
    { key: 'scriptDictionary', title: 'Kanji Dictionary', subtitle: 'Look up any kanji', path: null, char: '漢' },
    { key: 'kana', title: 'Learn Kana', subtitle: 'あ ア — hiragana and katakana', path: '/kana', char: 'あ' },
    { key: 'radicals', title: 'Learn Radicals', subtitle: '氵 water, 木 tree, 言 speech...', path: '/radicals', char: '部' },
    { key: 'interest', title: 'Study by Interest', subtitle: 'Food, travel, people, work...', path: '/interest', char: '類' },
    { key: 'writing', title: 'Practise Writing', subtitle: 'Needs Japanese stroke-order data', path: null, char: '書' },
    { key: 'twisters', title: 'Tongue Twisters', subtitle: '早口言葉 with voice', path: null, char: '早' }
  ],

  interestChars: {
    food: '食', travel: '旅', people: '人', work: '業', tech: '電', health: '健',
    school: '学', shopping: '買', home: '家', weather: '天', sports: '動', music: '楽',
    entertainment: '映', hobbies: '趣', culture: '文', nature: '自', animals: '物',
    money: '金', fashion: '服', transport: '車', time: '時', smalltalk: '話'
  },

  vocabulary,
  phrases,
  dictionary,
  sampleSaved: [],
  sampleReview: [],

  radicals: {
    list: radicals,
    categories: radicalCategories,
    copy: {
      title: 'Learn Radicals',
      headline: ['The parts', 'characters are made of'],
      intro: 'Spot 氵 and you already know the word is about water.',
      drillTitle: 'Spot the Radical',
      drillSubtitle: '5 questions · read a character you have never studied',
      unit: 'radical',
      units: 'radicals',
      examplesTitle: 'Characters using it',
      decodeLabel: 'You have not studied this character',
      decodeQuestion: 'What is this character about?',
      identifyLabel: 'Name the radical',
      identifyQuestion: 'What does this radical mean?',
      joiner: '、'
    }
  },

  /* No stroke data: hanzi-writer-data has no kana and teaches Chinese
     stroke order, which differs from Japanese for some kanji (右, 必).
     hanzi-writer-data-jp is the right source but its published package
     ships no character files yet. */
  writing: null,

  demo: null
};
