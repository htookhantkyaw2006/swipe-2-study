import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSavedWordRecord, findSavedWord, studyWordKey } from '../src/lib/studyWords.js';

test('Dictionary sense identity: distinct Japanese N5 homonym senses remain independent', () => {
  // Two distinct senses of Japanese N5 word キロ
  const kiroKmCard = {
    id: 'ja-n5-0100',
    card_id: 'ja-n5-0100',
    sense_id: 'ja-n5-0100',
    character: 'キロ',
    phrase: 'キロ',
    pronunciation: 'キロ',
    kana: 'キロ',
    definition: 'kilometer',
    burmese_definition: 'ကီလိုမီတာ',
  };

  const kiroKgCard = {
    id: 'ja-n5-0101',
    card_id: 'ja-n5-0101',
    sense_id: 'ja-n5-0101',
    character: 'キロ',
    phrase: 'キロ',
    pronunciation: 'キロ',
    kana: 'キロ',
    definition: 'kilogram',
    burmese_definition: 'ကီလိုဂရမ်',
  };

  // 1. Verify studyWordKey generates distinct disambiguated keys for each sense
  const kmKey = studyWordKey(kiroKmCard);
  const kgKey = studyWordKey(kiroKgCard);
  assert.notEqual(kmKey, kgKey, 'studyWordKey must produce distinct keys for different senses of キロ');

  // 2. Build saved word records
  const recordKm = buildSavedWordRecord(kiroKmCard);
  const recordKg = buildSavedWordRecord(kiroKgCard);

  assert.equal(recordKm.card_id, 'ja-n5-0100');
  assert.equal(recordKg.card_id, 'ja-n5-0101');
  assert.equal(recordKm.sense_id, 'ja-n5-0100');
  assert.equal(recordKg.sense_id, 'ja-n5-0101');

  // 3. Simulate saved_words store with only sense 1 (km) saved
  const savedList1 = [
    { id: 'uuid-1', ...recordKm },
  ];

  // Sense 1 is found, sense 2 is NOT found
  const foundKm = findSavedWord(savedList1, kiroKmCard);
  const foundKg = findSavedWord(savedList1, kiroKgCard);
  assert.ok(foundKm !== null, 'Sense 1 (km) must be found in saved_words');
  assert.equal(foundKg, null, 'Sense 2 (kg) must NOT match when only sense 1 is saved');

  // 4. Save both senses simultaneously
  const savedListBoth = [
    { id: 'uuid-1', ...recordKm },
    { id: 'uuid-2', ...recordKg },
  ];

  const matchedKm = findSavedWord(savedListBoth, kiroKmCard);
  const matchedKg = findSavedWord(savedListBoth, kiroKgCard);

  assert.equal(matchedKm.id, 'uuid-1', 'km matches its exact storage record');
  assert.equal(matchedKg.id, 'uuid-2', 'kg matches its exact storage record');

  // 5. Unsaving sense 1 leaves sense 2 intact
  const afterUnsaveKm = savedListBoth.filter(item => item.id !== matchedKm.id);
  assert.equal(findSavedWord(afterUnsaveKm, kiroKmCard), null, 'Sense 1 is now unsaved');
  assert.equal(findSavedWord(afterUnsaveKm, kiroKgCard)?.id, 'uuid-2', 'Sense 2 remains saved and unaffected');
});

test('Dictionary sense identity: ordinary words retain 4-part identity without false discrimination', () => {
  const ordinaryCard = {
    id: 'ja-n5-0010',
    character: 'あそこ',
    phrase: 'あそこ',
    pronunciation: 'あそこ',
    definition: 'there',
  };

  const savedRecord = buildSavedWordRecord(ordinaryCard);
  const key = studyWordKey(ordinaryCard);

  // Ordinary word has standard 2-part key [written, pronunciation]
  assert.deepEqual(JSON.parse(key), ['あそこ', 'あそこ']);

  const savedList = [{ id: 'storage-1', ...savedRecord }];
  const match = findSavedWord(savedList, ordinaryCard);
  assert.ok(match !== null, 'Ordinary word matches reliably');
});

