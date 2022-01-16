const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {
  generateEmptyGrid,
  generateSolution,
  buildGameTemplate,
} = require("./util");

admin.initializeApp();

exports.restartGame = functions.https.onCall(async (data, context) => {
  // Find the game with given ID
  let gameRef = await admin.firestore().collection("game").doc(data.gameId);

  // Get a snapshot of data for later use
  const gameSnap = await gameRef.get();

  // Check if the function caller is the host of the game
  if (gameSnap.get("host") != context.auth.uid) {
    throw new functions.https.HttpsError(
      "not-host",
      "You are not the host of the game"
    );
  }

  // Get some game related data
  const size = gameSnap.get("grid").length;
  const gameType = gameSnap.get("gameType");
  const maxPlayers = gameSnap.get("maxPlayers");
  const gameGrid = generateEmptyGrid(Math.sqrt(size));

  // Create a new game from a template
  const newGameRef = await admin
    .firestore()
    .collection("game")
    .add(buildGameTemplate(maxPlayers, gameType, gameGrid, context.auth.uid));

  // Generate a solution for a new game
  await admin
    .firestore()
    .collection("solution")
    .add({
      game: newGameRef.id,
      grid: generateSolution(gameGrid, Math.sqrt(size), gameType),
    });

  // Finish the old game and set a new game ID
  // so users are redirected to a new game
  await gameRef.set(
    { nextGame: newGameRef.id, finished: true },
    { merge: true }
  );

  return true;
});

exports.setReady = functions.https.onCall(async (data, context) => {
  // Get the current game by ID
  let gameRef = await admin.firestore().collection("game").doc(data.gameId);

  // Get a snapshot of data for later use
  const gameSnap = await gameRef.get();

  // Get some game data
  const players = gameSnap.get("players");
  let started = gameSnap.get("started");
  const thisPlayer = players.find((player) => player.id === context.auth.uid);

  // Perform validation
  if (gameSnap.get("finished")) {
    throw new functions.https.HttpsError(
      "game-finished",
      "The game has been completed"
    );
  } else if (started) {
    throw new functions.https.HttpsError(
      "game-started",
      "The game has already started"
    );
  } else if (!thisPlayer) {
    throw new functions.https.HttpsError(
      "not-in-this-game",
      "You're not in this game"
    );
  }

  // Toggle player's ready state
  thisPlayer.isReady = !thisPlayer.isReady;

  // Check if there are any players that aren't ready
  const notReadyPlayers = players.find((player) => player.isReady === false);

  // // If there aren't any - start the game
  if (!notReadyPlayers && players.length === gameSnap.get("maxPlayers")) {
    started = true;
  }

  // Update the game data
  await gameRef.set({ players, started }, { merge: true });
  return true;
});

exports.createGame = functions.https.onCall(async (data, context) => {
  const maxPlayers = parseInt(data.maxPlayers);
  const size = parseInt(data.size);
  const gameType = data.gameType;
  const validSizes = [4, 6];
  const validGameTypes = ["icons", "numbers"];

  // Perform validation
  if (typeof maxPlayers !== "number" || typeof size !== "number") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "One or more arguments is of invalid data type"
    );
  } else if (!validSizes.includes(size) || maxPlayers > 4 || maxPlayers < 1) {
    throw new functions.https.HttpsError("One or more parameters is invalid");
  } else if (!validGameTypes.includes(gameType)) {
    throw new functions.https.HttpsError(
      "invalid-game-type",
      "Provided game type is invalid"
    );
  }

  // Generate a new, empty grid
  const gameGrid = generateEmptyGrid(size);

  // Create a new game document
  const gameRef = await admin
    .firestore()
    .collection("game")
    .add(buildGameTemplate(maxPlayers, gameType, gameGrid, context.auth.uid));

  // Create a new solution document
  await admin
    .firestore()
    .collection("solution")
    .add({
      game: gameRef.id,
      grid: generateSolution(gameGrid, size, gameType),
    });

  return gameRef.id;
});

exports.guess = functions.https.onCall(async (data, context) => {
  // Find the current game
  let currentGameRef = await admin
    .firestore()
    .collection("game")
    .doc(data.gameId);

  // Get the game's snapshot for later use
  const currentGameSnap = await currentGameRef.get();

  // Perform validation
  if (!currentGameSnap.get("players")) {
    throw new functions.https.HttpsError(
      "game-does-not-exist",
      "A game with this ID does not exists"
    );
  } else if (!currentGameSnap.get("started")) {
    throw new functions.https.HttpsError(
      "game-started",
      "The game has already started"
    );
  } else if (currentGameSnap.get("currentTurn").player !== context.auth.uid) {
    throw new functions.https.HttpsError(
      "not-your-turn",
      "It's not your turn yet"
    );
  } else if (currentGameSnap.get("grid")[data.index] !== -1) {
    throw new functions.https.HttpsError(
      "not-empty",
      "Please select a new bubble"
    );
  }

  // Get all solutions for the game ID
  const solutionRefs = await admin
    .firestore()
    .collection("solution")
    .where("game", "==", data.gameId)
    .get();

  // Store the references in an array
  const foundRefs = [];
  solutionRefs.forEach((ref) => {
    foundRefs.push(ref);
  });

  // The solution object is always the 1st one in the array
  const solution = foundRefs[0];

  const solutionGrid = solution.get("grid");
  const number = solutionGrid[data.index];

  const currentTurn = currentGameSnap.get("currentTurn");
  const players = currentGameSnap.get("players");
  const grid = currentGameSnap.get("grid");
  let finished = currentGameSnap.get("finished");

  // Check how many guesses the player made during this turn
  if (currentTurn.selection.length < 2) {
    // Check if the player selected a non-empty bubble
    if (
      currentTurn.player === context.auth.uid &&
      currentTurn.selection[0] === data.index
    ) {
      throw new functions.https.HttpsError(
        "not-empty",
        "Please select a new bubble"
      );
    }

    // Track current selection
    currentTurn.selection.push(data.index);

    // Check if this was the player's 2nd (final) selection of the turn
    if (currentTurn.selection.length === 2) {
      // Find the player's object
      const currentPlayer = players.find((player) => {
        return player.id === context.auth.uid;
      });

      // Check if player's guess is correct
      if (
        solutionGrid[currentTurn.selection[0]] ===
        solutionGrid[currentTurn.selection[1]]
      ) {
        // Increase player's score
        currentPlayer.score = currentPlayer.score + 1;

        // Update grid
        grid[currentTurn.selection[0]] = solutionGrid[currentTurn.selection[0]];
        grid[currentTurn.selection[1]] = solutionGrid[currentTurn.selection[1]];
      }

      // If there's more than one player in the game, determine which player's turn is next
      if (players.length > 1) {
        const currentPlayerIndex = players.indexOf(currentPlayer);

        let nextPlayer = players.find((player, index) => {
          return index > currentPlayerIndex && player.active;
        });

        if (!nextPlayer) {
          nextPlayer = players.find((player, index) => {
            return index !== currentPlayerIndex && player.active;
          });
        }

        // If there are no more active players, finish the game
        if (!nextPlayer) {
          finished = true;
        } else {
          currentTurn.player = nextPlayer.id;
        }
      }
    }
  } else {
    // Reset the selection and push the new selection index
    currentTurn.selection = [];
    currentTurn.selection.push(data.index);
  }

  // Check if there are no more empty grid elements
  if (!grid.find((gridElm) => gridElm === -1)) {
    finished = true;
  }

  // Update game data
  await currentGameRef.set(
    { currentTurn, players, grid, finished },
    { merge: true }
  );

  return number;
});

exports.join = functions.https.onCall(async (data, context) => {
  // Find all games where the player could is still active
  let gameSnapshots = await admin
    .firestore()
    .collection("game")
    .where("finished", "==", false)
    .get();

  // Loop through each game and update set player to inactive in these games
  gameSnapshots.forEach(async (doc) => {
    const players = doc.get("players");

    const activePlayer = players.find((player) => {
      return player.id === context.auth.uid && player.active === true;
    });

    if (activePlayer) {
      activePlayer.active = false;

      const activeGameRef = await admin
        .firestore()
        .collection("game")
        .doc(doc.id);

      await activeGameRef.set({ players }, { merge: true });
    }
  });

  const newGameRef = await admin
    .firestore()
    .collection("game")
    .doc(data.gameId);

  const newGameSnap = await newGameRef.get();

  // Perform validation
  if (newGameSnap.get("players").length + 1 > newGameSnap.get("maxPlayers")) {
    throw new functions.https.HttpsError(
      "max-players",
      "Maximum players reached"
    );
  } else if (newGameSnap.get("started")) {
    throw new functions.https.HttpsError(
      "game-started",
      "The game has already been started"
    );
  } else if (newGameSnap.get("finished")) {
    throw new functions.https.HttpsError(
      "game finished",
      "The game has already finished"
    );
  }

  // Set initial data for the new player
  const players = newGameSnap.get("players");
  players.push({
    id: context.auth.uid,
    name: `Player ${players.length + 1}`,
    score: 0,
    active: true,
    isReady: false,
  });

  await newGameRef.set({ players }, { merge: true });

  return true;
});

exports.leaveGame = functions.https.onCall(async (data, context) => {
  // Find all games where the player could is still active
  let gameSnapshots = await admin
    .firestore()
    .collection("game")
    .where("finished", "==", false)
    .get();

  // Loop through each game and update player to inactive in these games
  gameSnapshots.forEach(async (doc) => {
    const players = doc.get("players");

    const activePlayer = players.find((player) => {
      return player.id === context.auth.uid && player.active === true;
    });

    if (!activePlayer) return;

    const activeGameRef = await admin
      .firestore()
      .collection("game")
      .doc(doc.id);

    // If the game hasn't started yet, just remove the player
    // so other players can join
    if (!doc.get("started")) {
      players.splice(players.indexOf(activePlayer), 1);
      await activeGameRef.set({ players }, { merge: true });
      return;
    }

    activePlayer.active = false;

    const activePlayers = players.filter((player) => player.active);

    let finished = false;
    let currentTurn = doc.get("currentTurn");

    if (players.length > 1) {
      finished = activePlayers.length > 1 ? false : true;
    } else {
      finished = true;
    }

    // Find and set the next player
    if (players.length > 1 && !finished) {
      const currentPlayerIndex = activePlayers.indexOf(activePlayer);

      const nextPlayerIndex =
        currentPlayerIndex + 1 < activePlayers.length
          ? currentPlayerIndex + 1
          : 0;

      currentTurn.player = activePlayers[nextPlayerIndex].id;

      // Reset the selection for the next player
      currentPlayer.selection = [];
    }

    await activeGameRef.set(
      { players, finished, currentTurn },
      { merge: true }
    );
  });
});
