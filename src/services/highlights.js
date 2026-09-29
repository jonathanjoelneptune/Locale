const CATEGORY_WEIGHT={festival:22,sports:18,music:15,theater:13,comedy:12,community:11,family:10,food:9,nightlife:8,other:6};
const MAJOR=[
 [/world series|wild card|playoffs?|championship|finals?|all[- ]star|super bowl|world cup|opening day/i,42],
 [/air show|comic[- ]con|pride|marathon|half marathon|parade|street fair|oktoberfest/i,32],
 [/festival|fair|rodeo|grand prix|tournament|expo|convention/i,20],
 [/touring|tour\b|live\b/i,8]
];
const ROUTINE=/stadium tour|farmers'? market|mercato|food truck market|weekly|every (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i;
const esc=s=>String(s??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

export function highlightScore(e,now=new Date()){
 let score=CATEGORY_WEIGHT[e.category]||CATEGORY_WEIGHT.other;
 const text=`${e.title} ${e.description||""}`;
 for(const [re,n] of MAJOR)if(re.test(text)){score+=n;break}
 if(e.featured)score+=18;
 if(e.image)score+=5;
 if(e.source==="City of San Diego")score+=4;
 if(e.price)score+=2;
 if(ROUTINE.test(text))score-=16;
 const hours=(new Date(e.start)-now)/36e5;
 if(hours>=-3&&hours<=4)score+=18;
 else if(hours>4&&hours<=12)score+=13;
 else if(hours>12&&hours<=30)score+=8;
 else if(hours>30&&hours<=72)score+=4;
 const d=Number(e.distance);
 if(Number.isFinite(d))score+=Math.max(0,12-Math.min(12,d*.8));
 return Math.round(score*10)/10;
}

export function rankHighlights(events,{limit=4,now=new Date()}={}){
 const ranked=events.map(e=>({...e,highlightScore:highlightScore(e,now)}))
   .sort((a,b)=>b.highlightScore-a.highlightScore||new Date(a.start)-new Date(b.start)||a.distance-b.distance);
 const chosen=[],categories=new Map(),venues=new Map();
 for(const e of ranked){
   if(chosen.length>=limit)break;
   const cat=categories.get(e.category)||0,venue=esc(e.venue),vc=venues.get(venue)||0;
   if(cat>=2||vc>=1)continue;
   chosen.push(e);categories.set(e.category,cat+1);venues.set(venue,vc+1);
 }
 if(chosen.length<limit){
   for(const e of ranked){
     if(chosen.length>=limit)break;
     if(chosen.some(x=>x.id===e.id))continue;
     const venue=esc(e.venue);if((venues.get(venue)||0)>=2)continue;
     chosen.push(e);venues.set(venue,(venues.get(venue)||0)+1);
   }
 }
 return chosen;
}
