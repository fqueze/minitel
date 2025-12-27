# Contrôleur Minitel Node.js

Script Node.js pour interagir avec un Minitel 1 RTIC (noir et blanc) via port série USB.

## Installation

```bash
npm install
```

## Configuration

Le port série est défini dans chaque script. Pour le modifier :

```javascript
const PORT = '/dev/tty.usbserial-A5069RR4';  // Votre port USB
```

Lister les ports disponibles sur macOS :
```bash
ls /dev/tty.*
```

**Configuration série :** 1200 bauds, 7 bits de données, parité paire, 1 bit de stop (7E1)

## Utilisation

### Démo et diagnostic

Menu interactif avec tests complets, niveaux de gris, et capture de touches :

```bash
npm start
```

Menu disponible :
1. **Test complet** - Vérifie texte, curseur, niveaux de gris, sonnerie
2. **Niveaux de gris** - Affiche les 8 niveaux disponibles
3. **Capture touches** - Débogue les touches du Minitel
4. **Tailles et clignotement** - Démontre les effets de texte
5. **Quitter**

Utilisez la touche **RETOUR** du Minitel pour revenir au menu.

### Jeu Snake

```bash
node snake.js
```

**Contrôles :**
- `8` ou `Z` : Haut
- `2` ou `S` : Bas
- `4` ou `Q` : Gauche
- `6` ou `D` : Droite
- **ENVOI** (verte) : Rejouer après Game Over

### Jeu d'apprentissage de frappe

Jeu éducatif pour apprendre à taper au clavier, conçu pour les jeunes enfants :

```bash
node typing.js ALICE PAPA MAMAN
```

**Fonctionnalités :**
- Affiche le mot à taper en gros caractères
- Clavier AZERTY visuel en double taille
- La lettre à taper clignote sur le clavier
- Progression à travers plusieurs mots
- Feedback visuel et sonore (bip) pour les erreurs

## API

### Exemple d'utilisation

```javascript
import Minitel from './minitel.js';

const minitel = new Minitel('/dev/tty.usbserial-A5069RR4');

await minitel.connect();
await minitel.clear();

minitel.writeText('Bonjour Minitel!');
minitel.newLine();
minitel.moveCursor(10, 20);
minitel.writeText('Centre');

// Niveaux de gris
minitel.setFormat('medium-dark');
minitel.writeText('Texte sombre');

// Tailles
minitel.setFormat('double');
minitel.writeText('GROS');

// Clignotement
minitel.setFormat('blink');
minitel.writeText('Clignote');

await minitel.disconnect();
```

### Méthodes principales

- `connect()` - Se connecte au Minitel
- `disconnect()` - Se déconnecte
- `clear()` - Efface l'écran
- `home()` - Place le curseur en haut à gauche
- `writeText(text)` - Écrit du texte (gère automatiquement les accents français)
- `newLine()` - Retour à la ligne
- `moveCursor(row, col)` - Positionne le curseur (ligne: 1-24, colonne: 1-40)
- `printAt(row, col, text)` - Affiche du texte à une position
- `setFormat(code)` - Change le format (niveau de gris, taille, clignotement, fond)
- `beep()` - Fait sonner le Minitel
- `hideCursor()` - Masque le curseur
- `showCursor()` - Affiche le curseur

### Formats disponibles

#### Niveaux de gris

Du plus clair au plus sombre :

```javascript
await minitel.setFormat('white');        // Blanc (le plus clair)
await minitel.setFormat('very-light');   // Gris très clair
await minitel.setFormat('light');        // Gris clair
await minitel.setFormat('medium-light'); // Gris moyen-clair
await minitel.setFormat('medium');       // Gris moyen
await minitel.setFormat('medium-dark');  // Gris moyen-sombre
await minitel.setFormat('dark');         // Gris sombre
await minitel.setFormat('black');        // Noir (invisible)
```

#### Fonds

```javascript
await minitel.setFormat('white-background'); // Fond blanc
await minitel.setFormat('black-background'); // Fond noir
```

#### Tailles de caractères

```javascript
await minitel.setFormat('normal');        // Taille normale
await minitel.setFormat('double-height'); // Double hauteur
await minitel.setFormat('double-width');  // Double largeur
await minitel.setFormat('double');        // Double taille (hauteur + largeur)
```

#### Clignotement

```javascript
await minitel.setFormat('blink');  // Activer le clignotement
await minitel.setFormat('steady'); // Désactiver le clignotement
```

### Réception de touches

```javascript
minitel.onData = (data) => {
  // Détecter les touches de fonction
  const functionKey = Minitel.parseFunctionKey(data);
  if (functionKey !== null) {
    if (functionKey === Minitel.CODES.KEY_ENVOI) {
      console.log('Touche ENVOI appuyée');
    } else if (functionKey === Minitel.CODES.KEY_RETOUR) {
      console.log('Touche RETOUR appuyée');
    }
    // etc.
  } else {
    // Touche normale
    console.log('Reçu:', data.toString('ascii'));
  }
};
```

### Caractères spéciaux

La méthode `writeText()` convertit automatiquement les caractères Unicode en séquences Minitel :

**Accents français :** à è ù é â ê î ô û ë ï ü ç œ (minuscules et majuscules)

**Apostrophes et guillemets :** Les apostrophes courbes `'` `'` et guillemets `"` `"` `«` `»` sont convertis automatiquement en caractères ASCII

**Symboles :** £ § ° ± ¼ ½ ¾ ← ↑ → ↓ β

```javascript
minitel.writeText("L'été à la plage : 25°C");
// S'affiche correctement
```

### Touches de fonction

Les touches de fonction du Minitel envoient : `0x13 + code ASCII`

**Disposition du clavier :**

```
Ligne 1 (marron) : [Connexion/Fin] [Sommaire] [Annulation] [Retour] [Répétition]
Ligne 2 (marron + verte) :         [Guide]    [Correction] [Suite]  [ENVOI]
```

| Touche | Code | Constante |
|--------|------|-----------|
| CONNEXION/FIN | 0x13 + 0x59 ('Y') | `KEY_CONNEXION_FIN` |
| SOMMAIRE | 0x13 + 0x46 ('F') | `KEY_SOMMAIRE` |
| ANNULATION | 0x13 + 0x45 ('E') | `KEY_ANNULATION` |
| RETOUR | 0x13 + 0x42 ('B') | `KEY_RETOUR` |
| RÉPÉTITION | 0x13 + 0x43 ('C') | `KEY_REPETITION` |
| GUIDE | 0x13 + 0x44 ('D') | `KEY_GUIDE` |
| CORRECTION | 0x13 + 0x47 ('G') | `KEY_CORRECTION` |
| SUITE | 0x13 + 0x48 ('H') | `KEY_SUITE` |
| ENVOI (verte) | 0x13 + 0x41 ('A') | `KEY_ENVOI` |

## Fichiers

- **minitel.js** - Classe de contrôle du Minitel
- **demo.js** - Menu de tests et diagnostic (`npm start`)
- **snake.js** - Jeu Snake (`node snake.js`)
- **typing.js** - Jeu d'apprentissage de frappe (`node typing.js <mots>`)

## Licence

MIT
