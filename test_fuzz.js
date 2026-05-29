import { Game } from './server/gameLogic/Game.js';
const g = new Game([{uuid: '1', name: 'A', chipStack: 1000}, {uuid: '2', name: 'B', chipStack: 1000}]);
g.startGame();

function runRandomAction(game) {
  const r = game.getCurrentRound();
  if (!r) return;
  const s = r.getCurrentStreet();
  if (!s) return;
  const uuid = s.getCurrentPlayerUUID();
  const valid = s.getValidActions(uuid);
  const actionType = valid[Math.floor(Math.random() * valid.length)];
  let amount = 0;
  if (actionType === 'raise' || actionType === 'bet') {
      const call = s.getCallAmount(uuid);
      amount = (s.currentBet || 0) + call + 10;
  }
  game.processAction(uuid, { type: actionType, amount });
}

let startChips = 2000;
for (let i = 0; i < 1000; i++) {
  if (g.status === 'finished') {
    g.handleRebuy('1'); g.handleRebuy('2');
    g.startGame();
  }
  while (g.getCurrentRound() && !g.getCurrentRound().isFinished) {
    runRandomAction(g);
  }
  if (g.getCurrentRound() && g.getCurrentRound().isFinished) {
    const total = g.players.reduce((sum, p) => sum + p.chipStack, 0);
    if (total !== 2000) {
      console.log(`Mismatch at hand ${i}! Total = ${total}`);
      console.log(g.getCurrentRound().serialize());
      break;
    }
    g.startNextRound();
  }
}
console.log('Test complete. Final chips:', g.players.reduce((sum, p) => sum + p.chipStack, 0));
