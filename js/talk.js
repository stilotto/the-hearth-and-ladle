// What people say. Exchanges alternate speakers: A, B, A, B...
// Placeholders: {a} {b} speaker names, {x} someone else in the room,
// {adv} an adventurer, {party}, {bard}, {keeper}, {inn}, {town}, {town2},
// {lord}, {place}, {road}, {beasts}, {drink}.
import { pick, weighted } from './util.js';

// tags: ll local↔local, la local→adventurer, aa adventurers, kb keeper↔bar patron,
// st staff↔staff, rom sweethearts, riv rivals, drunk, rain, storm, clear,
// music, late, early, stranger (stranger present), advhere (adventurers present)
export const EXCHANGES = [
  { tags: 'll rain', lines: ['Wet enough for you, {b}?', "Wet? I've wrung out my hat twice.", "At least the {beasts} won't be out in this."] },
  { tags: 'll', lines: ['Hear about the {beasts} on {road}?', '{x} says they took a whole cart of turnips.', 'Turnips! What would {beasts} want with turnips?', 'Same as anyone. Soup.'] },
  { tags: 'll', lines: ['{lord} wants another tithe.', 'Another? For what this time?', 'New roof for the keep, they say.', "New roof for the wine cellar, more like."] },
  { tags: 'll', lines: ["This {drink}'s gone thin.", "It's the same as always.", "Then it's always been thin."] },
  { tags: 'll', lines: ['My knees say snow before the month is out.', 'Your knees said that last year.', 'And was I wrong?', 'It was midsummer, {a}.'] },
  { tags: 'll', lines: ["How's the barley looking?", 'Barley is fair. The beans are sulking.', 'Beans always sulk. Give them a stern word.'] },
  { tags: 'll', lines: ["They say there's gold under {place}.", 'They say a lot of things about {place}.', 'They say nobody comes back from it, too.', "Well. That's the rub, isn't it."] },
  { tags: 'll', lines: ['Did you ever pay {x} back for that goat?', 'Which goat?', 'You know which goat.'] },
  { tags: 'll', lines: ['{keeper} ought to hire another pair of hands.', 'Business that good?', 'Service that slow.'] },
  { tags: 'll', lines: ['Another round?', 'Does a duck swim? Go on, then.'] },
  { tags: 'll', lines: ['When I was young, this was all barley fields.', 'The inn was?', 'The inn was barley fields. We drank standing up.'] },
  { tags: 'll', lines: ["I'm thinking of taking up adventuring.", 'You? You get lost walking to the privy.', "That's what maps are for.", "You can't read, {a}."] },
  { tags: 'll stranger', lines: ["Who's the cloaked one in the corner?", 'Comes and goes. Never gives a name.', 'Probably wanted somewhere.', 'Probably just likes quiet. Mind your own ale.'] },
  { tags: 'll', lines: ['My cousin in {town2} saw a dragon once.', 'Your cousin in {town2} sees a lot of things after sundown.', 'Fair point.'] },
  { tags: 'll', lines: ["What's in the stew tonight?", 'Best not to ask.', 'I did ask.', 'And?', "{keeper} said 'meat'."] },
  { tags: 'll', lines: ['The priest says the end of days is coming.', 'The priest said that at midsummer, too.', "Maybe it's just running late."] },
  { tags: 'll', lines: ['Market day tomorrow.', "Then I'd best drink tonight. Can't abide haggling sober."] },
  { tags: 'll', lines: ['Found a coin in the river today. Crown on one side, skull on the other.', 'Throw it back.', 'Why?', 'Nothing with a skull on it ever brought anyone luck.'] },
  { tags: 'll', lines: ['Heard {x} is courting.', 'Courting who?', "Nobody knows. That's what makes it interesting."] },
  { tags: 'll', lines: ['Mill wheel broke again.', 'Third time since spring.', "Someone's cursed it.", "Someone's not greased it."] },
  { tags: 'll', lines: ['{beasts} took two sheep off the top pasture.', "Two? They're getting bolder.", 'Or hungrier.', 'Or both. Pass the bread.'] },
  { tags: 'll advhere', lines: ['Why do heroes always come here?', 'Best ale this side of {place}.', "It's the only ale this side of {place}.", "That's what I said."] },
  { tags: 'll', lines: ['Do you ever think about leaving {town}?', 'Every morning.', 'And?', 'And then I have breakfast.'] },
  { tags: 'll', lines: ['My grandmother saw the Drowned King once, rising out of the mere.', 'What did he look like?', 'Wet, mostly.'] },
  { tags: 'll', lines: ["{x}'s been in a foul mood all week.", "{x}'s been in a foul mood since the old king died.", 'Which king?', 'Exactly.'] },
  { tags: 'll', lines: ['Tax collector came by the forge today.', 'What did you give them?', 'A look. And then the coin, after the look wore off.'] },
  { tags: 'll', lines: ['I heard the bridge at {town2} washed out.', "Then we'll have travelers stuck here all week.", 'Good for {keeper}.', 'Bad for my seat by the fire.'] },
  { tags: 'll storm', lines: ["That thunder's right on top of us.", 'Gods are playing at skittles again.', 'Then someone up there is losing badly.'] },
  { tags: 'll clear', lines: ['Clear night. You can see the Lantern stars.', 'You can see them from here?', 'No. But I know they are there. It helps.'] },
  { tags: 'll late', lines: ['I should be getting home.', 'You said that an hour ago.', 'And I meant it then, too.'] },
  { tags: 'll late', lines: ["Is it that late already?", "It's that late, and later.", 'One more, then.', 'One more, then.'] },
  { tags: 'll music', lines: ["{bard}'s in fine voice tonight.", "Aye. Almost drowns out {x}'s singing."] },
  { tags: 'll music', lines: ['I know this one! The one about the drowned king.', "They're all about the drowned king.", 'Then I know all of them.'] },
  { tags: 'll music', lines: ['Dance with me, {b}.', 'I have two left feet.', 'Then we will go in circles. Come on.'] },
  { tags: 'drunk', lines: ["I love you, {b}. I do. You're my best friend.", "You've had enough, {a}.", "I've had JUST enough. That's different."] },
  { tags: 'drunk', lines: ['I could beat any of those sellswords at arm-wrestling.', 'Go on, then.', '...After this cup.'] },
  { tags: 'drunk', lines: ['Is the floor moving, or is it me?', "It's you, {a}.", 'Oh, thank the gods. I thought it was the floor.'] },
  { tags: 'drunk', lines: ['I am going to sing.', 'Please do not sing.', '♪ Ohhh the lass from the valley— ♪', 'And now they are singing.'] },

  { tags: 'la', lines: ['Where are you folk headed?', "{place}. There's a thing in the deep we've been paid to end.", 'Rather you than me.', 'Rather us than you too, friend.'] },
  { tags: 'la', lines: ['Is that a real sword?', 'Last I checked.', 'Ever killed anyone with it?', "Mostly cheese. It's a long road."] },
  { tags: 'la', lines: ["You're {party}? I've heard of you!", 'Good things, I hope.', 'Mostly that you owe money in {town2}.', '...Mostly good things, then.'] },
  { tags: 'la', lines: ['Watch the road north. {beasts} about.', "We've met a few.", 'And?', 'And now there are fewer.'] },
  { tags: 'la', lines: ['What does an adventurer do all day?', 'Walk. Walk some more. Get wet. Nearly die. Walk.', 'Sounds like farming.', 'With fewer turnips.'] },
  { tags: 'la', lines: ['Is it true what they say about {place}?', 'Depends what they say.', 'That the dead walk there.', "They don't walk. They sort of... lurch."] },

  { tags: 'aa', lines: ['How much further to {place}?', "Two days, if the map's honest.", 'Maps are never honest.', 'Then three.'] },
  { tags: 'aa', lines: ['You snore, you know.', 'I do not.', 'The bears complained, {b}.'] },
  { tags: 'aa', lines: ["When this is done, I'm buying a farm.", 'You said that after the last one.', "And the one before. I'll get there."] },
  { tags: 'aa', lines: ['Tell me again why we took this job.', 'Gold.', 'Right. Gold. Keep saying it.'] },
  { tags: 'aa', lines: ['That spell yesterday. Did you mean to set my cloak alight?', 'I meant to set the goblin alight.', 'The goblin was twenty feet away!', 'Aim is a matter of opinion.'] },
  { tags: 'aa dice', lines: ['Dice?', "Only if you don't cheat this time.", "I never cheat. I'm lucky.", 'Lucky with loaded bones.', 'Double sixes! Pay up!'] },
  { tags: 'aa', lines: ['To {party}!', 'To {party}!', 'And to coming home alive!'], loud: true },
  { tags: 'aa stranger', lines: ["I don't like the look of the one in the corner.", "You don't like the look of anyone.", "And I'm usually right."] },
  { tags: 'aa', lines: ['My back still hurts from that ogre.', 'It sat on you, {b}. What did you expect?', 'Sympathy?'] },
  { tags: 'aa', lines: ['Do you ever wonder if the monsters have inns?', 'Every night.', 'Do you think they tell stories about us?', 'Only the scary ones.'] },
  { tags: 'aa', lines: ['Split the gold four ways, same as always.', 'Five ways. The horse carried most of it.', 'The horse does not need gold.', 'The horse has earned it.'] },

  { tags: 'kb', lines: ['Quiet night, {keeper}?', 'Quiet? Ask me after the heroes start singing.'] },
  { tags: 'kb', lines: ['Put it on my slate, {keeper}.', 'Your slate is longer than my arm, {a}.', 'Then you have short arms.'] },
  { tags: 'kb', lines: ['Any news from the road?', "Carter says there's {beasts} on {road}. Folk are going round by {town2}.", 'Good for trade, then.', 'Good for trade.'] },
  { tags: 'kb', lines: ['Is it true you once threw a troll out of here, {keeper}?', 'It wanted a room without paying.', 'And?', 'It paid.'] },
  { tags: 'kb', lines: ["What's the best thing you've ever served, {keeper}?", 'A king, once. In disguise.', 'How did you know?', 'He tipped.'] },

  { tags: 'st', lines: ['Table by the fire wants more bread.', 'Table by the fire always wants more bread.'] },
  { tags: 'st', lines: ['{keeper}, the cellar is flooding again.', 'Put a bucket under it.', 'The bucket is floating.'] },
  { tags: 'st', lines: ["We're low on the {drink}.", 'Then water the— I mean, fetch another barrel.'] },
  { tags: 'st', lines: ['Busy tonight.', "Busy's good. Busy pays the roof."] },

  { tags: 'rom', lines: ['You look lovely tonight.', "It's the candlelight.", "It's you."] },
  { tags: 'rom', lines: ['Walk me home later?', 'Only if we take the long way.', "It's the only way that goes past the river."] },
  { tags: 'rom', lines: ['Everyone is looking at us.', 'Let them look.'] },

  { tags: 'riv', lines: ['Still selling that sour cider, {b}?', 'Still drinking it, {a}?'], sour: true },
  { tags: 'riv', lines: ['Your dog was in my garden again.', 'My dog has better taste than your cabbages suggest.'], sour: true },
  { tags: 'riv', lines: ["You've got a nerve, sitting there.", "It's a free bench, {a}.", 'Nothing about you is free. Ask anyone.'], sour: true },
];

export const SOLO = {
  keeper: ["Who's for another?", 'Mind the step, it gets slick!', 'Coming, coming!', 'Wipe your boots!', 'Where did I put that ladle?'],
  maid: ['Coming through!', 'Mind your elbows!', 'One ale, one stew, one ale...', 'Hot plate!'],
  potboy: ['*sweep sweep*', 'Who spills this much?', 'Mind the broom!'],
  stranger: ['...', 'Rain on the road. Blood on the wind.', 'Too many ears in this room.', 'Not yet.', '*draws on a pipe*'],
  drunk: ['*hic*', "Wha' was I saying...", "I'm not drunk. The floor is.", 'Everyone here is lovely. Lovely.'],
  thirsty: ["Where's my ale got to?", 'Throat as dry as a crypt.'],
  hungry: ['I could eat a whole pig.', 'Something smells good.'],
  local: ['Hm.', 'Long day.', '*yawns*', 'Good fire tonight.', 'Ah, that hits the spot.'],
  adventurer: ['*checks a map*', '*sharpens a blade*', 'Two days to {place}...'],
};

export const ORDER_ASK = ["What'll it be?", 'What are you having?', 'Name your poison.', 'Same again?'];
export const ORDER_SAY = {
  ale: ['Ale, and plenty of it.', 'A {drink}, please.', "Whatever's cold."],
  wine: ["Wine, if you've any that isn't vinegar.", 'Red. The good jug.'],
  stew: ["Bowl of stew. Whatever's in it.", 'Something hot, please.'],
};
export const GREET = {
  local: ['Evening, {b}! The usual?', '{b}! Shut that door, the weather is getting in.', 'Well, look who it is! Evening, {b}.'],
  traveler: ['Welcome, friend! Hot food, cold ale, dry beds.', 'Come in, come in, out of the {weather}.'],
  adventurer: ['Welcome, travelers! Mind your swords on the lintel.', 'Heroes! Rooms are a silver a head.'],
};

const hasTag = (e, t) => (' ' + e.tags + ' ').includes(' ' + t + ' ');

// ctx: { weather, music, late, strangerHere, advHere, rel(a,b) }
export function pickExchange(a, b, ctx) {
  const cands = [];
  for (const [p, q] of [[a, b], [b, a]]) {
    const rel = ctx.rel(p, q);
    for (const e of EXCHANGES) {
      if (!fits(e, p, q, ctx, rel)) continue;
      cands.push({ e, first: p, second: q, w: weight(e, p, q, rel) });
    }
  }
  if (!cands.length) return null;
  return weighted(cands, (c) => c.w);
}

const isAdv = (x) => x.role === 'adventurer';
const isStaff = (x) => ['keeper', 'maid', 'potboy', 'cook'].includes(x.role);
const isPatron = (x) => !isAdv(x) && !isStaff(x) && x.role !== 'stranger' && x.role !== 'cat';

function fits(e, p, q, ctx, rel) {
  const t = e.tags.split(' ');
  for (const tag of t) {
    switch (tag) {
      case 'll': if (!(isPatron(p) && isPatron(q)) && !(isPatron(p) && q.role === 'bard') && !(p.role === 'bard' && isPatron(q))) return false; break;
      case 'la': if (!(isPatron(p) && isAdv(q))) return false; break;
      case 'aa': if (!(isAdv(p) && isAdv(q))) return false; break;
      case 'kb': if (!(q.role === 'keeper' && (isPatron(p) || isAdv(p) || p.role === 'bard'))) return false; break;
      case 'st': if (!(p.role === 'maid' && q.role === 'keeper')) return false; break;
      case 'rom': if (!(p.love === q.id)) return false; break;
      case 'riv': if (!(rel < -0.3)) return false; break;
      case 'drunk': if (!(p.drunk > 0.45) || isStaff(q)) return false; break;
      case 'rain': if (ctx.weather === 'clear') return false; break;
      case 'storm': if (ctx.weather !== 'storm') return false; break;
      case 'clear': if (ctx.weather !== 'clear' || !ctx.dark) return false; break;
      case 'music': if (!ctx.music) return false; break;
      case 'late': if (!ctx.late) return false; break;
      case 'stranger': if (!ctx.strangerHere) return false; break;
      case 'advhere': if (!ctx.advHere) return false; break;
    }
  }
  if (e.lines.join(' ').includes('{x}') && !ctx.hasX) return false;
  if (e.lines.join(' ').includes('{bard}') && !ctx.bard) return false;
  return true;
}

function weight(e, p, q, rel) {
  let w = 1;
  if (hasTag(e, 'rom')) w = 6;
  if (hasTag(e, 'riv')) w = 5;
  if (hasTag(e, 'drunk')) w = 3;
  if (hasTag(e, 'music') || hasTag(e, 'storm') || hasTag(e, 'late')) w = 2.5;
  if (e.used) w *= 0.15;
  return w;
}

export const pickLine = (arr) => pick(arr);
