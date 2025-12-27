import { SerialPort } from 'serialport';

/**
 * Classe pour contrôler un Minitel via port série
 */
export class Minitel {
  constructor(portPath, options = {}) {
    this.portPath = portPath;
    this.options = {
      baudRate: 1200,
      dataBits: 7,
      parity: 'even',
      stopBits: 1,
      ...options
    };
    this.port = null;
    this.isConnected = false;
    this.inputBuffer = [];
    this.bufferTimeout = null;
  }

  /**
   * Connecte au Minitel
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: this.portPath,
        ...this.options
      }, (err) => {
        if (err) {
          reject(new Error(`Erreur de connexion: ${err.message}`));
          return;
        }
        this.isConnected = true;
        console.log(`Connecté au Minitel sur ${this.portPath}`);
        resolve();
      });

      // Écoute les données reçues du Minitel
      this.port.on('data', (data) => {
        this.handleInputData(data);
      });

      this.port.on('error', (err) => {
        console.error('Erreur port série:', err.message);
      });
    });
  }

  /**
   * Déconnecte du Minitel
   */
  async disconnect() {
    if (this.port && this.port.isOpen) {
      return new Promise((resolve) => {
        this.port.close(() => {
          this.isConnected = false;
          console.log('Déconnecté du Minitel');
          resolve();
        });
      });
    }
  }

  /**
   * Gère les données entrantes avec buffering pour les touches de fonction
   */
  handleInputData(data) {
    // Ajouter les nouveaux bytes au buffer
    for (const byte of data) {
      this.inputBuffer.push(byte);
    }

    // Annuler le timeout précédent
    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout);
    }

    // Définir un nouveau timeout pour traiter le buffer
    // Les touches de fonction envoient 0x13 suivi d'un caractère rapidement
    this.bufferTimeout = setTimeout(() => {
      if (this.inputBuffer.length > 0) {
        const bufferedData = Buffer.from(this.inputBuffer);
        this.inputBuffer = [];
        this.onData(bufferedData);
      }
    }, 50); // 50ms pour permettre aux 2 bytes d'arriver
  }

  /**
   * Callback appelé quand des données sont reçues du Minitel
   * À surcharger pour traiter les données reçues
   */
  onData(data) {
    // Conversion en chaîne pour affichage
    const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log('Reçu:', hex, '|', data.toString('ascii'));
  }

  /**
   * Envoie des données brutes au Minitel
   */
  async write(data) {
    if (!this.isConnected) {
      throw new Error('Non connecté au Minitel');
    }

    return new Promise((resolve, reject) => {
      this.port.write(data, (err) => {
        if (err) {
          reject(new Error(`Erreur d'écriture: ${err.message}`));
        } else {
          this.port.drain(() => resolve());
        }
      });
    });
  }

  /**
   * Convertit un caractère Unicode en séquence de bytes Minitel
   * Gère les accents français automatiquement
   */
  static charToMinitel(char) {
    // Table de conversion des caractères accentués
    // Format: préfixe accent (0x19 + code) + lettre de base
    const accentMap = {
      // Accent grave (0x19 0x41)
      'à': [0x19, 0x41, 0x61], // grave + a
      'è': [0x19, 0x41, 0x65], // grave + e
      'ù': [0x19, 0x41, 0x75], // grave + u
      'À': [0x19, 0x41, 0x41], // grave + A
      'È': [0x19, 0x41, 0x45], // grave + E
      'Ù': [0x19, 0x41, 0x55], // grave + U

      // Accent aigu (0x19 0x42)
      'é': [0x19, 0x42, 0x65], // aigu + e
      'É': [0x19, 0x42, 0x45], // aigu + E

      // Accent circonflexe (0x19 0x43)
      'â': [0x19, 0x43, 0x61], // circonflexe + a
      'ê': [0x19, 0x43, 0x65], // circonflexe + e
      'î': [0x19, 0x43, 0x69], // circonflexe + i
      'ô': [0x19, 0x43, 0x6F], // circonflexe + o
      'û': [0x19, 0x43, 0x75], // circonflexe + u
      'Â': [0x19, 0x43, 0x41], // circonflexe + A
      'Ê': [0x19, 0x43, 0x45], // circonflexe + E
      'Î': [0x19, 0x43, 0x49], // circonflexe + I
      'Ô': [0x19, 0x43, 0x4F], // circonflexe + O
      'Û': [0x19, 0x43, 0x55], // circonflexe + U

      // Tréma (0x19 0x48)
      'ë': [0x19, 0x48, 0x65], // tréma + e
      'ï': [0x19, 0x48, 0x69], // tréma + i
      'ü': [0x19, 0x48, 0x75], // tréma + u
      'Ë': [0x19, 0x48, 0x45], // tréma + E
      'Ï': [0x19, 0x48, 0x49], // tréma + I
      'Ü': [0x19, 0x48, 0x55], // tréma + U

      // Cédille - utiliser accent grave + c
      'ç': [0x19, 0x4B, 0x63], // cédille + c
      'Ç': [0x19, 0x4B, 0x43], // cédille + C

      // OE ligaturé
      'œ': [0x19, 0x7A], // oe minuscule
      'Œ': [0x19, 0x6A], // OE majuscule

      // Symboles spéciaux
      '£': [0x19, 0x23], // Livre sterling
      '§': [0x19, 0x27], // Paragraphe
      '←': [0x19, 0x2C], // Flèche gauche
      '↑': [0x19, 0x2D], // Flèche haute
      '→': [0x19, 0x2E], // Flèche droite
      '↓': [0x19, 0x2F], // Flèche basse
      '°': [0x19, 0x30], // Rond (degré)
      '±': [0x19, 0x31], // Plus/moins
      '¼': [0x19, 0x3C], // Quart
      '½': [0x19, 0x3D], // Demi
      '¾': [0x19, 0x3E], // Trois quarts
      'β': [0x19, 0x7B], // Beta

      // Apostrophes et guillemets typographiques -> ASCII
      "\u2019": [0x27], // Apostrophe courbe droite (') -> '
      "\u2018": [0x27], // Apostrophe courbe gauche (') -> '
      "\u201D": [0x22], // Guillemet double courbe droite (") -> "
      "\u201C": [0x22], // Guillemet double courbe gauche (") -> "
      "\u00AB": [0x22], // Guillemet français ouvrant («) -> "
      "\u00BB": [0x22], // Guillemet français fermant (») -> "
      "\u2039": [0x27], // Guillemet simple ouvrant (‹) -> '
      "\u203A": [0x27]  // Guillemet simple fermant (›) -> '
    };

    if (accentMap[char]) {
      return accentMap[char];
    }

    // Caractère ASCII standard
    const code = char.charCodeAt(0);
    if (code <= 127) {
      return [code];
    }

    // Caractère non supporté - remplacer par ?
    return [0x3F]; // ?
  }

  /**
   * Envoie une chaîne de texte au Minitel
   * Gère automatiquement les accents français
   */
  async writeText(text) {
    const bytes = [];

    for (const char of text) {
      const minitelBytes = Minitel.charToMinitel(char);
      bytes.push(...minitelBytes);
    }

    const buffer = Buffer.from(bytes);
    return this.write(buffer);
  }

  /**
   * Écrit un caractère répété en utilisant la commande REP (0x12) du Minitel
   * Optimise l'envoi de caractères répétés pour économiser la bande passante
   * N'utilise REP que si count >= 4 (seuil de rentabilité : 3 octets REP vs N octets)
   * @param {string} char - Le caractère à répéter (un seul caractère)
   * @param {number} count - Le nombre de répétitions
   */
  async writeRepeated(char, count) {
    if (count <= 0) return;
    if (count <= 3) {
      // Pour 1-3 répétitions, envoyer directement les caractères (plus économique)
      return this.writeText(char.repeat(count));
    } else if (count <= 64) {
      // Utiliser REP : caractère + 0x12 + (count-1+64)
      // La commande REP répète le dernier caractère (count-1) fois supplémentaires
      return this.write(Buffer.from([char.charCodeAt(0), 0x12, count - 1 + 64]));
    } else {
      // Si > 64, découper en plusieurs REP (maximum 64 répétitions par commande)
      await this.writeRepeated(char, 64);
      return this.writeRepeated(char, count - 64);
    }
  }

  /**
   * Codes de contrôle Vidéotex
   */
  static get CODES() {
    return {
      // Codes de base
      BEL: 0x07,    // Sonnerie
      BS: 0x08,     // Retour arrière
      HT: 0x09,     // Tabulation
      LF: 0x0A,     // Saut de ligne
      VT: 0x0B,     // Tabulation verticale
      FF: 0x0C,     // Effacement écran (Form Feed)
      CR: 0x0D,     // Retour chariot
      SO: 0x0E,     // Shift Out (mode graphique)
      SI: 0x0F,     // Shift In (mode texte)

      // Codes de visibilité du curseur
      CON: 0x11,    // Curseur invisible (Cursor ON)
      COFF: 0x14,   // Curseur visible (Cursor OFF)

      // Préfixe des touches de fonction (0x13 + ASCII)
      FUNCTION_KEY_PREFIX: 0x13,

      // Touches de fonction du Minitel (dans l'ordre du clavier physique)
      // Ligne 1 (touches marron) :
      KEY_CONNEXION_FIN: 0x59,  // 'Y' - Touche CONNEXION/FIN
      KEY_SOMMAIRE: 0x46,       // 'F' - Touche SOMMAIRE
      KEY_ANNULATION: 0x45,     // 'E' - Touche ANNULATION
      KEY_RETOUR: 0x42,         // 'B' - Touche RETOUR
      KEY_REPETITION: 0x43,     // 'C' - Touche RÉPÉTITION
      // Ligne 2 (touches marron + verte) :
      KEY_GUIDE: 0x44,          // 'D' - Touche GUIDE
      KEY_CORRECTION: 0x47,     // 'G' - Touche CORRECTION
      KEY_SUITE: 0x48,          // 'H' - Touche SUITE
      KEY_ENVOI: 0x41,          // 'A' - Touche ENVOI (verte)

      // Codes ESC
      ESC: 0x1B,

      // Codes de positionnement
      HOME: 0x1E,   // Curseur en haut à gauche

      // Codes de déplacement curseur (après 0x1B)
      CURSOR_UP: 0x5B,    // ESC [
      CURSOR_DOWN: 0x5C,  // ESC \
      CURSOR_RIGHT: 0x5D, // ESC ]
      CURSOR_LEFT: 0x5E,  // ESC ^

      // Séparateurs
      SEP: 0x1F,    // Séparateur (pour positionnement curseur)

      // Codes de niveaux de gris (précédés de ESC)
      // Minitel 1 RTIC noir et blanc - du plus clair au plus sombre
      WHITE: 0x47,              // Blanc (le plus clair)
      GRAY_VERY_LIGHT: 0x43,    // Gris très clair
      GRAY_LIGHT: 0x46,         // Gris clair
      GRAY_MEDIUM_LIGHT: 0x42,  // Gris moyen-clair
      GRAY_MEDIUM: 0x45,        // Gris moyen
      GRAY_MEDIUM_DARK: 0x41,   // Gris moyen-sombre
      GRAY_DARK: 0x44,          // Gris sombre
      BLACK: 0x40,              // Noir (invisible)

      // Codes de fond (précédés de ESC)
      WHITE_BACKGROUND: 0x57,   // ESC W : Fond blanc
      BLACK_BACKGROUND: 0x50,   // ESC P : Fond noir

      // Codes de taille de caractère (précédés de ESC)
      SIZE_NORMAL: 0x4C,        // ESC L : Taille normale
      SIZE_DOUBLE_HEIGHT: 0x4D, // ESC M : Double hauteur
      SIZE_DOUBLE_WIDTH: 0x4E,  // ESC N : Double largeur
      SIZE_DOUBLE: 0x4F,        // ESC O : Double taille (hauteur et largeur)

      // Codes de clignotement (précédés de ESC)
      BLINK: 0x48,              // ESC H : Clignotement
      STEADY: 0x49,             // ESC I : Fixe (arrêt du clignotement)

      // Codes PRO (Protocol)
      PRO1: 0x39,   // Mode rouleau (après ESC)
      PRO2: 0x3A    // Mode page (après ESC)
    };
  }

  /**
   * Vérifie si les données correspondent à une touche de fonction
   * Retourne le code de la touche ou null
   */
  static parseFunctionKey(data) {
    if (data.length === 2 && data[0] === Minitel.CODES.FUNCTION_KEY_PREFIX) {
      return data[1];
    }
    return null;
  }

  /**
   * Efface l'écran du Minitel
   */
  async clear() {
    return this.write(Buffer.from([Minitel.CODES.FF]));
  }

  /**
   * Place le curseur en position (ligne, colonne)
   * Ligne: 1-24, Colonne: 1-40
   *
   * IMPORTANT: Cette fonction réinitialise le niveau de gris.
   * Il faut donc rappeler setGray() après chaque appel à moveCursor().
   */
  async moveCursor(row, col) {
    if (row < 1 || row > 24 || col < 1 || col > 40) {
      throw new Error('Position curseur invalide (ligne: 1-24, colonne: 1-40)');
    }

    // Séquence: SEP + ligne + colonne
    // Les valeurs sont encodées en ajoutant 0x40
    const buffer = Buffer.from([
      Minitel.CODES.SEP,
      0x40 + row,
      0x40 + col
    ]);

    return this.write(buffer);
  }

  /**
   * Place le curseur en haut à gauche
   */
  async home() {
    return this.write(Buffer.from([Minitel.CODES.HOME]));
  }

  /**
   * Envoie un code de formatage précédé de ESC
   * @param {number|string} code - Le code de formatage à envoyer (nombre ou nom)
   */
  async setFormat(code) {
    // Si c'est une chaîne, la convertir en code numérique
    if (typeof code === 'string') {
      const formatCodes = {
        // Niveaux de gris
        'white': Minitel.CODES.WHITE,
        'very-light': Minitel.CODES.GRAY_VERY_LIGHT,
        'light': Minitel.CODES.GRAY_LIGHT,
        'medium-light': Minitel.CODES.GRAY_MEDIUM_LIGHT,
        'medium': Minitel.CODES.GRAY_MEDIUM,
        'medium-dark': Minitel.CODES.GRAY_MEDIUM_DARK,
        'dark': Minitel.CODES.GRAY_DARK,
        'black': Minitel.CODES.BLACK,
        // Fonds
        'white-background': Minitel.CODES.WHITE_BACKGROUND,
        'black-background': Minitel.CODES.BLACK_BACKGROUND,
        // Tailles
        'normal': Minitel.CODES.SIZE_NORMAL,
        'double-height': Minitel.CODES.SIZE_DOUBLE_HEIGHT,
        'double-width': Minitel.CODES.SIZE_DOUBLE_WIDTH,
        'double': Minitel.CODES.SIZE_DOUBLE,
        // Clignotement
        'blink': Minitel.CODES.BLINK,
        'steady': Minitel.CODES.STEADY
      };

      const numericCode = formatCodes[code.toLowerCase()];
      if (numericCode === undefined) {
        const validFormats = Object.keys(formatCodes).join(', ');
        throw new Error(`Format invalide: ${code}. Valeurs possibles: ${validFormats}`);
      }
      code = numericCode;
    }

    return this.write(Buffer.from([Minitel.CODES.ESC, code]));
  }

  /**
   * Affiche du texte à une position donnée
   */
  async printAt(row, col, text) {
    await this.moveCursor(row, col);
    await this.writeText(text);
  }

  /**
   * Fait sonner le Minitel
   */
  async beep() {
    return this.write(Buffer.from([Minitel.CODES.BEL]));
  }

  /**
   * Envoie une nouvelle ligne
   */
  async newLine() {
    return this.write(Buffer.from([Minitel.CODES.CR, Minitel.CODES.LF]));
  }

  /**
   * Rend le curseur invisible (masque l'affichage des touches)
   * Utile pour les jeux et applications interactives
   */
  async hideCursor() {
    return this.write(Buffer.from([Minitel.CODES.COFF]));
  }

  /**
   * Rend le curseur visible
   */
  async showCursor() {
    return this.write(Buffer.from([Minitel.CODES.CON]));
  }

  /**
   * Active le mode page (désactive le scroll automatique)
   */
  async enablePageMode() {
    return this.setFormat(Minitel.CODES.PRO2);
  }

  /**
   * Active le mode rouleau (scroll automatique)
   */
  async enableScrollMode() {
    return this.setFormat(Minitel.CODES.PRO1);
  }
}

export default Minitel;
