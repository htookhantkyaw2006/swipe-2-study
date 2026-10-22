/* ---------------------------------------------------------------
   ENGLISH WORD PARTS
   ---------------------------------------------------------------
   English's answer to radicals. A Chinese learner spots 氵 and knows a
   character is about water; an English learner spots un- and knows a
   word means "not". Same idea, so the same page and drill teach it —
   this file only has to supply the data.

   Shape matches src/data/radicals.js where it can:
     radical   — the part as written: "un-" prefix, "-ful" suffix, "port" root
     kind      — prefix | suffix | root (replaces the stroke count)
     examples  — words shown on the detail sheet
     quizChars — words HELD BACK for the drill, so a decode question
                 shows a word the learner has not just been shown

   Every quiz word is one where the part really does predict the
   meaning: "unsafe" is not safe, "rewrite" is write again. Words where
   a lookalike string is not the part ("under", "reason", "airport",
   whose port means harbour) are deliberately absent.

   BURMESE GLOSSES ARE DRAFTS for native review.
   --------------------------------------------------------------- */

export const radicalCategories = ['Prefixes', 'Suffixes', 'Roots'];

const KIND = { Prefixes: 'prefix', Suffixes: 'suffix', Roots: 'root' };

const part = (radical, meaning, burmese, category, examples, quiz) => ({
  radical, standalone: null, kind: KIND[category], meaning, burmese, category,
  examples: examples.map(([char, english]) => ({ char, english })),
  quizChars: quiz.map(([char, english]) => ({ char, english }))
});

export const radicals = [
  // Prefixes
  part('un-', 'not', 'မ— (မဟုတ်)', 'Prefixes',
    [['unhappy', 'not happy'], ['unkind', 'not kind'], ['unfair', 'not fair']],
    [['unsafe', 'not safe'], ['unclear', 'not clear'], ['unusual', 'not usual']]),
  part('re-', 'again', 'ထပ်မံ၍ / ပြန်', 'Prefixes',
    [['redo', 'do again'], ['replay', 'play again'], ['rebuild', 'build again']],
    [['rewrite', 'write again'], ['reheat', 'heat again'], ['refill', 'fill again']]),
  part('pre-', 'before', 'ကြိုတင်၍ / မတိုင်မီ', 'Prefixes',
    [['preview', 'a look before'], ['prepay', 'pay before'], ['preschool', 'school before school']],
    [['preheat', 'heat before'], ['preorder', 'order before it is out']]),
  part('dis-', 'opposite of', 'ဆန့်ကျင်ဘက်', 'Prefixes',
    [['disagree', 'not agree'], ['dislike', 'not like'], ['disappear', 'stop being seen']],
    [['disconnect', 'undo a connection'], ['dishonest', 'not honest']]),
  part('mis-', 'wrongly', 'မှားယွင်းစွာ', 'Prefixes',
    [['misspell', 'spell wrongly'], ['misread', 'read wrongly'], ['misuse', 'use wrongly']],
    [['miscount', 'count wrongly'], ['misplace', 'put in the wrong place']]),
  part('over-', 'too much', 'လွန်ကဲစွာ', 'Prefixes',
    [['overeat', 'eat too much'], ['oversleep', 'sleep too long'], ['overwork', 'work too much']],
    [['overcook', 'cook too long'], ['overpay', 'pay too much']]),
  part('sub-', 'under', 'အောက်', 'Prefixes',
    [['subway', 'a way under the ground'], ['submarine', 'a ship under the sea'], ['subtitle', 'words under a film']],
    [['subzero', 'under zero'], ['subheading', 'a heading under a heading']]),
  part('inter-', 'between', 'အကြား', 'Prefixes',
    [['international', 'between nations'], ['internet', 'a network between networks'], ['interview', 'a talk between people']],
    [['intercity', 'between cities'], ['interchange', 'an exchange between two']]),
  part('tele-', 'far away', 'အဝေးမှ', 'Prefixes',
    [['telephone', 'sound from far away'], ['television', 'pictures from far away'], ['telescope', 'see far away']],
    [['telework', 'work from far away']]),
  part('anti-', 'against', 'ဆန့်ကျင်သော', 'Prefixes',
    [['antivirus', 'against viruses'], ['antisocial', 'against other people'], ['anticlockwise', 'against the clock']],
    [['antiwar', 'against war'], ['antifreeze', 'against freezing']]),

  // Suffixes
  part('-ful', 'full of', 'ပြည့်နှက်သော', 'Suffixes',
    [['beautiful', 'full of beauty'], ['careful', 'full of care'], ['helpful', 'full of help']],
    [['colourful', 'full of colour'], ['peaceful', 'full of peace'], ['joyful', 'full of joy']]),
  part('-less', 'without', 'မဲ့သော', 'Suffixes',
    [['careless', 'without care'], ['homeless', 'without a home'], ['endless', 'without an end']],
    [['fearless', 'without fear'], ['sleepless', 'without sleep'], ['painless', 'without pain']]),
  part('-er', 'person who does it', 'လုပ်ဆောင်သူ', 'Suffixes',
    [['teacher', 'a person who teaches'], ['singer', 'a person who sings'], ['driver', 'a person who drives']],
    [['baker', 'a person who bakes'], ['swimmer', 'a person who swims'], ['runner', 'a person who runs']]),
  part('-able', 'can be done', '—နိုင်သော', 'Suffixes',
    [['washable', 'can be washed'], ['readable', 'can be read'], ['breakable', 'can be broken']],
    [['drinkable', 'can be drunk'], ['enjoyable', 'can be enjoyed']]),
  part('-ness', 'state of being', 'ခြင်း (အခြေအနေ)', 'Suffixes',
    [['happiness', 'being happy'], ['kindness', 'being kind'], ['darkness', 'being dark']],
    [['sadness', 'being sad'], ['weakness', 'being weak']]),
  part('-ly', 'in that way', '—စွာ', 'Suffixes',
    [['quickly', 'in a quick way'], ['slowly', 'in a slow way'], ['quietly', 'in a quiet way']],
    [['loudly', 'in a loud way'], ['kindly', 'in a kind way']]),
  part('-ist', 'person skilled in it', 'ပညာရှင် / ကျွမ်းကျင်သူ', 'Suffixes',
    [['artist', 'a person skilled in art'], ['scientist', 'a person skilled in science'], ['pianist', 'a person who plays the piano']],
    [['cyclist', 'a person who rides a bicycle'], ['guitarist', 'a person who plays the guitar']]),
  part('-tion', 'act of doing', 'ခြင်း (လုပ်ရပ်)', 'Suffixes',
    [['education', 'the act of educating'], ['information', 'the act of informing'], ['action', 'the act of doing']],
    [['invention', 'the act of inventing'], ['protection', 'the act of protecting']]),

  // Roots — from Latin and Greek, inside thousands of words
  part('bio', 'life', 'အသက် / သက်ရှိ', 'Roots',
    [['biology', 'the study of life'], ['biography', 'the story of a life'], ['antibiotic', 'medicine against living germs']],
    [['biodiversity', 'the variety of life'], ['biofuel', 'fuel made from living things']]),
  part('graph', 'write, draw', 'ရေးဆွဲခြင်း', 'Roots',
    [['autograph', 'a name written by yourself'], ['paragraph', 'a block of writing'], ['photograph', 'a picture drawn with light']],
    [['geography', 'writing about the earth'], ['graphic', 'a drawn picture']]),
  part('port', 'carry', 'သယ်ဆောင်ခြင်း', 'Roots',
    [['transport', 'carry across'], ['import', 'carry into a country'], ['export', 'carry out of a country']],
    [['portable', 'can be carried'], ['porter', 'a person who carries bags']]),
  part('vis', 'see', 'မြင်ခြင်း', 'Roots',
    [['vision', 'the power to see'], ['visible', 'can be seen'], ['visitor', 'a person who comes to see you']],
    [['visual', 'about seeing'], ['supervise', 'watch over others']]),
  part('aud', 'hear', 'ကြားခြင်း', 'Roots',
    [['audio', 'sound you hear'], ['audience', 'people who listen']],
    [['audible', 'can be heard'], ['auditorium', 'a hall for listening']]),
  part('phon', 'sound', 'အသံ', 'Roots',
    [['telephone', 'sound from far away'], ['microphone', 'makes small sounds louder'], ['phonics', 'letters and their sounds']],
    [['headphone', 'sound for your head'], ['symphony', 'sounds played together']])
];
