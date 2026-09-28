import {it,expect,vi,afterEach} from 'vitest';
vi.mock('../modules/gamification.js',()=>({awardXP:()=>{}}));
vi.mock('../core/i18n.js',()=>({t:key=>key}));
import {init,loadCommunityDecks} from '../modules/community.js';
afterEach(()=>vi.unstubAllGlobals());
it('renders an already stored malicious cardsCount as a number instead of HTML',async()=>{
  const cards=[];
  const container={innerHTML:'',appendChild:card=>cards.push(card)};
  vi.stubGlobal('window',{_fbUserId:'reader'});
  vi.stubGlobal('document',{
    getElementById:id=>id==='community-decks-container'?container:null,
    createElement:()=>({className:'',innerHTML:''}),
  });
  const snapshot={forEach:fn=>fn({id:'safe-id',data:()=>({ownerId:'other',name:'Deck',subject:'Math',cardsCount:'<img src=x onerror=alert(1)>',authorName:'Author'})})};
  init({getDB:()=>({collection:()=>({get:async()=>snapshot})})});
  await loadCommunityDecks();
  expect(cards).toHaveLength(1);
  expect(cards[0].innerHTML).toContain('0 carte');
  expect(cards[0].innerHTML).not.toContain('onerror');
});
