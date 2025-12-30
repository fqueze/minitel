import Minitel from './minitel.js';
import { readFileSync } from 'fs';

const PORT = '/dev/tty.usbserial-A5069RR4';
const FILE_PATH = './test.md';

let minitel = null;

async function main() {
  try {
    // Charger le fichier
    const content = readFileSync(FILE_PATH, 'utf-8');
    const lines = content.split('\n');

    // Connexion au Minitel
    console.log('Connexion au Minitel...');
    minitel = new Minitel(PORT);
    await minitel.connect();

    // Effacer l'écran
    await minitel.clear();
    await minitel.home();

    // Afficher le contenu
    let currentRow = 1;
    for (const line of lines) {
      if (line.startsWith('# ')) {
        // Titre principal - gros caractères
        await minitel.moveCursor(2, 1);
        await minitel.setFormat('double');
        await minitel.setFormat('white');
        await minitel.writeText(line.substring(2));
        currentRow += 2; // Double hauteur prend 2 lignes
      } else if (line.startsWith('## ')) {
        // Sous-titre
        minitel.setFormat('normal');
        minitel.writeText(line.substring(3));
        minitel.newLine();
      } else if (line.trim() === '') {
        // Ligne vide
        minitel.newLine();
      } else {
        // Texte normal
        minitel.setFormat('normal');
        minitel.writeText(line);
        minitel.newLine();
      }
    }

    console.log('Fichier affiche. Ctrl+C pour quitter.');

  } catch (err) {
    console.error('Erreur:', err.message);
    if (minitel) await minitel.disconnect();
    process.exit(1);
  }
}

// Gestion de Ctrl+C
process.on('SIGINT', async () => {
  console.log('\nQuitter...');
  if (minitel) await minitel.disconnect();
  process.exit(0);
});

main();
