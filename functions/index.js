const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.restartGame = functions.https.onCall(async (data, context) => {
  // Find the game
  let gameRef = await admin.firestore().collection("game").doc(data.gameId);

  const gameSnap = await gameRef.get();

  if (gameSnap.get("host") != context.auth.uid) {
    throw new functions.https.HttpsError(
      "not-host",
      "You are not the host of the game"
    );
  }

  const size = gameSnap.get("grid").length;
  const gameType = gameSnap.get("gameType");
  const maxPlayers = gameSnap.get("maxPlayers");
  const gameGrid = generateEmptyGrid(Math.sqrt(size));

  const newGameRef = await admin
    .firestore()
    .collection("game")
    .add(buildGameTemplate(maxPlayers, gameType, gameGrid));

  await admin
    .firestore()
    .collection("solution")
    .add({
      game: gameRef.id,
      grid: generateSolution(Math.sqrt(size), gameType, gameGrid),
    });

  await gameRef.set(
    { nextGame: newGameRef.id, finished: true },
    { merge: true }
  );

  return true;

  function generateNumber(numbers) {
    const newNumber = Math.floor(Math.random() * 100);
    if (numbers.includes(newNumber)) {
      return generateNumber(numbers);
    } else {
      return newNumber;
    }
  }

  function selectIcon(iconSet) {
    const randomIndex = Math.floor(Math.random() * iconSet.length);
    const randomIcon = iconSet[randomIndex];
    iconSet.splice(randomIndex, 1);
    return randomIcon;
  }

  function buildGameTemplate(maxPlayers, gameType, gameGrid) {
    return {
      finished: false,
      started: false,
      host: context.auth.uid,
      maxPlayers,
      grid: gameGrid,
      gameType: gameType,
      players: [
        {
          id: context.auth.uid,
          name: "Player 1",
          score: 0,
          active: true,
          isReady: false,
        },
      ],
      currentTurn: {
        player: context.auth.uid,
        selection: [],
      },
      createdAt: new Date(),
    };
  }

  function generateEmptyGrid(size) {
    let grid = [];

    for (let i = 0; i < size * size; i++) {
      grid.push(-1);
    }

    return grid;
  }

  function generateSolution(size, gameType, gameGrid) {
    // Unique icons
    const iconSet = [
      "football-ball",
      "mountain",
      "tree",
      "wind",
      "tractor",
      "space-shuttle",
      "meteor",
      "rocket",
      "bomb",
      "cloud",
      "feather",
      "bone",
      "fish",
      "ice-cream",
      "pizza-slice",
      "stroopwafel",
      "plane",
      "wine-glass-alt",
    ];

    // Unique number set equal to the number of grid's columns
    let numberSet = [];

    // Make a copy of the empty grid
    let solution = [...gameGrid];

    for (let i = 0; i < (size * size) / 2; i++) {
      // Unique element of the solution array
      let uniqueElement;

      // Select a random element depending on the type of the game
      if (gameType === "numbers") {
        // Generate a unique random number
        uniqueElement = generateNumber(numberSet);
        // Keep track of the number so we know only add unique ones
        numberSet.push(uniqueElement);
      } else if (gameType === "icons") {
        // Select a random icon from the iconSet
        uniqueElement = selectIcon(iconSet);
      }

      // Put the generated element in 2 random places of the solution array
      for (let b = 0; b < 2; b++) {
        // Store the indexes of all remaining empty elements
        const emptyGridElements = [];

        // Check which solution elements are still empty
        solution.forEach((item, index) => {
          if (item === -1) {
            emptyGridElements.push(index);
          }
        });

        const randIndex = Math.floor(Math.random() * emptyGridElements.length);

        solution[emptyGridElements[randIndex]] = uniqueElement;
      }
    }

    return solution;
  }
});

exports.setReady = functions.https.onCall(async (data, context) => {
  let gameRef = await admin.firestore().collection("game").doc(data.gameId);

  const gameSnap = await gameRef.get();

  const players = gameSnap.get("players");
  let started = gameSnap.get("started");
  const thisPlayer = players.find((player) => player.id === context.auth.uid);

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

  thisPlayer.isReady = !thisPlayer.isReady;

  // Check if there are any players that aren't ready
  const notReadyPlayers = players.find((player) => player.isReady === false);

  // // If there aren't any - start the game
  if (!notReadyPlayers && players.length === gameSnap.get("maxPlayers")) {
    started = true;
  }

  await gameRef.set({ players, started }, { merge: true });
  return true;
});

exports.createGame = functions.https.onCall(async (data, context) => {
  const maxPlayers = parseInt(data.maxPlayers);
  const size = parseInt(data.size);
  const gameType = data.gameType;
  const validSizes = [4, 6];
  const validGameTypes = ["icons", "numbers"];

  if (typeof maxPlayers !== "number" || typeof size !== "number") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "One or more arguments is of invalid data type"
    );
  }

  if (!validSizes.includes(size) || maxPlayers > 4 || maxPlayers < 1) {
    throw new functions.https.HttpsError("One or more parameters is invalid");
  }

  if (!validGameTypes.includes(gameType)) {
    throw new functions.https.HttpsError(
      "invalid-game-type",
      "Provided game type is invalid"
    );
  }

  const gameGrid = generateEmptyGrid();

  const gameRef = await admin
    .firestore()
    .collection("game")
    .add({
      finished: false,
      started: false,
      host: context.auth.uid,
      maxPlayers,
      grid: gameGrid,
      gameType: gameType,
      players: [
        {
          id: context.auth.uid,
          name: "Player 1",
          score: 0,
          active: true,
          isReady: false,
        },
      ],
      currentTurn: {
        player: context.auth.uid,
        selection: [],
      },
      createdAt: new Date(),
    });

  await admin.firestore().collection("solution").add({
    game: gameRef.id,
    grid: generateSolution(),
  });

  function generateEmptyGrid() {
    let grid = [];

    for (let i = 0; i < size * size; i++) {
      grid.push(-1);
    }

    return grid;
  }

  function generateSolution() {
    // Unique icons
    const iconSet = [
      "football-ball",
      "mountain",
      "tree",
      "wind",
      "tractor",
      "space-shuttle",
      "meteor",
      "rocket",
      "bomb",
      "cloud",
      "feather",
      "bone",
      "fish",
      "ice-cream",
      "pizza-slice",
      "stroopwafel",
      "plane",
      "wine-glass-alt",
    ];

    // Unique number set equal to the number of grid's columns
    let numberSet = [];

    // Make a copy of the empty grid
    let solution = [...gameGrid];

    for (let i = 0; i < (size * size) / 2; i++) {
      // Unique element of the solution array
      let uniqueElement;

      // Select a random element depending on the type of the game
      if (gameType === "numbers") {
        // Generate a unique random number
        uniqueElement = generateNumber(numberSet);
        // Keep track of the number so we know only add unique ones
        numberSet.push(uniqueElement);
      } else if (gameType === "icons") {
        // Select a random icon from the iconSet
        uniqueElement = selectIcon(iconSet);
      }

      // Put the generated element in 2 random places of the solution array
      for (let b = 0; b < 2; b++) {
        // Store the indexes of all remaining empty elements
        const emptyGridElements = [];

        // Check which solution elements are still empty
        solution.forEach((item, index) => {
          if (item === -1) {
            emptyGridElements.push(index);
          }
        });

        const randIndex = Math.floor(Math.random() * emptyGridElements.length);

        solution[emptyGridElements[randIndex]] = uniqueElement;
      }
    }

    return solution;
  }

  function generateNumber(numbers) {
    const newNumber = Math.floor(Math.random() * 100);
    if (numbers.includes(newNumber)) {
      return generateNumber(numbers);
    } else {
      return newNumber;
    }
  }

  function selectIcon(iconSet) {
    const randomIndex = Math.floor(Math.random() * iconSet.length);
    const randomIcon = iconSet[randomIndex];
    iconSet.splice(randomIndex, 1);
    return randomIcon;
  }

  return gameRef.id;
});

exports.guess = functions.https.onCall(async (data, context) => {
  // Find the current game
  let currentGameRef = await admin
    .firestore()
    .collection("game")
    .doc(data.gameId);

  const currentGameSnap = await currentGameRef.get();

  if (!currentGameSnap.get("players")) {
    throw new functions.https.HttpsError(
      "game-does-not-exist",
      "A game with this ID does not exists"
    );
  }

  if (!currentGameSnap.get("started")) {
    throw new functions.https.HttpsError(
      "game-started",
      "The game has already started"
    );
  }

  if (currentGameSnap.get("currentTurn").player !== context.auth.uid) {
    throw new functions.https.HttpsError(
      "not-your-turn",
      "It's not your turn yet"
    );
  }

  if (currentGameSnap.get("grid")[data.index] !== -1) {
    throw new functions.https.HttpsError(
      "not-empty",
      "Please select a new bubble"
    );
  }

  const solutionRefs = await admin
    .firestore()
    .collection("solution")
    .where("game", "==", data.gameId)
    .get();

  const foundRefs = [];
  solutionRefs.forEach((ref) => {
    foundRefs.push(ref);
  });

  const solution = foundRefs[0];

  const solutionGrid = solution.get("grid");
  const number = solutionGrid[data.index];

  const currentTurn = currentGameSnap.get("currentTurn");
  const players = currentGameSnap.get("players");
  const grid = currentGameSnap.get("grid");
  let finished = currentGameSnap.get("finished");

  if (currentTurn.selection.length < 2) {
    if (
      currentTurn.player === context.auth.uid &&
      currentTurn.selection[0] === data.index
    ) {
      throw new functions.https.HttpsError(
        "not-empty",
        "Please select a new bubble"
      );
    }

    currentTurn.selection.push(data.index);

    if (currentTurn.selection.length === 2) {
      const currentPlayer = players.find((player) => {
        return player.id === context.auth.uid;
      });

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

      // End player's turn here?

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

        if (!nextPlayer) {
          finished = true;
        } else {
          currentTurn.player = nextPlayer.id;
        }
      }
    }
  } else {
    currentTurn.selection = [];
    currentTurn.selection.push(data.index);
  }

  if (!grid.find((gridElm) => gridElm === -1)) {
    finished = true;
  }

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

      const activePlayers = players.filter((player) => player.active);

      let finished = false;
      let currentTurn = doc.get("currentTurn");

      if (players.length > 1) {
        finished = activePlayers.length > 1 ? false : true;
      } else {
        finished = true;
      }

      // Set next player
      if (players.length > 1 && !finished) {
        const currentPlayerIndex = activePlayers.indexOf(activePlayer);
        const nextPlayerIndex =
          currentPlayerIndex + 1 < activePlayers.length
            ? currentPlayerIndex + 1
            : 0;
        currentTurn.player = activePlayers[nextPlayerIndex].id;

        currentPlayer.selection = [];
      }

      await activeGameRef.set(
        { players, finished, currentTurn },
        { merge: true }
      );
    }
  });
});
