import Minitel from './minitel.js';

// Configuration du port série
const PORT = process.env.MINITEL_PORT || '/dev/tty.usbserial-A5069RR4';

// Configuration du jeu
const GAME_AREA = {
  top: 1,
  bottom: 23,
  left: 2,
  right: 39
};

const DIRECTION = {
  UP: { row: -1, col: 0, key: 'A' },
  DOWN: { row: 1, col: 0, key: 'B' },
  LEFT: { row: 0, col: -1, key: 'D' },
  RIGHT: { row: 0, col: 1, key: 'C' }
};

class SnakeGame {
  constructor(minitel) {
    this.minitel = minitel;
    this.snake = [];
    this.direction = DIRECTION.RIGHT;
    this.food = null;
    this.score = 0;
    this.gameOver = false;
    this.gameStarted = false;
    this.speed = 200;
    this.lastMove = 0;
    this.pendingDirection = null;
    this.scoreJustUpdated = false;
    this.lastTailPos = null;
  }

  async init() {
    // Cacher le curseur une fois pour toutes
    await this.minitel.hideCursor();

    // Initialisation du serpent au centre
    const centerRow = Math.floor((GAME_AREA.top + GAME_AREA.bottom) / 2);
    const centerCol = Math.floor((GAME_AREA.left + GAME_AREA.right) / 2);

    this.snake = [
      { row: centerRow, col: centerCol },
      { row: centerRow, col: centerCol - 1 },
      { row: centerRow, col: centerCol - 2 }
    ];

    this.direction = DIRECTION.RIGHT;
    this.food = null; // Sera généré au démarrage du jeu
    this.score = 0;
    this.gameOver = false;
    this.gameStarted = false;
    this.scoreJustUpdated = false;
    this.lastTailPos = null;

    await this.drawUI();
    this.drawBorder();

    // Afficher les instructions de contrôle (serpent et nourriture seront dessinés au démarrage)
    this.showInstructions();
  }

  showInstructions() {
    this.minitel.setFormat('very-light');

    // Titre (rangée 10, centré)
    // "Touches de contrôle :" = 21 caractères, centre = (40-21)/2 = 9.5 ≈ 10
    this.minitel.moveCursor(8, 10);
    this.minitel.writeText('Touches de contrôle :');

    // Ligne 1 : Z (haut) et 2 (haut)
    // "Z              2" = 18 caractères, centre = (40-18)/2 = 11
    this.minitel.moveCursor(10, 12);
    this.minitel.writeText('Z              2');

    // Ligne 2 : Q S D et 4 6
    // "Q S D    ou    4   6" = 20 caractères, centre = (40-20)/2 = 10
    this.minitel.moveCursor(12, 10);
    this.minitel.writeText('Q S D    ou    4   6');

    // Ligne vide (rangée 15)

    // Ligne 3 : 8 (bas, aligné avec 2)
    this.minitel.moveCursor(14, 27);
    this.minitel.writeText('8');

    // Message de démarrage (centré)
    this.minitel.moveCursor(17, 3);
    this.minitel.writeText('Appuyer sur une touche pour démarrer');

    this.minitel.setFormat('black');
  }

  async drawUI() {
    await this.minitel.clear();
    // On utilise la ligne 0 pour le titre, donc pas besoin de la nettoyer
    this.minitel.home();
  }

  drawBorder() {
    const width = GAME_AREA.right - GAME_AREA.left + 1;
    const totalWidth = width + 2;

    // LIGNE 0 avec "SNAKE" intégré
    const title = "SNAKE";
    const leftSpaces = Math.floor((totalWidth - title.length) / 2);
    const rightSpaces = totalWidth - leftSpaces - title.length;

    this.minitel.moveCursor(0, GAME_AREA.left - 1);
    this.minitel.setFormat('white-background');
    this.minitel.setFormat('black');
    this.minitel.writeRepeated(' ', leftSpaces);
    this.minitel.writeText(title);
    this.minitel.writeRepeated(' ', rightSpaces);

    // CÔTÉS VERTICAUX (espaces sur fond blanc)
    this.minitel.setFormat(Minitel.CODES.SO);
    for (let row = GAME_AREA.top; row <= GAME_AREA.bottom; row++) {
      // Mur gauche
      this.minitel.moveCursor(row, GAME_AREA.left - 1);
      this.minitel.write(Buffer.from([0x7F]));

      // Mur droit
      this.minitel.moveCursor(row, GAME_AREA.right + 1);
      this.minitel.write(Buffer.from([0x7F]));
    }
    this.minitel.setFormat(Minitel.CODES.SI);

    // LIGNE DU BAS avec score
    this.drawScoreInBorder();

    this.minitel.setFormat('black');
  }

  drawScoreInBorder() {
    const width = GAME_AREA.right - GAME_AREA.left + 1;
    const totalWidth = width + 2;
    const scoreText = `Score: ${this.score}`;
    const leftSpaces = Math.floor((totalWidth - scoreText.length) / 2);
    const rightSpaces = totalWidth - leftSpaces - scoreText.length;

    this.minitel.moveCursor(GAME_AREA.bottom + 1, GAME_AREA.left - 1);
    this.minitel.setFormat('white-background');
    this.minitel.setFormat('black');
    this.minitel.writeRepeated(' ', leftSpaces);
    this.minitel.writeText(scoreText);
    this.minitel.writeRepeated(' ', rightSpaces);
    this.minitel.setFormat('black-background');
  }

  drawSnake() {
    for (const segment of this.snake) {
      this.minitel.moveCursor(segment.row, segment.col);
      this.minitel.writeText('O');
    }
  }

  spawnFood() {
    let foodPos;
    let isValid;

    do {
      isValid = true;
      foodPos = {
        row: GAME_AREA.top + Math.floor(Math.random() * (GAME_AREA.bottom - GAME_AREA.top + 1)),
        col: GAME_AREA.left + Math.floor(Math.random() * (GAME_AREA.right - GAME_AREA.left + 1))
      };

      for (const segment of this.snake) {
        if (segment.row === foodPos.row && segment.col === foodPos.col) {
          isValid = false;
          break;
        }
      }
    } while (!isValid);

    this.food = foodPos;
    this.minitel.setFormat('medium-dark');
    this.minitel.moveCursor(this.food.row, this.food.col);
    this.minitel.writeText('*');
    this.minitel.setFormat('black');
  }

  updateScore() {
    this.drawScoreInBorder();
    this.minitel.setFormat('black');
    this.scoreJustUpdated = true;
  }

  async update() {
    if (!this.gameStarted || this.gameOver) {
      return;
    }

    const now = Date.now();
    if (now - this.lastMove < this.speed) return;

    this.lastMove = now;

    if (this.pendingDirection) {
      if (!(this.pendingDirection.row === -this.direction.row &&
            this.pendingDirection.col === -this.direction.col)) {
        this.direction = this.pendingDirection;
      }
      this.pendingDirection = null;
    }

    const head = this.snake[0];
    const newHead = {
      row: head.row + this.direction.row,
      col: head.col + this.direction.col
    };

    // Vérifier collision avec les murs
    if (newHead.row < GAME_AREA.top || newHead.row > GAME_AREA.bottom ||
        newHead.col < GAME_AREA.left || newHead.col > GAME_AREA.right) {
      await this.endGame();
      return;
    }

    // Vérifier collision avec soi-même
    for (const segment of this.snake) {
      if (segment.row === newHead.row && segment.col === newHead.col) {
        await this.endGame();
        return;
      }
    }

    this.snake.unshift(newHead);

    let ateFood = false;
    if (this.food && newHead.row === this.food.row && newHead.col === this.food.col) {
      this.score += 10;
      this.updateScore();
      await this.minitel.beep();
      ateFood = true;
      this.speed = Math.max(100, this.speed - 5);
    }

    // Dessiner la nouvelle tête
    this.minitel.moveCursor(newHead.row, newHead.col);
    this.minitel.writeText('O');

    if (!ateFood) {
      const tail = this.snake.pop();
      this.lastTailPos = tail;
      this.minitel.moveCursor(tail.row, tail.col);
      this.minitel.writeText(' ');
    } else {
      this.spawnFood();
      this.lastTailPos = null;
    }
  }

  async endGame() {
    this.gameOver = true;
    await this.minitel.beep();

    const centerRow = Math.floor((GAME_AREA.top + GAME_AREA.bottom) / 2);
    const centerCol = Math.floor((GAME_AREA.left + GAME_AREA.right) / 2);

    const boxWidth = 24;
    const boxHeight = 8;
    const boxTop = centerRow - Math.floor(boxHeight / 2);
    const boxLeft = centerCol - Math.floor(boxWidth / 2);

    const gameOverText = 'GAME OVER!';
    const scoreText = 'Score: ' + this.score;
    const replayText = 'Rejouer: ENVOI';

    const innerWidth = boxWidth - 2;

    // LIGNE DU HAUT
    this.minitel.moveCursor(boxTop, boxLeft);
    this.minitel.setFormat('medium');
    this.minitel.writeText('+');
    this.minitel.writeRepeated('-', innerWidth);
    this.minitel.writeText('+');

    // Ligne vide
    this.minitel.moveCursor(boxTop + 1, boxLeft);
    this.minitel.setFormat('medium');
    this.minitel.writeText('|');
    this.minitel.writeRepeated(' ', innerWidth);
    this.minitel.writeText('|');

    // GAME OVER (centré)
    const gameOverPad = Math.floor((innerWidth - gameOverText.length) / 2);
    this.minitel.moveCursor(boxTop + 2, boxLeft);
    this.minitel.setFormat('medium');
    this.minitel.writeText('|');
    this.minitel.writeRepeated(' ', gameOverPad);
    this.minitel.setFormat('white');
    this.minitel.setFormat('blink');
    this.minitel.writeText(gameOverText);
    this.minitel.setFormat('steady');
    this.minitel.setFormat('medium');
    this.minitel.writeRepeated(' ', innerWidth - gameOverPad - gameOverText.length);
    this.minitel.writeText('|');

    // Score (centré)
    const scorePad = Math.floor((innerWidth - scoreText.length) / 2);
    this.minitel.moveCursor(boxTop + 3, boxLeft);
    this.minitel.setFormat('medium');
    this.minitel.writeText('|');
    this.minitel.writeRepeated(' ', scorePad);
    this.minitel.setFormat('very-light');
    this.minitel.writeText(scoreText);
    this.minitel.setFormat('medium');
    this.minitel.writeRepeated(' ', innerWidth - scorePad - scoreText.length);
    this.minitel.writeText('|');

    // Ligne vide
    this.minitel.moveCursor(boxTop + 4, boxLeft);
    this.minitel.setFormat('medium');
    this.minitel.writeText('|');
    this.minitel.writeRepeated(' ', innerWidth);
    this.minitel.writeText('|');

    // Rejouer: ENVOI (centré)
    const replayPad = Math.floor((innerWidth - replayText.length) / 2);
    this.minitel.moveCursor(boxTop + 5, boxLeft);
    this.minitel.setFormat('medium');
    this.minitel.writeText('|');
    this.minitel.writeRepeated(' ', replayPad);
    this.minitel.setFormat('white');
    this.minitel.writeText(replayText);
    this.minitel.setFormat('medium');
    this.minitel.writeRepeated(' ', innerWidth - replayPad - replayText.length);
    this.minitel.writeText('|');

    // Ligne vide avant le bas
    this.minitel.moveCursor(boxTop + 6, boxLeft);
    this.minitel.setFormat('medium');
    this.minitel.writeText('|');
    this.minitel.writeRepeated(' ', innerWidth);
    this.minitel.writeText('|');

    // LIGNE DU BAS
    this.minitel.moveCursor(boxTop + 7, boxLeft);
    this.minitel.setFormat('medium');
    this.minitel.writeText('+');
    this.minitel.writeRepeated('-', innerWidth);
    this.minitel.writeText('+');

    this.minitel.setFormat('black');

    await this.minitel.beep();
  }

  async handleInput(data) {
    const key = data.toString('ascii').trim();

    const functionKey = Minitel.parseFunctionKey(data);
    if (functionKey !== null) {
      if (functionKey === Minitel.CODES.KEY_ENVOI) {
        if (this.gameOver) {
          await this.restart();
        }
        return;
      }
      return;
    }

    if (key === '2' || key === 'z' || key === 'Z') {
      this.pendingDirection = DIRECTION.UP;
      this.startGameIfNeeded();
    } else if (key === '8' || key === 's' || key === 'S') {
      this.pendingDirection = DIRECTION.DOWN;
      this.startGameIfNeeded();
    } else if (key === '4' || key === 'q' || key === 'Q') {
      this.pendingDirection = DIRECTION.LEFT;
      this.startGameIfNeeded();
    } else if (key === '6' || key === 'd' || key === 'D') {
      this.pendingDirection = DIRECTION.RIGHT;
      this.startGameIfNeeded();
    }

    // Plus besoin d'effacer les caractères parasites car l'écho est désactivé
  }

  startGameIfNeeded() {
    if (!this.gameStarted && !this.gameOver) {
      this.gameStarted = true;
      this.lastMove = Date.now();

      // Effacer les instructions (rangées 8 à 17)
      this.minitel.setFormat('black');
      for (let row = 8; row <= 17; row++) {
        this.minitel.moveCursor(row, 2);
        this.minitel.writeRepeated(' ', 38);
      }

      // Dessiner le serpent et la nourriture
      this.drawSnake();
      this.spawnFood();
    }
  }

  async restart() {
    this.speed = 200;
    this.pendingDirection = null;
    await this.init();
  }
}

async function main() {
  const minitel = new Minitel(PORT);

  try {
    console.log('Connexion au Minitel...');
    await minitel.connect();

    // Désactiver l'écho local pour éviter les caractères parasites
    await minitel.disableLocalEcho();

    const game = new SnakeGame(minitel);
    await game.init();

    console.log('\n=== SNAKE MINITEL ===');
    console.log('Controles sur le Minitel:');
    console.log('  2 ou Z = Haut');
    console.log('  8 ou S = Bas');
    console.log('  4 ou Q = Gauche');
    console.log('  6 ou D = Droite');
    console.log('  ENVOI = Rejouer');
    console.log('\nLe jeu démarre quand vous appuyez sur une touche directionnelle');
    console.log('Ctrl+C pour quitter\n');

    minitel.onData = async (data) => {
      await game.handleInput(data);
    };

    const gameLoop = setInterval(async () => {
      await game.update();
    }, 16);

    process.on('SIGINT', async () => {
      clearInterval(gameLoop);
      await minitel.clear();
      minitel.home();
      minitel.setFormat('white');
      minitel.writeText('Au revoir!');
      await sleep(500);
      await minitel.disconnect();
      process.exit(0);
    });

  } catch (err) {
    console.error('Erreur:', err.message);
    await minitel.disconnect();
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();
