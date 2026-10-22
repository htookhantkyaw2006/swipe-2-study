import { radicals, radicalCategories } from './en-wordparts';

/* ---------------------------------------------------------------
   ENGLISH COURSE
   ---------------------------------------------------------------
   Same shape as zh.js and ja.js. What changes for a Latin-script
   language:

     reading/pronunciation — IPA, British: /ˈwɔːtə/. English spelling
                 does not tell you how to say a word, so IPA does the
                 job pinyin and romaji do for the other courses.
     definition — a short, simple English definition, the way a
                 learner's dictionary explains a word. The Burmese
                 meaning sits beside it as before.
     examples   — `text` and `burmese` only: an English sentence needs
                 no romanisation and no English translation.

   British pronunciation and spelling (colour, anticlockwise) because
   the course follows CEFR, and Cambridge — whose exams map onto CEFR
   and are the ones most taken in Myanmar — uses British English. The
   voice can be switched to American in Settings; the IPA stays British.

   There is no official CEFR vocabulary list — CEFR describes what a
   learner can do, not which words they know — so the per-level counts
   are the commonly cited approximations, and written "~10,000".

   A new learner starts at zero, as in Japanese.

   BURMESE TRANSLATIONS ARE DRAFTS for native review.
   --------------------------------------------------------------- */

const levels = [
  { badge: 'A1', num: 1, words: 600,  phrases: 150, tier: 'BEGINNER',           gradientStart: '#7DD3FC', gradientEnd: '#0369A1', shadow: 'rgba(3, 105, 161, 0.4)' },
  { badge: 'A2', num: 2, words: 900,  phrases: 200, tier: 'ELEMENTARY',         gradientStart: '#FCA5A5', gradientEnd: '#DC2626', shadow: 'rgba(220, 38, 38, 0.4)' },
  { badge: 'B1', num: 3, words: 1500, phrases: 250, tier: 'INTERMEDIATE',       gradientStart: '#FDBA74', gradientEnd: '#EA580C', shadow: 'rgba(234, 88, 12, 0.4)' },
  { badge: 'B2', num: 4, words: 2000, phrases: 300, tier: 'UPPER INTERMEDIATE', gradientStart: '#FDE047', gradientEnd: '#CA8A04', shadow: 'rgba(202, 138, 4, 0.4)' },
  { badge: 'C1', num: 5, words: 2500, phrases: 300, tier: 'ADVANCED',           gradientStart: '#86EFAC', gradientEnd: '#15803D', shadow: 'rgba(21, 128, 61, 0.4)' },
  { badge: 'C2', num: 6, words: 2500, phrases: 300, tier: 'PROFICIENT',         gradientStart: '#67E8F9', gradientEnd: '#0E7490', shadow: 'rgba(14, 116, 144, 0.4)' }
].map((l) => ({
  ...l,
  id: l.badge,
  name: l.badge,
  kicker: l.tier,
  numeral: l.badge,
  btnColor: l.gradientEnd,
  demo: { completed: 0, review: 0, phraseProgress: 0 }
}));

const ex = (text, burmese) => ({ text, burmese });

/* A1 starter vocabulary. The first ten make a usable first session:
   greet someone, give your name, talk about friends, family, food. */
const vocabulary = [
  { character: 'hello', pronunciation: '/həˈləʊ/', definition: 'a word you say when you meet someone', burmese_definition: 'မင်္ဂလာပါ', part_of_speech: 'exclamation',
    examples: [ex('Hello, my name is Aung.', 'မင်္ဂလာပါ၊ ကျွန်တော့်နာမည် အောင် ပါ။'), ex('Say hello to your teacher.', 'ဆရာ့ကို နှုတ်ဆက်လိုက်ပါ။')] },
  { character: 'name', pronunciation: '/neɪm/', definition: 'the word someone or something is called', burmese_definition: 'နာမည်', part_of_speech: 'noun',
    examples: [ex('What is your name?', 'နာမည် ဘယ်လိုခေါ်လဲ။'), ex('My name is Mya.', 'ကျွန်မနာမည် မြ ပါ။')] },
  { character: 'friend', pronunciation: '/frend/', definition: 'a person you know well and like', burmese_definition: 'သူငယ်ချင်း', part_of_speech: 'noun',
    examples: [ex('She is my best friend.', 'သူမက ကျွန်တော့်ရဲ့ အခင်ဆုံး သူငယ်ချင်းပါ။'), ex('I play football with my friends.', 'ကျွန်တော် သူငယ်ချင်းတွေနဲ့ ဘောလုံးကန်တယ်။')] },
  { character: 'family', pronunciation: '/ˈfæməli/', definition: 'parents, children, brothers and sisters', burmese_definition: 'မိသားစု', part_of_speech: 'noun',
    examples: [ex('I have a big family.', 'ကျွန်တော့်မှာ မိသားစုဝင် အများကြီး ရှိတယ်။'), ex('My family lives in Yangon.', 'ကျွန်တော့်မိသားစု ရန်ကုန်မှာ နေတယ်။')] },
  { character: 'water', pronunciation: '/ˈwɔːtə/', definition: 'the clear liquid that you drink', burmese_definition: 'ရေ', part_of_speech: 'noun',
    examples: [ex('Can I have some water, please?', 'ရေ နည်းနည်း ရနိုင်မလား။'), ex('Drink water every day.', 'နေ့တိုင်း ရေ သောက်ပါ။')] },
  { character: 'eat', pronunciation: '/iːt/', definition: 'to put food in your mouth and swallow it', burmese_definition: 'စားသည်', part_of_speech: 'verb',
    examples: [ex('We eat rice every day.', 'ကျွန်တော်တို့ နေ့တိုင်း ထမင်း စားတယ်။'), ex('What do you want to eat?', 'ဘာ စားချင်လဲ။')] },
  { character: 'drink', pronunciation: '/drɪŋk/', definition: 'to take a liquid into your mouth and swallow it', burmese_definition: 'သောက်သည်', part_of_speech: 'verb',
    examples: [ex('I drink tea in the morning.', 'ကျွန်တော် မနက်မှာ လက်ဖက်ရည် သောက်တယ်။'), ex('Do you want something to drink?', 'တစ်ခုခု သောက်ချင်လား။')] },
  { character: 'go', pronunciation: '/ɡəʊ/', definition: 'to move from one place to another', burmese_definition: 'သွားသည်', part_of_speech: 'verb',
    examples: [ex('I go to school by bus.', 'ကျွန်တော် ဘတ်စ်ကားနဲ့ ကျောင်းသွားတယ်။'), ex('Let\'s go home.', 'အိမ် ပြန်ကြရအောင်။')] },
  { character: 'house', pronunciation: '/haʊs/', definition: 'a building that people live in', burmese_definition: 'အိမ်', part_of_speech: 'noun',
    examples: [ex('This is my house.', 'ဒါ ကျွန်တော့်အိမ်ပါ။'), ex('Their house is near the market.', 'သူတို့အိမ်က ဈေးနားမှာပါ။')] },
  { character: 'school', pronunciation: '/skuːl/', definition: 'a place where children go to learn', burmese_definition: 'ကျောင်း', part_of_speech: 'noun',
    examples: [ex('I walk to school.', 'ကျွန်တော် ကျောင်းကို လမ်းလျှောက်သွားတယ်။'), ex('School starts at nine o\'clock.', 'ကျောင်းက ကိုးနာရီမှာ စတယ်။')] },
  { character: 'book', pronunciation: '/bʊk/', definition: 'pages with writing on them, inside a cover', burmese_definition: 'စာအုပ်', part_of_speech: 'noun',
    examples: [ex('I am reading a good book.', 'ကျွန်တော် စာအုပ်ကောင်း တစ်အုပ် ဖတ်နေတယ်။'), ex('Open your books, please.', 'စာအုပ်တွေ ဖွင့်ပါ။')] },
  { character: 'teacher', pronunciation: '/ˈtiːtʃə/', definition: 'a person whose job is to teach', burmese_definition: 'ဆရာ / ဆရာမ', part_of_speech: 'noun',
    examples: [ex('Our teacher is very kind.', 'ကျွန်တော်တို့ ဆရာက အရမ်း သဘောကောင်းတယ်။'), ex('She wants to be a teacher.', 'သူမ ဆရာမ ဖြစ်ချင်တယ်။')] },
  { character: 'today', pronunciation: '/təˈdeɪ/', definition: 'on this day', burmese_definition: 'ဒီနေ့', part_of_speech: 'adverb',
    examples: [ex('It is hot today.', 'ဒီနေ့ ပူတယ်။'), ex('What are you doing today?', 'ဒီနေ့ ဘာလုပ်မလဲ။')] },
  { character: 'tomorrow', pronunciation: '/təˈmɒrəʊ/', definition: 'on the day after today', burmese_definition: 'မနက်ဖြန်', part_of_speech: 'adverb',
    examples: [ex('See you tomorrow.', 'မနက်ဖြန် တွေ့မယ်။'), ex('Tomorrow is Sunday.', 'မနက်ဖြန် တနင်္ဂနွေနေ့ပါ။')] },
  { character: 'big', pronunciation: '/bɪɡ/', definition: 'large in size', burmese_definition: 'ကြီးသော', part_of_speech: 'adjective',
    examples: [ex('That is a big dog.', 'အဲဒါ ခွေးကြီးပဲ။'), ex('Yangon is a big city.', 'ရန်ကုန်က မြို့ကြီးပါ။')] },
  { character: 'small', pronunciation: '/smɔːl/', definition: 'little in size', burmese_definition: 'သေးသော', part_of_speech: 'adjective',
    examples: [ex('I live in a small town.', 'ကျွန်တော် မြို့လေးတစ်မြို့မှာ နေတယ်။'), ex('This shirt is too small.', 'ဒီရှပ်အင်္ကျီက သေးလွန်းတယ်။')] },
  { character: 'happy', pronunciation: '/ˈhæpi/', definition: 'feeling good and pleased', burmese_definition: 'ပျော်ရွှင်သော', part_of_speech: 'adjective',
    examples: [ex('I am very happy today.', 'ဒီနေ့ ကျွန်တော် အရမ်းပျော်တယ်။'), ex('Happy birthday!', 'မွေးနေ့မှာ ပျော်ရွှင်ပါစေ။')] },
  { character: 'like', pronunciation: '/laɪk/', definition: 'to think that something is nice', burmese_definition: 'ကြိုက်သည်', part_of_speech: 'verb',
    examples: [ex('I like mangoes.', 'ကျွန်တော် သရက်သီး ကြိုက်တယ်။'), ex('Do you like music?', 'ဂီတ ကြိုက်လား။')] },
  { character: 'time', pronunciation: '/taɪm/', definition: 'minutes, hours, days and years', burmese_definition: 'အချိန်', part_of_speech: 'noun',
    examples: [ex('What time is it?', 'အခု ဘယ်နှနာရီ ရှိပြီလဲ။'), ex('I don\'t have time.', 'ကျွန်တော့်မှာ အချိန် မရှိဘူး။')] },
  { character: 'thank you', pronunciation: '/ˈθæŋk juː/', definition: 'what you say when someone helps you', burmese_definition: 'ကျေးဇူးတင်ပါတယ်', part_of_speech: 'phrase',
    examples: [ex('Thank you for your help.', 'ကူညီပေးတဲ့အတွက် ကျေးဇူးတင်ပါတယ်။'), ex('Thank you very much.', 'အရမ်း ကျေးဇူးတင်ပါတယ်။')] }
];

/* Phrases and dictionary rows: `english` is a short explanation of
   use, since the phrase itself is already English. */
const phrases = [
  { id: 1, level: 'A1', phrase: 'Good morning', reading: '/ɡʊd ˈmɔːnɪŋ/', english: 'Said when you meet someone in the morning', burmese: 'မင်္ဂလာနံနက်ခင်းပါ' },
  { id: 2, level: 'A1', phrase: 'How are you?', reading: '/haʊ ɑː juː/', english: 'A friendly way to ask about someone', burmese: 'နေကောင်းလား' },
  { id: 3, level: 'A1', phrase: 'Nice to meet you', reading: '/naɪs tə ˈmiːt juː/', english: 'Said when you meet someone for the first time', burmese: 'တွေ့ရတာ ဝမ်းသာပါတယ်' },
  { id: 4, level: 'A1', phrase: 'Excuse me', reading: '/ɪkˈskjuːz miː/', english: 'A polite way to get someone\'s attention', burmese: 'ခွင့်ပြုပါ' },
  { id: 5, level: 'A1', phrase: 'I\'m sorry', reading: '/aɪm ˈsɒri/', english: 'Said when you have done something wrong', burmese: 'တောင်းပန်ပါတယ်' },
  { id: 6, level: 'A1', phrase: 'See you later', reading: '/ˈsiː juː ˈleɪtə/', english: 'An informal way to say goodbye', burmese: 'နောက်မှ တွေ့မယ်' },
  { id: 7, level: 'A1', phrase: 'Can you help me?', reading: '/kən juː ˈhelp miː/', english: 'A polite way to ask for help', burmese: 'ကူညီပေးနိုင်မလား' },
  { id: 8, level: 'A1', phrase: 'How much is it?', reading: '/haʊ ˈmʌtʃ ɪz ɪt/', english: 'A way to ask the price', burmese: 'ဒါ ဘယ်လောက်လဲ' }
];

const dictionary = [
  { id: 'e1', phrase: 'apple', reading: '/ˈæpl/', english: 'A round red or green fruit', burmese: 'ပန်းသီး' },
  { id: 'e2', phrase: 'water', reading: '/ˈwɔːtə/', english: 'The clear liquid that you drink', burmese: 'ရေ' },
  { id: 'e3', phrase: 'friend', reading: '/frend/', english: 'A person you know well and like', burmese: 'သူငယ်ချင်း' },
  { id: 'e4', phrase: 'love', reading: '/lʌv/', english: 'A very strong feeling of liking someone', burmese: 'အချစ်' },
  { id: 'e5', phrase: 'home', reading: '/həʊm/', english: 'The place where you live', burmese: 'အိမ်' },
  { id: 'e6', phrase: 'school', reading: '/skuːl/', english: 'A place where children go to learn', burmese: 'ကျောင်း' },
  { id: 'e7', phrase: 'doctor', reading: '/ˈdɒktə/', english: 'A person whose job is to treat sick people', burmese: 'ဆရာဝန်' },
  { id: 'e8', phrase: 'cat', reading: '/kæt/', english: 'A small animal with soft fur, often kept as a pet', burmese: 'ကြောင်' },
  { id: 'e9', phrase: 'dog', reading: '/dɒɡ/', english: 'An animal kept as a pet or to guard a house', burmese: 'ခွေး' },
  { id: 'e10', phrase: 'happy', reading: '/ˈhæpi/', english: 'Feeling good and pleased', burmese: 'ပျော်ရွှင်သော' },
  { id: 'e11', phrase: 'train', reading: '/treɪn/', english: 'A long vehicle that runs on a railway', burmese: 'ရထား' },
  { id: 'e12', phrase: 'money', reading: '/ˈmʌni/', english: 'Coins and notes you use to buy things', burmese: 'ပိုက်ဆံ' }
];

export default {
  id: 'en',
  name: 'English',
  nativeName: 'English',
  flag: '🇬🇧',
  status: 'active',

  levelSystem: 'CEFR',
  levels,

  speech: {
    defaultAccent: 'en-GB',
    accents: [
      { value: 'en-GB', label: 'British' },
      { value: 'en-US', label: 'American' }
    ]
  },

  script: {
    romanization: 'IPA',
    romanizationHint: 'Pronunciation symbols on cards',
    writtenForm: 'Word',
    character: 'word',
    hasScriptVariants: false,
    // In the level word table, put the IPA under the word (as kana sits
    // under kanji) and show the Burmese meaning: a separate IPA column
    // plus an English definition left the meaning about 60px on a phone.
    stackReading: true,
    listMeaning: 'burmese'
  },

  copy: {
    coursesTitle: 'CEFR Courses',
    pathPill: 'CEFR A1–C2 Learning Path',
    pickerHeadline: 'Choose a CEFR level',
    pickerSubtitle: 'From first words at A1 to fluent English at C2.',
    totalWords: '~10,000 words',
    levelCount: '6 progressive levels',
    allLevels: 'All CEFR Levels',
    searchPlaceholder: 'Search English or Burmese...',
    dictionarySubtitle: 'Search all CEFR words',
    heroWatermark: 'Aa',          // course banner, Premium hero, Home premium card
    flashcardsWatermark: 'Aa',
    exploreWatermark: '?',
    reviewWatermark: 'Re',
    lessonName: 'First words',
    newDeckLevel: 'B1',
    writingNote: 'Stroke-order practice is for character scripts like Chinese and Japanese, so it is not part of the English course.',
    premium: {
      planSubtitle: 'All six CEFR levels and unlimited cards',
      headline: ['All six levels.', 'One subscription.'],
      subhead: 'About 10,000 words, each with its Burmese meaning and a simple English definition.',
      firstLevel: 'A1',
      laterLevels: 'A2–C2 levels',
      promo: 'Unlimited flashcards for every CEFR level.'
    }
  },

  // Single letters: a whole word would not fit as a watermark.
  toolChars: { flashcards: 'F', review: 'R', saved: 'S', dictionary: 'D', phrases: 'P', interest: 'I' },

  /* No script dictionary (the Dictionary already covers English) and no
     writing practice (stroke order is for character scripts). */
  exploreTools: [
    { key: 'sounds', title: 'Sounds of English', subtitle: '/θ/ think, /v/ van — all 44 sounds', path: '/sounds', char: 'ə' },
    { key: 'radicals', title: 'Word Parts', subtitle: 'un- not, re- again, -ful full of...', path: '/radicals', char: 'un' },
    { key: 'interest', title: 'Study by Interest', subtitle: 'Food, travel, people, work...', path: '/interest', char: 'I' },
    { key: 'twisters', title: 'Tongue Twisters', subtitle: 'She sells seashells...', path: null, char: 'S' }
  ],

  interestChars: {
    food: 'F', travel: 'T', people: 'P', work: 'W', tech: 'T', health: 'H',
    school: 'S', shopping: 'S', home: 'H', weather: 'W', sports: 'S', music: 'M',
    entertainment: 'F', hobbies: 'H', culture: 'C', nature: 'N', animals: 'A',
    money: '$', fashion: 'C', transport: 'C', time: 'T', smalltalk: 'H'
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
      title: 'Word Parts',
      headline: ['The parts', 'words are made of'],
      intro: 'Spot un- and you already know the word means not.',
      drillTitle: 'Spot the Word Part',
      drillSubtitle: '5 questions · read a word you have never studied',
      unit: 'word part',
      units: 'word parts',
      examplesTitle: 'Words using it',
      decodeLabel: 'You have not studied this word',
      decodeQuestion: 'What does the highlighted part mean?',
      identifyLabel: 'Name the word part',
      identifyQuestion: 'What does this word part mean?',
      joiner: ', '
    }
  },

  writing: null,
  demo: null
};
