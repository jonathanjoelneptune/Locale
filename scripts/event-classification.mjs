const NIGHTLIFE=/\b(?:dj|d\.j\.|rave|nightclub|club night|dance party|dance night|afterparty|after party|after dark|karaoke|trivia|silent disco|reggaeton party|emo night|throwback night|21\+|late night)\b/i;

export function classifyEvent(...parts){
  const text=parts.flat(Infinity).filter(Boolean).join(" ");
  if(NIGHTLIFE.test(text))return "nightlife";
  if(/\b(?:food|dining|culinary|coffee|tasting|pantry|sake|tea)\b/i.test(text))return "food";
  if(/\b(?:festival|fest|fair|celebration|homecoming|expo|parade|fete)\b/i.test(text))return "festival";
  if(/\b(?:theat(?:er|re)|play|dance performance|performance|film|cinema|screening|exhibit|gallery|art)\b/i.test(text))return "theater";
  if(/\b(?:soccer|basketball|baseball|volleyball|water polo|athletic|sports?|game|match|race|run|swim)\b/i.test(text))return "sports";
  if(/\b(?:concert|music|orchestra|choir|band|opera|electronic|house|techno|hip-hop|hip hop|rock|jazz|country|acoustic)\b/i.test(text))return "music";
  if(/\b(?:comedy|comedian|stand-up|stand up)\b/i.test(text))return "comedy";
  if(/\b(?:family|children|kids?)\b/i.test(text))return "family";
  return "community";
}

export function isNightlife(...parts){
  return NIGHTLIFE.test(parts.flat(Infinity).filter(Boolean).join(" "));
}
