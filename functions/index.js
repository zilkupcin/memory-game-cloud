const functions = require("firebase-functions");
const admin = require('firebase-admin');
admin.initializeApp();

const db = getFirestore();

exports.createGame = functions.https.onCall(async (data, context) => {
  const size = parseInt(data.size);
  const maxPlayers = parseInt(data.maxPlayers);
  const writeResult = await admin.firestore().collection('game').add(
    {
      finished: false,
      started: false,
      owner: context.auth.uid,
      maxPlayers: maxPlayers,
      players: [
        {
          playerId: context.auth.uid,
          score: 0,
          playerPresent: true
        }
      ]
    }
  );
    
  return {result: `Game with ID: ${writeResult.id} added.`};
});

exports.joinGame = functions.https.onCall(async (data, context) => {
  const gameId = data.gameId;

  const gameRef = collection(db, "cities");
  const playerGames = query(gameRef, where("finished", "==", false), where("players", "array-contains", context.auth.uid));
  const querySnapshot = await getDocs(playerGames);
});