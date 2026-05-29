import { Game } from './server/gameLogic/Game.js';

const g = new Game([{uuid: '1', name: 'A', chipStack: 1000}, {uuid: '2', name: 'B', chipStack: 1000}]);
g.startGame();

let r = g.getCurrentRound();
console.log('H1 Start:', g.players.map(p => p.chipStack), 'Pot:', r.potManager.getTotal());

g.processAction('1', {type: 'fold'}); 

console.log('H1 End:', g.players.map(p => p.chipStack));

g.startNextRound();
r = g.getCurrentRound();
console.log('H2 Start:', g.players.map(p => p.chipStack), 'Pot:', r.potManager.getTotal());
