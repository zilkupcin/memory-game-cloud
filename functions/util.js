const { iconSet } = require("./data");

const generateEmptyGrid = (size) => {
  let grid = [];

  for (let i = 0; i < size * size; i++) {
    grid.push(-1);
  }

  return grid;
};

const generateNumber = (numbers) => {
  const newNumber = Math.floor(Math.random() * 100);
  if (numbers.includes(newNumber)) {
    return generateNumber(numbers);
  } else {
    return newNumber;
  }
};

const selectIcon = (iconSet) => {
  const randomIndex = Math.floor(Math.random() * iconSet.length);
  const randomIcon = iconSet[randomIndex];
  iconSet.splice(randomIndex, 1);
  return randomIcon;
};

const generateSolution = (gameGrid, size, gameType) => {
  // Unique number set
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
};

const buildGameTemplate = (maxPlayers, gameType, gameGrid, userId) => {
  return {
    finished: false,
    started: false,
    host: userId,
    maxPlayers,
    grid: gameGrid,
    gameType: gameType,
    players: [
      {
        id: userId,
        name: "Player 1",
        score: 0,
        active: true,
        isReady: false,
      },
    ],
    currentTurn: {
      player: userId,
      selection: [],
    },
    createdAt: new Date(),
  };
};

exports.generateEmptyGrid = generateEmptyGrid;
exports.generateSolution = generateSolution;
exports.buildGameTemplate = buildGameTemplate;
