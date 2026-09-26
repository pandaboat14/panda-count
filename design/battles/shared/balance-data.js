// Simulated with the prototype engine (400 computer-vs-computer battles each) against the current Risk rules.
const BALANCE = [
 {
  "name": "5 Pandas vs 5 Pandas",
  "why": "Mirror match: should track Risk.",
  "newWin": 0.17,
  "oldWin": 0.16,
  "rounds": 5,
  "atkLost": 4.4,
  "defLost": 1.7
 },
 {
  "name": "4 Ogres vs 3 Ogre natives",
  "why": "Ogres guard badly, as today.",
  "newWin": 0.95,
  "oldWin": 0.98,
  "rounds": 2.5,
  "atkLost": 1.2,
  "defLost": 3
 },
 {
  "name": "6 Armed Pandas vs 4 behind a Fort",
  "why": "Forts still hold.",
  "newWin": 0.05,
  "oldWin": 0.09,
  "rounds": 6.6,
  "atkLost": 5.9,
  "defLost": 1
 },
 {
  "name": "6 Armed Pandas with Spears vs 4 behind a Fort",
  "why": "Skewer ignores the Fort.",
  "newWin": 0.09,
  "oldWin": 0.09,
  "rounds": 6,
  "atkLost": 5.7,
  "defLost": 1.3
 },
 {
  "name": "Sichuan: 4 Armed Pandas + 3 Ogres vs the Panda Nation",
  "why": "A classic early invasion.",
  "newWin": 0.6,
  "oldWin": 0.52,
  "rounds": 8.7,
  "atkLost": 4.4,
  "defLost": 7.4
 },
 {
  "name": "10 mixed vs 10 mixed",
  "why": "Big even war.",
  "newWin": 0.56,
  "oldWin": 0.57,
  "rounds": 11.6,
  "atkLost": 7.8,
  "defLost": 8.1
 },
 {
  "name": "5 Armed Pandas vs 5 Pandas",
  "why": "Steel beats Fluff.",
  "newWin": 0.79,
  "oldWin": 0.5,
  "rounds": 4.8,
  "atkLost": 2,
  "defLost": 4.2
 },
 {
  "name": "3 CAMs vs 3 Ogre natives",
  "why": "Glam beats Brute.",
  "newWin": 0.99,
  "oldWin": 0.94,
  "rounds": 1.9,
  "atkLost": 0.1,
  "defLost": 3
 },
 {
  "name": "3 Ogres vs 2 CAM natives",
  "why": "Brute is weak to Glam.",
  "newWin": 0.29,
  "oldWin": 0.66,
  "rounds": 1.7,
  "atkLost": 2.4,
  "defLost": 1
 },
 {
  "name": "8 Pandas vs 3 CAMs",
  "why": "Fluff beats Glam.",
  "newWin": 0.46,
  "oldWin": 0.36,
  "rounds": 6.3,
  "atkLost": 6.1,
  "defLost": 1.9
 },
 {
  "name": "Casey + 3 Armed Pandas vs 8 Pandas",
  "why": "A god is a god.",
  "newWin": 1,
  "oldWin": 0.92,
  "rounds": 3.8,
  "atkLost": 0.1,
  "defLost": 8
 }
];
