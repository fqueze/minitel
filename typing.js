import Minitel from './minitel.js';

const PORT = '/dev/tty.usbserial-A5069RR4';

let minitel = null;
let words = [];
let currentWordIndex = 0;
let targetWord = '';
let currentPosition = 0;

// French AZERTY keyboard layout (simplified, uppercase only)
const KEYBOARD_LAYOUT = [
  'AZERTYUIOP',
  ' QSDFGHJKLM',
  '  WXCVBN'
];

async function main() {
  try {
    // Get words from command line arguments
    words = process.argv.slice(2);

    if (words.length === 0) {
      console.error('Usage: node typing.js <word1> [word2] [word3] ...');
      console.error('Example: node typing.js ALICE MAMAN PAPA');
      process.exit(1);
    }

    // Convert to uppercase for simplicity
    words = words.map(w => w.toUpperCase());
    targetWord = words[currentWordIndex];

    console.log(`\n=== JEU DE FRAPPE ===`);
    console.log(`Mots à taper: ${words.join(', ')}`);
    console.log(`Mot 1/${words.length}: ${targetWord}`);
    console.log('Connexion au Minitel...\n');

    minitel = new Minitel(PORT);
    await minitel.connect();

    // Désactiver l'écho local pour éviter l'affichage automatique des touches
    await minitel.disableLocalEcho();

    // Setup the screen
    await minitel.clear();
    await minitel.hideCursor();

    // Draw initial screen
    drawScreen();

    // Setup input handler
    minitel.onData = async (data) => {
      await handleInput(data);
    };

  } catch (err) {
    console.error('Erreur:', err.message);
    if (minitel) await minitel.disconnect();
    process.exit(1);
  }
}

function drawScreen() {
  // Draw the word in the top half (big characters using double size)
  drawWord();

  // Draw the keyboard in the bottom half
  drawKeyboard();

  // Position cursor for local echo in the middle area
  positionCursorForInput();
}

function positionCursorForInput() {
  // Position cursor in the middle area (row 9, centered) for local echo
  minitel.moveCursor(9, 18);
  minitel.setFormat('double');
  minitel.setFormat('white');
}

function drawWord() {
  // Position the word in the middle of the top half
  // Using double size characters, they take 2 lines each
  const startRow = 5;
  const startCol = Math.max(1, Math.floor((40 - targetWord.length * 2) / 2));

  minitel.moveCursor(startRow, startCol);
  minitel.setFormat('double');

  // Draw each character with appropriate color
  for (let i = 0; i < targetWord.length; i++) {
    const char = targetWord[i];

    if (i < currentPosition) {
      // Already typed - white
      minitel.setFormat('white');
    } else {
      // Not yet typed - darker grey
      minitel.setFormat('medium-dark');
    }

    minitel.writeText(char);
  }
}

function updateSingleLetter(letterIndex) {
  // Only redraw the specific letter that just changed state
  const startRow = 5;
  const startCol = Math.max(1, Math.floor((40 - targetWord.length * 2) / 2));

  // Position cursor at the specific letter (each double-width char takes 2 columns)
  minitel.moveCursor(startRow, startCol + (letterIndex * 2));
  minitel.setFormat('double');
  minitel.setFormat('white'); // Just typed, so white
  minitel.writeText(targetWord[letterIndex]);
}

function drawKeyboard() {
  // Draw keyboard in lower half with better spacing from echo area
  // We'll use rows 15, 18, 21 (3 rows per line with double height)
  const keyboardStartRow = 15;
  const keyboardStartCol = 2;

  for (let lineIndex = 0; lineIndex < KEYBOARD_LAYOUT.length; lineIndex++) {
    const line = KEYBOARD_LAYOUT[lineIndex];
    const row = keyboardStartRow + (lineIndex * 3);

    // Count leading spaces for proper stagger effect
    let leadingSpaces = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === ' ') {
        leadingSpaces++;
      } else {
        break;
      }
    }

    // Calculate starting column with stagger offset
    // 1 leading space = 1 col offset
    // 2 leading spaces = 3 cols offset (to align W with Z)
    const staggerOffset = leadingSpaces === 1 ? 1 : (leadingSpaces === 2 ? 3 : 0);
    let col = keyboardStartCol + staggerOffset;

    minitel.moveCursor(row, col);
    minitel.setFormat('double');
//    minitel.setFormat('white');

    // Draw only the non-space characters
    for (let charIndex = leadingSpaces; charIndex < line.length; charIndex++) {
      const char = line[charIndex];

      // Check if this is the next character to type
      const shouldBlink = (currentPosition < targetWord.length &&
                           char === targetWord[currentPosition]);

      if (shouldBlink) {
        minitel.setFormat('blink');
        minitel.writeText(char);
        minitel.setFormat('steady');
      } else {
        minitel.writeText(char);
      }

      // Add single-width space between characters (but not after the last one)
      if (charIndex < line.length - 1) {
//        minitel.setFormat('normal');
        minitel.writeText(' ');
//        minitel.setFormat('double');
      }
    }
  }
}

function updateKeyboardBlink(oldChar, newChar) {
  // Update only the two affected keys on the keyboard
  const keyboardStartRow = 15;
  const keyboardStartCol = 2;

  // Helper to find and update a character
  const updateChar = (char, shouldBlink) => {
    if (!char) return;

    for (let lineIndex = 0; lineIndex < KEYBOARD_LAYOUT.length; lineIndex++) {
      const line = KEYBOARD_LAYOUT[lineIndex];
      const charIndex = line.indexOf(char);

      if (charIndex !== -1) {
        const row = keyboardStartRow + (lineIndex * 3);

        // Count leading spaces for proper stagger effect
        let leadingSpaces = 0;
        for (let i = 0; i < line.length; i++) {
          if (line[i] === ' ') {
            leadingSpaces++;
          } else {
            break;
          }
        }

        // Calculate starting column with stagger offset
        const staggerOffset = leadingSpaces === 1 ? 1 : (leadingSpaces === 2 ? 3 : 0);
        // Position of char: base + stagger + (position after leading spaces * 4)
        // Each char is now 4 cols (2 for double-width char + 2 for double-width space)
        const col = keyboardStartCol + staggerOffset + ((charIndex - leadingSpaces) * 4);

        minitel.moveCursor(row, col);
        minitel.setFormat('double');
//        minitel.setFormat('white');

        if (shouldBlink) {
          minitel.setFormat('blink');
        }

        minitel.writeText(char);

        if (shouldBlink) {
          minitel.setFormat('steady');
        }
        break;
      }
    }
  };

  // Turn off blink on old character
  if (oldChar && oldChar !== ' ') {
    updateChar(oldChar, false);
  }

  // Turn on blink on new character
  if (newChar && newChar !== ' ') {
    updateChar(newChar, true);
  }
}

async function handleInput(data) {
  // Check if it's a regular character
  if (data.length === 1) {
    const code = data[0];

    // Only handle printable characters
    if (code >= 32 && code <= 126) {
      const typedChar = String.fromCharCode(code).toUpperCase();

      console.log(`Typed: ${typedChar}`);

      // Display the typed character in the middle area
      minitel.moveCursor(9, 18);
      minitel.setFormat('double');
      minitel.setFormat('white');
      minitel.writeText(typedChar);

      // Check if it matches the expected character
      const isCorrect = (currentPosition < targetWord.length &&
                         typedChar === targetWord[currentPosition]);

      if (isCorrect) {
        console.log(`✓ Correct! (${currentPosition + 1}/${targetWord.length})`);

        // Update just the letter that changed color
        updateSingleLetter(currentPosition);

        const oldChar = targetWord[currentPosition];
        currentPosition++;

        // Update keyboard blink state
        const newChar = currentPosition < targetWord.length ? targetWord[currentPosition] : null;
        updateKeyboardBlink(oldChar, newChar);

        // Check if word is complete
        if (currentPosition === targetWord.length) {
          await wordComplete();
          return;
        }
      } else {
        console.log(`✗ Wrong key. Expected: ${targetWord[currentPosition]}`);
        // Beep on wrong key
        await minitel.beep();
      }
    }
  }
}

async function wordComplete() {
  console.log(`\n🎉 Bravo! Mot ${currentWordIndex + 1}/${words.length} completé!\n`);

  // Show celebration message in the echo area (row 9, centered)
  minitel.moveCursor(9, 13);
  minitel.setFormat('double');
  minitel.setFormat('blink');
  minitel.setFormat('white');
  minitel.writeText('BRAVO!');
  minitel.setFormat('steady');

  // Wait a bit then move to next word
  await sleep(3000);

  // Move to next word
  currentWordIndex++;
  currentPosition = 0;

  if (currentWordIndex >= words.length) {
    // All words completed!
    await allWordsComplete();
  } else {
    // Move to next word
    targetWord = words[currentWordIndex];
    console.log(`Mot ${currentWordIndex + 1}/${words.length}: ${targetWord}`);
    await minitel.clear();
    drawScreen();
  }
}

async function allWordsComplete() {
  console.log('\n🎊 TOUS LES MOTS COMPLETES! 🎊\n');

  await minitel.clear();
  minitel.moveCursor(10, 5);
  minitel.setFormat('double');
  minitel.setFormat('blink');
  minitel.setFormat('white');
  minitel.writeText('SUPER!');
  minitel.setFormat('steady');

  await sleep(5000);

  // Loop back to the beginning
  console.log('\nRedémarrage...\n');
  currentWordIndex = 0;
  currentPosition = 0;
  targetWord = words[currentWordIndex];
  console.log(`Mot 1/${words.length}: ${targetWord}`);

  await minitel.clear();
  drawScreen();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

process.on('SIGINT', async () => {
  console.log('\n\nInterruption...');
  if (minitel) {
    await minitel.clear();
    await minitel.showCursor();
    await minitel.disconnect();
  }
  process.exit(0);
});

main();
