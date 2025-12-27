import Minitel from './minitel.js';

const PORT = '/dev/tty.usbserial-A5069RR4';

let minitel = null;
let currentMenu = 'main';

async function main() {
  try {
    minitel = new Minitel(PORT);

    console.log('\n=== MINITEL DEMO ===');
    console.log('Connexion au Minitel...\n');

    await minitel.connect();
    await sleep(300);

    await showMainMenu();

  } catch (err) {
    console.error('Erreur:', err.message);
    if (minitel) await minitel.disconnect();
    process.exit(1);
  }
}

async function showMainMenu() {
  currentMenu = 'main';

  await minitel.clear();
  minitel.home();

  minitel.setFormat('white');
  minitel.writeText('=== MENU PRINCIPAL ===');
  minitel.newLine();
  minitel.newLine();

  minitel.setFormat('very-light');
  minitel.writeText('1. Test complet');
  minitel.newLine();
  minitel.writeText('2. Niveaux de gris');
  minitel.newLine();
  minitel.writeText('3. Capture touches');
  minitel.newLine();
  minitel.writeText('4. Tailles et clignotement');
  minitel.newLine();
  minitel.writeText('5. Quitter');
  minitel.newLine();
  minitel.newLine();

  minitel.setFormat('white');
  minitel.writeText('Votre choix: ');

  console.log('Menu principal affiche');
  console.log('1. Test complet');
  console.log('2. Niveaux de gris');
  console.log('3. Capture touches');
  console.log('4. Tailles et clignotement');
  console.log('5. Quitter');
  console.log('\nCtrl+C pour quitter depuis le terminal');

  minitel.onData = async (data) => {
    const key = data.toString('ascii').trim();

    if (currentMenu === 'main') {
      if (key === '1') {
        await runTests();
      } else if (key === '2') {
        await showGrayscale();
      } else if (key === '3') {
        await captureKeys();
      } else if (key === '4') {
        await showTextEffects();
      } else if (key === '5') {
        await quit();
      }
    } else if (currentMenu === 'capture') {
      await handleCaptureKey(data);
    }
  };
}

async function runTests() {
  console.log('\n=== LANCEMENT DES TESTS ===\n');

  await minitel.clear();
  minitel.home();
  minitel.setFormat('white');
  minitel.writeText('Tests en cours...');
  minitel.newLine();

  // Test 1: Effacement
  console.log('Test 1: Effacement de l\'ecran...');
  await minitel.clear();
  await sleep(500);

  // Test 2: Texte simple
  console.log('Test 2: Ecriture de texte simple...');
  minitel.writeText('Test 123');
  await sleep(500);

  // Test 3: Nouvelle ligne
  console.log('Test 3: Nouvelle ligne...');
  minitel.newLine();
  await sleep(500);

  // Test 4: Alphabet
  console.log('Test 4: Alphabet...');
  minitel.writeText('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  minitel.newLine();
  minitel.writeText('abcdefghijklmnopqrstuvwxyz');
  await sleep(1000);

  // Test 5: Chiffres
  console.log('Test 5: Chiffres et ponctuation...');
  minitel.newLine();
  minitel.writeText('0123456789 .,;:!?');
  await sleep(1000);

  // Test 6: Positionnement
  console.log('Test 6: Positionnement du curseur...');
  minitel.moveCursor(10, 15);
  minitel.writeText('Centre');
  await sleep(1000);

  // Test 7: Niveaux de gris
  console.log('Test 7: Test des niveaux de gris...');
  const grayLevels = ['white', 'very-light', 'light', 'medium-light', 'medium', 'medium-dark', 'dark'];
  for (let i = 0; i < grayLevels.length; i++) {
    minitel.moveCursor(12 + i, 5);
    minitel.setFormat(grayLevels[i]);
    minitel.writeText(`Gris: ${grayLevels[i]}`);
    await sleep(300);
  }

  // Test 8: Sonnerie
  console.log('Test 8: Sonnerie...');
  await sleep(500);
  await minitel.beep();

  // Test 9: Retour home
  console.log('Test 9: Retour home...');
  await sleep(1000);
  minitel.home();
  minitel.writeText('HOME');

  console.log('\nTests termines !');

  await sleep(3000);
  await showReturnPrompt();
}

async function showGrayscale() {
  console.log('\n=== NIVEAUX DE GRIS ===\n');

  await minitel.clear();
  minitel.home();

  minitel.setFormat('white');
  minitel.writeText('Niveaux de gris:');
  minitel.newLine();

  const levels = ['white', 'very-light', 'light', 'medium-light', 'medium', 'medium-dark', 'dark', 'black'];

  console.log('=== Niveaux de gris (du + clair au + sombre) ===\n');

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    minitel.setFormat(level);
    minitel.writeText(`${level}: `);
    for (let j = 0; j < 10; j++) {
      minitel.writeText('#');
    }
    minitel.newLine();
    console.log(`${i + 1}. ${level}`);
    await sleep(200);
  }

  console.log('\nAppuyez sur une touche pour revenir au menu...');

  await sleep(2000);
  await showReturnPrompt();
}

async function showTextEffects() {
  console.log('\n=== TAILLES ET CLIGNOTEMENT ===\n');

  await minitel.clear();
  minitel.home();

  minitel.setFormat('white');
  minitel.writeText('Effets de texte:');
  minitel.newLine();
  minitel.newLine();

  // Taille normale
  console.log('Taille normale...');
  minitel.setFormat('normal');
  minitel.setFormat('white');
  minitel.writeText('Taille normale');
  minitel.newLine();
  await sleep(1000);

  // Double hauteur
  console.log('Double hauteur...');
  minitel.setFormat('double-height');
  minitel.setFormat('white');
  minitel.writeText('Double hauteur');
  minitel.newLine();
  minitel.newLine(); // Double hauteur prend 2 lignes
  await sleep(1000);

  // Double largeur
  console.log('Double largeur...');
  minitel.setFormat('double-width');
  minitel.setFormat('white');
  minitel.writeText('Double largeur');
  minitel.newLine();
  await sleep(1000);

  // Double taille
  console.log('Double taille...');
  minitel.setFormat('double');
  minitel.setFormat('white');
  minitel.writeText('Double taille');
  minitel.newLine();
  minitel.newLine(); // Double taille prend 2 lignes
  await sleep(1000);

  // Retour à la taille normale
  minitel.setFormat('normal');
  minitel.setFormat('white');
  minitel.newLine();

  // Clignotement
  console.log('Clignotement...');
  minitel.setFormat('blink');
  minitel.setFormat('white');
  minitel.writeText('Texte clignotant');
  await sleep(2000);

  // Désactiver le clignotement
  minitel.setFormat('steady');
  minitel.newLine();
  minitel.setFormat('white');
  minitel.writeText('Texte fixe');
  await sleep(1000);

  // Combinaison: double taille + clignotement
  console.log('Double taille + clignotement...');
  minitel.newLine();
  minitel.newLine();
  minitel.setFormat('double');
  minitel.setFormat('blink');
  minitel.setFormat('white');
  minitel.writeText('GROS CLIGNOTANT');
  await sleep(2000);

  // Réinitialiser
  minitel.setFormat('normal');
  minitel.setFormat('steady');

  console.log('\nDemo terminee !');

  await sleep(2000);
  await showReturnPrompt();
}

async function captureKeys() {
  console.log('\n=== CAPTURE DE TOUCHES ===\n');
  console.log('Appuyez sur les touches du Minitel...');
  console.log('Touche RETOUR pour revenir au menu\n');

  currentMenu = 'capture';

  await minitel.clear();
  minitel.home();
  minitel.setFormat('white');
  minitel.writeText('Capture de touches');
  minitel.newLine();
  minitel.writeText('RETOUR: menu');
  minitel.newLine();
  minitel.newLine();

  const knownKeys = {
    0x59: 'CONNEXION/FIN',
    0x46: 'SOMMAIRE',
    0x45: 'ANNULATION',
    0x42: 'RETOUR',
    0x43: 'REPETITION',
    0x44: 'GUIDE',
    0x47: 'CORRECTION',
    0x48: 'SUITE',
    0x41: 'ENVOI'
  };

  minitel.onData = async (data) => {
    await handleCaptureKey(data, knownKeys);
  };
}

async function handleCaptureKey(data, knownKeys = {}) {
  // Vérifier si c'est la touche RETOUR pour revenir au menu
  const functionKey = Minitel.parseFunctionKey(data);
  if (functionKey === Minitel.CODES.KEY_RETOUR) {
    console.log('\nRetour au menu principal...');
    await showMainMenu();
    return;
  }

  console.log('\n=== Touche ===');
  const hex = Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
  console.log('Hex:', hex);

  if (functionKey !== null) {
    const char = String.fromCharCode(functionKey);
    const name = knownKeys[functionKey] || '???';
    console.log(`Type: Touche de fonction`);
    console.log(`Nom: ${name}`);
    console.log(`Code: 0x13 + 0x${functionKey.toString(16).toUpperCase()} ('${char}')`);
  } else if (data.length === 1) {
    const code = data[0];
    if (code >= 32 && code <= 126) {
      console.log(`Type: Caractere normal`);
      console.log(`Char: '${String.fromCharCode(code)}'`);
    } else {
      console.log(`Type: Caractere de controle`);
      console.log(`Code: 0x${code.toString(16).toUpperCase()}`);
    }
  } else {
    console.log(`Type: Sequence de ${data.length} bytes`);
  }
  console.log('=============\n');
}

async function showReturnPrompt() {
  minitel.newLine();
  minitel.newLine();
  minitel.setFormat('white');
  minitel.writeText('RETOUR: menu');

  currentMenu = 'return';

  minitel.onData = async (data) => {
    const functionKey = Minitel.parseFunctionKey(data);
    if (functionKey === Minitel.CODES.KEY_RETOUR) {
      await showMainMenu();
    }
  };
}

async function quit() {
  console.log('\n=== AU REVOIR ===\n');

  await minitel.clear();
  minitel.home();
  minitel.setFormat('white');
  minitel.writeText('Au revoir!');
  await sleep(1000);

  await minitel.disconnect();
  process.exit(0);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

process.on('SIGINT', async () => {
  console.log('\n\nInterruption...');
  if (minitel) await minitel.disconnect();
  process.exit(0);
});

main();
