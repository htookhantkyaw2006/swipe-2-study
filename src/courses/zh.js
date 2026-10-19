import { radicals, radicalCategories } from '../data/radicals';
import { writingChars } from '../data/writingChars';

/* ---------------------------------------------------------------
   CHINESE COURSE
   ---------------------------------------------------------------
   Everything Chinese-specific, in one place. Before this file the
   HSK level list alone existed in five hardcoded copies (Home
   carousel, level picker, level page, Phrases tab, phrases level
   page) — and they disagreed: the carousel said HSK 1 had 150 words,
   the picker said 300.

   `demo` holds the placeholder numbers the screens showed before
   any of it was real. They are kept so the Chinese app looks exactly
   as it did; a new language starts at zero instead of inheriting them.
   --------------------------------------------------------------- */

const levels = [
  { num: 1, words: 150,  phrases: 300,  tier: 'BEGINNER',     gradientStart: '#7DD3FC', gradientEnd: '#0369A1', shadow: 'rgba(3, 105, 161, 0.4)',  demo: { completed: 150, review: 41, phraseProgress: 100 } },
  { num: 2, words: 200,  phrases: 200,  tier: 'BEGINNER',     gradientStart: '#FCA5A5', gradientEnd: '#DC2626', shadow: 'rgba(220, 38, 38, 0.4)',  demo: { completed: 63,  review: 12, phraseProgress: 85 } },
  { num: 3, words: 500,  phrases: 500,  tier: 'BEGINNER',     gradientStart: '#FDBA74', gradientEnd: '#EA580C', shadow: 'rgba(234, 88, 12, 0.4)',  demo: { completed: 0,   review: 0,  phraseProgress: 42 } },
  { num: 4, words: 1000, phrases: 1000, tier: 'INTERMEDIATE', gradientStart: '#FDE047', gradientEnd: '#CA8A04', shadow: 'rgba(202, 138, 4, 0.4)',  demo: { completed: 0,   review: 0,  phraseProgress: 12 } },
  { num: 5, words: 1600, phrases: 1600, tier: 'INTERMEDIATE', gradientStart: '#86EFAC', gradientEnd: '#15803D', shadow: 'rgba(21, 128, 61, 0.4)',  demo: { completed: 0,   review: 0,  phraseProgress: 0 } },
  { num: 6, words: 1800, phrases: 1800, tier: 'INTERMEDIATE', gradientStart: '#67E8F9', gradientEnd: '#0E7490', shadow: 'rgba(14, 116, 144, 0.4)', demo: { completed: 0,   review: 0,  phraseProgress: 0 } },
  { num: 7, words: 1866, phrases: 1866, tier: 'ADVANCED',     gradientStart: '#60A5FA', gradientEnd: '#1E3A8A', shadow: 'rgba(30, 58, 138, 0.4)',  demo: { completed: 0,   review: 0,  phraseProgress: 0 } },
  { num: 8, words: 1867, phrases: 1867, tier: 'ADVANCED',     gradientStart: '#C4B5FD', gradientEnd: '#5B21B6', shadow: 'rgba(91, 33, 182, 0.4)',  demo: { completed: 0,   review: 0,  phraseProgress: 0 } },
  { num: 9, words: 1867, phrases: 1867, tier: 'ADVANCED',     gradientStart: '#6B7280', gradientEnd: '#171717', shadow: 'rgba(23, 23, 23, 0.4)',   demo: { completed: 0,   review: 0,  phraseProgress: 0 } }
].map((l) => ({
  ...l,
  id: `HSK${l.num}`,
  name: `HSK ${l.num}`,
  kicker: `LEVEL ${l.num}`,
  badge: String(l.num),
  numeral: '一二三四五六七八九'[l.num - 1],
  btnColor: l.gradientEnd
}));

const vocabulary = [
  {
    character: '中', pronunciation: 'zhōng', definition: 'middle; center; China',
    burmese_definition: 'အလယ်; အလယ်ဗဟို; တရုတ်', part_of_speech: 'noun',
    examples: [
      { text: '我是中国人。', reading: 'Wǒ shì Zhōngguó rén.', english: 'I am Chinese.', burmese: 'ကျွန်တော်/မ တရုတ်လူမျိုးပါ။' },
      { text: '他在中间。', reading: 'Tā zài zhōngjiān.', english: 'He is in the middle.', burmese: 'သူက အလယ်မှာ ရှိတယ်။' },
      { text: '中午我们吃饭。', reading: 'Zhōngwǔ wǒmen chī fàn.', english: 'We eat at noon.', burmese: 'မွန်းတည့်မှာ ကျွန်တော်တို့ ထမင်းစားတယ်။' }
    ]
  },
  {
    character: '你好', pronunciation: 'nǐ hǎo', definition: 'hello',
    burmese_definition: 'မင်္ဂလာပါ', part_of_speech: 'phrase',
    examples: [
      { text: '你好，我是学生。', reading: 'Nǐ hǎo, wǒ shì xuéshēng.', english: 'Hello, I am a student.', burmese: 'မင်္ဂလာပါ၊ ကျွန်တော်/မက ကျောင်းသားပါ။' },
      { text: '你好吗？', reading: 'Nǐ hǎo ma?', english: 'How are you?', burmese: 'နေကောင်းလား။' },
      { text: '大家好，你好！', reading: 'Dàjiā hǎo, nǐ hǎo!', english: 'Hello everyone, hello!', burmese: 'အားလုံးပဲ မင်္ဂလာပါ၊ မင်္ဂလာပါ။' }
    ]
  },
  {
    character: '谢谢', pronunciation: 'xiè xie', definition: 'thank you',
    burmese_definition: 'ကျေးဇူးတင်ပါတယ်', part_of_speech: 'phrase',
    examples: [
      { text: '谢谢你的帮助。', reading: 'Xièxiè nǐ de bāngzhù.', english: 'Thank you for your help.', burmese: 'ကူညီပေးတဲ့အတွက် ကျေးဇူးတင်ပါတယ်။' },
      { text: '太谢谢你了。', reading: 'Tài xièxiè nǐ le.', english: 'Thank you so much.', burmese: 'အရမ်းကျေးဇူးတင်ပါတယ်။' },
      { text: '不客气，谢谢。', reading: 'Bú kèqì, xièxiè.', english: 'You are welcome, thank you.', burmese: 'ရပါတယ်၊ ကျေးဇူးတင်ပါတယ်။' }
    ]
  },
  {
    character: '是', pronunciation: 'shì', definition: 'to be / is',
    burmese_definition: 'ဖြစ်သည်', part_of_speech: 'verb',
    examples: [
      { text: '我是中国人。', reading: 'Wǒ shì Zhōngguó rén.', english: 'I am Chinese.', burmese: 'ကျွန်တော်/မ တရုတ်လူမျိုးပါ။' },
      { text: '这是我的书。', reading: 'Zhè shì wǒ de shū.', english: 'This is my book.', burmese: 'ဒါက ကျွန်တော်/မရဲ့ စာအုပ်ပါ။' },
      { text: '他是医生吗？', reading: 'Tā shì yīshēng ma?', english: 'Is he a doctor?', burmese: 'သူက ဆရာဝန်လား။' }
    ]
  },
  {
    character: '不', pronunciation: 'bù', definition: 'not / no',
    burmese_definition: 'မဟုတ်ပါ / မ', part_of_speech: 'adverb',
    examples: [
      { text: '我不是老师。', reading: 'Wǒ bú shì lǎoshī.', english: 'I am not a teacher.', burmese: 'ကျွန်တော်/မ ဆရာ မဟုတ်ပါဘူး။' },
      { text: '我不喜欢吃。', reading: 'Wǒ bù xǐhuān chī.', english: 'I do not like to eat this.', burmese: 'ကျွန်တော်/မ ဒါကို မစားချင်ဘူး။' },
      { text: '不知道。', reading: 'Bù zhīdào.', english: 'I don\'t know.', burmese: 'မသိဘူး။' }
    ]
  }
];

const phrases = [
  { id: 1, level: 'HSK 1', phrase: '你好', reading: 'Nǐ hǎo', english: 'Hello', burmese: 'မင်္ဂလာပါ' },
  { id: 2, level: 'HSK 1', phrase: '谢谢', reading: 'Xièxiè', english: 'Thank you', burmese: 'ကျေးဇူးတင်ပါတယ်' },
  { id: 3, level: 'HSK 1', phrase: '再见', reading: 'Zàijiàn', english: 'Goodbye', burmese: 'တာ့တာ' },
  { id: 4, level: 'HSK 1', phrase: '对不起', reading: 'Duìbùqǐ', english: 'Sorry', burmese: 'တောင်းပန်ပါတယ်' },
  { id: 5, level: 'HSK 1', phrase: '没关系', reading: 'Méiguānxi', english: 'It\'s ok', burmese: 'ရပါတယ်' }
];

const dictionary = [
  { id: 'd1', phrase: '苹果', reading: 'Píngguǒ', english: 'Apple', burmese: 'ပန်းသီး' },
  { id: 'd2', phrase: '水', reading: 'Shuǐ', english: 'Water', burmese: 'ရေ' },
  { id: 'd3', phrase: '朋友', reading: 'Péngyǒu', english: 'Friend', burmese: 'သူငယ်ချင်း' },
  { id: 'd4', phrase: '爱', reading: 'Ài', english: 'Love', burmese: 'အချစ်' },
  { id: 'd5', phrase: '家', reading: 'Jiā', english: 'Home / Family', burmese: 'အိမ် / မိသားစု' },
  { id: 'd6', phrase: '学校', reading: 'Xuéxiào', english: 'School', burmese: 'ကျောင်း' },
  { id: 'd7', phrase: '医生', reading: 'Yīshēng', english: 'Doctor', burmese: 'ဆရာဝန်' },
  { id: 'd8', phrase: '猫', reading: 'Māo', english: 'Cat', burmese: 'ကြောင်' },
  { id: 'd9', phrase: '狗', reading: 'Gǒu', english: 'Dog', burmese: 'ခွေး' },
  { id: 'd10', phrase: '快乐', reading: 'Kuàilè', english: 'Happy', burmese: 'ပျော်ရွှင်သော' }
];

const sampleSaved = [
  { id: 1, phrase: '你好', reading: 'Nǐ hǎo', english: 'Hello', burmese: 'မင်္ဂလာပါ' },
  { id: 2, phrase: '谢谢', reading: 'Xièxiè', english: 'Thank you', burmese: 'ကျေးဇူးတင်ပါတယ်' },
  { id: 3, phrase: '再见', reading: 'Zàijiàn', english: 'Goodbye', burmese: 'တာ့တာ' },
  { id: 4, phrase: '对不起', reading: 'Duìbùqǐ', english: 'Sorry', burmese: 'တောင်းပန်ပါတယ်' },
  { id: 5, phrase: '没关系', reading: 'Méiguānxi', english: 'It\'s ok', burmese: 'ရပါတယ်' },
  { id: 6, phrase: '我是缅甸人', reading: 'Wǒ shì Miǎndiàn rén', english: 'I am Burmese', burmese: 'ကျွန်တော်ကမြန်မာလူမျိုးပါ' },
  { id: 7, phrase: '太贵了', reading: 'Tài guì le', english: 'Too expensive', burmese: 'အရမ်းဈေးကြီးတယ်' }
];

const sampleReview = [
  { id: 1, phrase: '你', reading: 'Nǐ', english: 'You', burmese: 'မင်း' },
  { id: 2, phrase: '好', reading: 'hǎo', english: 'Good', burmese: 'ကောင်းသော' },
  { id: 3, phrase: '再见', reading: 'Zàijiàn', english: 'Goodbye', burmese: 'တာ့တာ' },
  { id: 8, phrase: '对', reading: 'Duì', english: 'Correct / Right', burmese: 'မှန်တယ်' }
];

export default {
  id: 'zh',
  name: 'Chinese',
  nativeName: '中文',
  flag: '🇨🇳',
  status: 'active',

  levelSystem: 'HSK',
  levels,

  speech: {
    defaultAccent: 'zh-CN',
    accents: [
      { value: 'zh-CN', label: 'Mainland (普通话)' },
      { value: 'zh-TW', label: 'Taiwan (國語)' }
    ]
  },

  /* Labels that differ by script. */
  script: {
    romanization: 'pinyin',        // "Show pinyin"
    writtenForm: 'Hanzi',
    character: 'character',
    hasScriptVariants: true        // Simplified / Traditional row in Settings
  },

  copy: {
    coursesTitle: 'HSK Courses',
    pathPill: 'HSK 1-9 Learning Path',
    pickerHeadline: 'Choose an HSK level',
    pickerSubtitle: 'Flashcards and mock tests are available now.',
    totalWords: '11,000 words',
    levelCount: '9 progressive levels',
    allLevels: 'All HSK Levels',
    searchPlaceholder: 'Search Chinese, pinyin, English...',
    dictionarySubtitle: 'Search all HSK words',
    flashcardsWatermark: '字',
    exploreWatermark: '课',
    reviewWatermark: '习',
    lessonName: 'Greetings & basics',
    newDeckLevel: 'HSK 4',
    premium: {
      planSubtitle: 'All nine HSK levels and unlimited cards',
      headline: ['All nine levels.', 'One subscription.'],
      subhead: '11,000 words, every one explained in Burmese and English.',
      firstLevel: 'HSK 1',
      laterLevels: 'HSK 2–9 levels',
      promo: 'Unlimited flashcards & mock tests.'
    }
  },

  /* Watermark characters on the Library tool tiles. */
  toolChars: { flashcards: '卡', review: '复', saved: '藏', dictionary: '典', phrases: '句', interest: '类' },

  /* Explore & Practise tiles. A null path renders as "Soon". */
  exploreTools: [
    { key: 'scriptDictionary', title: 'Hanzi Dictionary', subtitle: 'Look up any character', path: null, char: '汉' },
    { key: 'radicals', title: 'Learn Radicals', subtitle: '氵 water, 木 tree, 心 heart...', path: '/radicals', char: '部' },
    { key: 'interest', title: 'Study by Interest', subtitle: 'Food, travel, people, work...', path: '/interest', char: '类' },
    { key: 'writing', title: 'Practise Writing', subtitle: 'Trace characters by hand', path: '/writing', char: '写' },
    { key: 'twisters', title: 'Tongue Twisters', subtitle: '20 drills with voice', path: null, char: '绕' }
  ],

  /* Study by Interest watermarks, by category id. */
  interestChars: {
    food: '食', travel: '游', people: '人', work: '业', tech: '网', health: '康',
    school: '学', shopping: '买', home: '家', weather: '天', sports: '动', music: '乐',
    entertainment: '影', hobbies: '趣', culture: '文', nature: '自', animals: '物',
    money: '钱', fashion: '衣', transport: '车', time: '时', smalltalk: '聊'
  },

  vocabulary,
  phrases,
  dictionary,
  sampleSaved,
  sampleReview,

  radicals: { list: radicals, categories: radicalCategories, nameLabel: 'pinyin' },
  writing: { chars: writingChars },

  demo: { librarySwiped: '1,248', librarySaved: 42, libraryPhrases: 86, profileSwiped: 363, homeSaved: 12 }
};
