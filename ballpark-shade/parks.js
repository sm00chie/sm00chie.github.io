// Coordinates, bearing and field distances: MLB venue API, retrieved 2026-09-10.
// Deck dimensions, canopies and seating divisions are estimates, NOT surveyed data.
const pacific = 'America/Los_Angeles';
export const parks = [
  {id:'petco',name:'Petco Park',city:'San Diego',state:'CA',team:'Padres',teamId:135,venueId:2680,latitude:32.707861,longitude:-117.157278,bearing:0,timeZone:pacific,
    field:[336,386,396,391,322],levels:[{name:'Field',r:51,h:2,d:22,base:100},{name:'Terrace',r:70,h:15,d:17,base:200},{name:'Upper',r:87,h:29,d:19,base:300}],canopy:{from:3,to:20,inner:92,outer:111,h:46},
    notes:'Three estimated infield decks, an upper canopy and a simplified Western Metal building. Outfield seating and nearby city buildings are not included.'},
  {id:'dodger',name:'Dodger Stadium',city:'Los Angeles',state:'CA',team:'Dodgers',teamId:119,venueId:22,latitude:34.07368,longitude:-118.24053,bearing:26,timeZone:pacific,
    field:[330,385,395,385,330],levels:[{name:'Field',r:53,h:2,d:24,base:0},{name:'Loge',r:73,h:17,d:18,base:100},{name:'Reserve',r:90,h:31,d:21,base:200},{name:'Top Deck',r:105,h:45,d:12,base:300,from:8,to:15}],
    notes:'Four estimated infield deck levels, with a smaller top deck and simplified outfield pavilions and pavilion roofs. Pavilion roofs have illustrative waves; their true profile, columns and uneven terrain are not measured. Section labels are illustrative divisions, not ticket-map section boundaries.'},
  {id:'oracle',name:'Oracle Park',city:'San Francisco',state:'CA',team:'Giants',teamId:137,venueId:2395,latitude:37.778383,longitude:-122.389448,bearing:85,timeZone:pacific,
    field:[339,399,391,415,309],levels:[{name:'Field',r:50,h:2,d:23,base:100},{name:'Club',r:70,h:17,d:16,base:200},{name:'View',r:86,h:30,d:20,base:300}],canopy:{from:5,to:18,inner:100,outer:110,h:45},
    notes:'Three estimated infield decks, a narrow upper canopy, an asymmetric outfield and a simplified right-field wall. Arcade and bleacher seats, columns and surrounding buildings are not included. Section labels are illustrative divisions, not ticket-map section boundaries.'},
];
export const activePark = parks[0];
