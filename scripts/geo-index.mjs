export const cellFor=(lat,lng,resolution=100)=>`${Math.floor((Number(lat)+90)*resolution)}:${Math.floor((Number(lng)+180)*resolution)}`;
export const boundsForRadius=(center,miles)=>{const latDelta=miles/69,lngDelta=miles/(69*Math.max(.15,Math.cos(center.lat*Math.PI/180)));return{south:center.lat-latDelta,north:center.lat+latDelta,west:center.lng-lngDelta,east:center.lng+lngDelta}};
export const inBounds=(p,b)=>p.lat>=b.south&&p.lat<=b.north&&p.lng>=b.west&&p.lng<=b.east;
