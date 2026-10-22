import React from 'react';

/* ---------------------------------------------------------------
   PART WORD
   ---------------------------------------------------------------
   Shows a word with one of its parts emphasised: "rewrite" with re,
   "careless" with less. Used by Word Parts, where the drill asks what
   the highlighted part means.

   A radical in Chinese or Japanese has no `kind`, and the character
   is rendered as-is — the radical cannot be underlined inside a glyph.
   --------------------------------------------------------------- */

function split(word, radical) {
  const part = radical.radical.replace(/-/g, '');
  if (!radical.kind || !part) return null;
  let at = -1;
  if (radical.kind === 'prefix' && word.startsWith(part)) at = 0;
  else if (radical.kind === 'suffix' && word.endsWith(part)) at = word.length - part.length;
  else if (radical.kind === 'root') at = word.indexOf(part);
  if (at < 0) return null;
  return [word.slice(0, at), word.slice(at, at + part.length), word.slice(at + part.length)];
}

export default function PartWord({ word, radical, color = '#4338CA' }) {
  const pieces = radical ? split(word, radical) : null;
  if (!pieces) return <>{word}</>;
  const [before, part, after] = pieces;
  return (
    <>
      {before}
      <span style={{ color, textDecoration: 'underline', textDecorationThickness: '0.08em', textUnderlineOffset: '0.12em' }}>{part}</span>
      {after}
    </>
  );
}
