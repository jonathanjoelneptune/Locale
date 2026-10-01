const RULES=[
  ["music",{
    title:/\b(?:concert|music|quartet|trio|ensemble|orchestra|symphony|philharmonic|choir|band|opera|jazz|blues|rock|punk|metal|hip[- ]?hop|country|acoustic|singer|songwriter|guitar|piano|violin|album release|tribute band)\b/i,
    context:/\b(?:music|concert|musician|quartet|trio|ensemble|orchestra|symphony|philharmonic|choir|band|opera|jazz|blues|rock|punk|metal|hip[- ]?hop|country|acoustic|electronic music|live music|Belly Up|Music Box|Casbah|House of Blues|Observatory North Park|Rady Shell|SOMA|Brick by Brick|Soda Bar|The Sound|Til-Two Club)\b/i
  }],
  ["sports",{
    title:/\b(?:soccer|basketball|baseball|softball|football|hockey|volleyball|water polo|tennis|golf|sports?|match|race|marathon|5k|10k|run|swim|surf|wrestling|boxing|mma)\b/i,
    context:/\b(?:sports?|athletic|soccer|basketball|baseball|softball|football|hockey|volleyball|water polo|tennis|golf|match|race|marathon|swim|surf|wrestling|boxing|mma)\b/i
  }],
  ["comedy",{
    title:/\b(?:comedy|comedian|stand[- ]?up)\b/i,
    context:/\b(?:comedy|comedian|stand[- ]?up|Comedy Store|Mic Drop Comedy)\b/i
  }],
  ["nightlife",{
    title:/\b(?:dj|d\.j\.|rave|club night|dance party|dance night|afterparty|after party|karaoke|silent disco|reggaeton|emo night|throwback night|late night|21\+)\b/i,
    context:/\b(?:nightclub|nightlife|dj|rave|club night|dance party|afterparty|karaoke|silent disco|reggaeton|emo night|late night|NOVA SD|Spin Nightclub)\b/i
  }],
  ["festival",{
    title:/\b(?:festival|fest|oktoberfest|fair|parade|fete|carnival|street fair|holiday market|haunted trail|haunted house)\b/i,
    context:/\b(?:festival|fest|fair|parade|fete|carnival|street fair|seasonal celebration)\b/i
  }],
  ["theater",{
    title:/\b(?:theat(?:er|re)|musical|play|ballet|dance performance|film|cinema|screening|exhibit|exhibition|gallery|art show|art walk)\b/i,
    context:/\b(?:arts?\s*&\s*theat(?:er|re)|theat(?:er|re)|stage|performing arts|dance performance|film|cinema|screening|exhibit|exhibition|gallery|museum)\b/i
  }],
  ["food",{
    title:/\b(?:food|dining|culinary|brunch|dinner|tasting|wine tasting|beer tasting|coffee|tea party|supper|restaurant week)\b/i,
    context:/\b(?:food|dining|culinary|chef|restaurant|tasting|wine|brewery|coffee|tea)\b/i
  }],
  ["family",{
    title:/\b(?:family|families|kids?|children|childrens|toddler|youth|pumpkin patch|storytime)\b/i,
    context:/\b(?:family friendly|for families|for kids|children|childrens|toddler|youth program|storytime)\b/i
  }]
];

const NIGHTLIFE=RULES.find(([name])=>name==="nightlife")[1].context;

export function classifyEvent(title,...parts){
  const headline=String(title||"");
  const context=parts.flat(Infinity).filter(Boolean).join(" ");
  let best={category:"community",score:0,index:RULES.length};
  RULES.forEach(([category,rule],index)=>{
    let score=0;
    if(rule.title.test(headline))score+=6;
    if(rule.context.test(context))score+=2;
    if(rule.context.test(headline))score+=1;
    if(score>best.score||(score===best.score&&score>0&&index<best.index))best={category,score,index};
  });
  return best.category;
}

export function refineEventCategory(event={}){
  if(!["community","family","other"].includes(event.category||"community"))return event.category||"community";
  return classifyEvent(event.title,event.description,event.venue,event.source,event.tags,event.subcategories);
}

export function isNightlife(...parts){
  return NIGHTLIFE.test(parts.flat(Infinity).filter(Boolean).join(" "));
}
