import { Game } from './server/gameLogic/Game.js';
const g = new Game([{uuid: '1', name: 'A', chipStack: 1000}, {uuid: '2', name: 'B', chipStack: 1000}]);
g.startGame();
let r = g.getCurrentRound();
// Rig the game so they tie.
g.processAction('1', {type: 'call', amount: 10});
g.processAction('2', {type: 'check'});
r.communityCards = [
  {suit: 'hearts', rank: 'A'}, {suit: 'hearts', rank: 'K'}, {suit: 'hearts', rank: 'Q'},
  {suit: 'hearts', rank: 'J'}, {suit: 'hearts', rank: 'T'} // royal flush on board
];
g.processAction('2', {type: 'check'}); // flop
g.processAction('1', {type: 'check'});
g.processAction('2', {type: 'check'}); // turn
g.processAction('1', {type: 'check'});
g.processAction('2', {type: 'check'}); // river
g.processAction('1', {type: 'check'}); // triggers showdown
console.log('Showdown Result:', g.players.map(p=>p.chipStack), r.result.potAwards);
