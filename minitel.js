import { SerialPort } from 'serialport';

/**
 * Classe pour contrôler un Minitel via port série
 */
export class Minitel {
  constructor(portPath, options = {}) {
    this.portPath = portPath;
    this.options = {
      baudRate: options.baudRate || 'auto', // 'auto', 1200, 4800, or 9600
      dataBits: 7,
      parity: 'even',
      stopBits: 1,
      autoUpgradeSpeed: options.autoUpgradeSpeed !== undefined ? options.autoUpgradeSpeed : true,
      ...options
    };
    this.port = null;
    this.isConnected = false;
    this.inputBuffer = [];
    this.bufferTimeout = null;
    this.deviceInfo = null;
    this.currentBaudRate = null;
    this.expectedReplies = []; // Liste des réponses attendues {predicate, resolve, timeout}
    this.nextReplyId = 0;
  }

  /**
   * Connecte au Minitel avec auto-détection optionnelle
   */
  async connect() {
    const baudRate = this.options.baudRate;

    if (baudRate === 'auto') {
      // Essayer plusieurs vitesses
      const baudRates = [1200, 4800, 9600];

      for (const rate of baudRates) {
        try {
          await this._connectAtBaudRate(rate, true); // isAutoDetect = true
          // Si succès, on a trouvé la bonne vitesse
          return;
        } catch (err) {
          // Essayer la vitesse suivante
          if (this.port && this.port.isOpen) {
            await this._closePort();
          }
        }
      }

      throw new Error('Impossible de détecter le Minitel sur aucune vitesse');
    } else {
      // Connexion directe à la vitesse spécifiée
      await this._connectAtBaudRate(baudRate, false); // isAutoDetect = false
    }
  }

  /**
   * Tente une connexion à une vitesse donnée
   * @param {number} baudRate - Vitesse en bauds
   * @param {boolean} isAutoDetect - True si mode auto-détection (timeout réduit)
   */
  async _connectAtBaudRate(baudRate, isAutoDetect = false) {
    this.currentBaudRate = baudRate;

    return new Promise((resolve, reject) => {
      const portOptions = {
        path: this.portPath,
        baudRate: baudRate,
        dataBits: this.options.dataBits,
        parity: this.options.parity,
        stopBits: this.options.stopBits
      };

      this.port = new SerialPort(portOptions, async (err) => {
        if (err) {
          reject(new Error(`Erreur de connexion: ${err.message}`));
          return;
        }

        // Écoute les données reçues du Minitel
        this.port.on('data', (data) => {
          this.handleInputData(data);
        });

        this.port.on('error', (err) => {
          console.error('Erreur port série:', err.message);
        });

        // Attendre un peu que le port se stabilise (seulement en connexion directe)
        if (!isAutoDetect) {
          await this._sleep(200);
        }

        try {
          // Interroger le périphérique
          // Timeout réduit à 200ms en auto-détection pour réduire l'affichage des parasites
          const timeout = isAutoDetect ? 200 : 2000;
          const deviceInfo = await this._queryDevice(timeout);

          if (deviceInfo) {
            this.deviceInfo = deviceInfo;
            this.isConnected = true;

            const idCode = `${deviceInfo.constructeur}${deviceInfo.type}${deviceInfo.version}`;
            console.log(`Connecté au ${deviceInfo.name} [${idCode}] à ${this.currentBaudRate} bauds`);

            // Effacer l'écran pour supprimer les caractères parasites des tentatives précédentes
            await this.clear();

            // Upgrade de vitesse si demandé et supporté
            if (this.options.autoUpgradeSpeed && deviceInfo.maxSpeed > this.currentBaudRate) {
              const initialSpeed = this.currentBaudRate;
              try {
                await this._upgradeSpeed(deviceInfo.maxSpeed);
                console.log(`Vitesse augmentée: ${initialSpeed} → ${this.currentBaudRate} bauds`);
              } catch (err) {
                console.log(`Impossible d'augmenter la vitesse: ${err.message}`);
              }
            }

            resolve();
          } else {
            reject(new Error('Pas de réponse du Minitel'));
          }
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Attend une réponse du Minitel en utilisant le système expectedReplies
   * @param {Function} predicate - Fonction qui teste si le buffer reçu est la réponse attendue
   * @param {number} timeoutMs - Délai d'attente en millisecondes
   * @returns {Promise<Buffer>} - Promise résolue avec les données reçues ou rejetée en cas de timeout
   */
  async _waitForResponse(predicate, timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.expectedReplies.findIndex(r => r.id === id);
        if (index !== -1) {
          this.expectedReplies.splice(index, 1);
        }
        reject(new Error('Timeout waiting for Minitel response'));
      }, timeoutMs);

      const id = this.nextReplyId++;
      this.expectedReplies.push({ id, predicate, resolve, timeout });
    });
  }

  /**
   * Interroge le périphérique pour obtenir son identification
   * @param {number} timeout - Timeout en ms (défaut: 2000, réduit lors de l'auto-détection)
   */
  async _queryDevice(timeout = 2000) {
    // Envoyer la requête d'identification: ESC PRO1 ENQROM
    const query = Buffer.from([Minitel.CODES.ESC, Minitel.CODES.PRO1, Minitel.CODES.ENQROM]);
    this.port.write(query);

    try {
      // Attendre une réponse qui commence par SOH et contient au moins 5 bytes
      const response = await this._waitForResponse(
        data => data.length >= 5 && data[0] === Minitel.CODES.SOH,
        timeout
      );

      return Minitel.parseDeviceIdentification(response);
    } catch (err) {
      // Pas de réponse dans le délai
      return null;
    }
  }

  /**
   * Parse la réponse d'identification du périphérique
   * Format: SOH + constructeur + type + version + EOT
   * Le lookup se fait uniquement sur constructeur + type (2 premiers octets)
   */
  static parseDeviceIdentification(data) {
    if (data.length < 5) return null;

    // La réponse commence par SOH et se termine par EOT
    if (data[0] !== Minitel.CODES.SOH) return null;

    const constructeur = String.fromCharCode(data[1]);
    const type = String.fromCharCode(data[2]);
    const version = data[3];
    const versionStr = String.fromCharCode(version);

    // Lookup table basée sur constructeur + type
    // Le numéro de version n'est pas pris en compte
    const typeLookup = {
      // Cb : Modèles Télic à clavier ABCD et modem non retournable (versions b0 à b5)
      'Cb': { name: 'Minitel 1 (Télic)', maxSpeed: 1200 },

      // Cc : Modèle Télic à clavier AZERTY et modem non retournable (version c5)
      'Cc': { name: 'Minitel 1 (Télic AZERTY)', maxSpeed: 1200 },

      // Cr : Modèle Télic et Matra de type M1 (version r0)
      'Cr': { name: 'Minitel 1 (Télic/Matra)', maxSpeed: 1200 },

      // Bc : Modèle Radiotechnique à modem non retournable (version c0)
      'Bc': { name: 'Minitel 1 (Radiotechnique)', maxSpeed: 1200 },

      // Br : Modèles Radiotechnique de type M1 (versions r0 à r4)
      'Br': { name: 'Minitel 1 (RTIC)', maxSpeed: 1200 },

      // Bs : Minitel 1 Couleur Radiotechnique (version s0)
      'Bs': { name: 'Minitel 1 Couleur (RTIC)', maxSpeed: 1200 },

      // Cu : Modèles Télic et Matra de type M1Bistandard (versions u2 à u<)
      'Cu': { name: 'Minitel 1B (Télic/Matra)', maxSpeed: 4800 },

      // Bu : Modèles RTIC de type M1Bistandard (version u0 et suivants)
      'Bu': { name: 'Minitel 1B (RTIC)', maxSpeed: 4800 },

      // Cd : Modèles Télic de type M10 sans modem retournable (versions d1 à d6)
      'Cd': { name: 'Minitel 10 (Télic)', maxSpeed: 4800 },

      // Cf : Modèles Télix de type M10 avec modem retournable (versions f0 à f1)
      'Cf': { name: 'Minitel 10 (Télix)', maxSpeed: 4800 },

      // Cw : Modèles Télix de type M10 Bistandard (version w0 et suivants)
      'Cw': { name: 'Minitel 10B (Télix)', maxSpeed: 4800 },

      // Cv : Minitel 2 Télic (versions vt, v:, v;)
      'Cv': { name: 'Minitel 2 (Télic)', maxSpeed: 9600 },

      // Bv : Minitel 2 Philips (versions v1 à v4, v6 à v9)
      'Bv': { name: 'Minitel 2 (Philips)', maxSpeed: 9600 },

      // Cz : Minitel 12 Télic (versions z2 à z5)
      'Cz': { name: 'Minitel 12 (Télic)', maxSpeed: 4800 },

      // Bz : Minitel 12 Philips (version z1 et suivants)
      'Bz': { name: 'Minitel 12 (Philips)', maxSpeed: 9600 },

      // Ay : Minitel 5 Matra (version y0 et suivants)
      'Ay': { name: 'Minitel 5 (Matra)', maxSpeed: 4800 },

      // Cp : Magis Club (versions p1, p2, p3 = v1; p>3 = v2)
      'Cp': { name: 'Magis Club', maxSpeed: 9600 }
    };

    const typeCode = constructeur + type;
    const deviceInfo = typeLookup[typeCode];

    if (deviceInfo) {
      return {
        name: deviceInfo.name,
        maxSpeed: deviceInfo.maxSpeed,
        constructeur,
        type,
        version: versionStr,
        rawResponse: data.toString('hex')
      };
    }

    // Réponse non reconnue - utiliser les heuristiques de base
    // Type 'u' ou 'w' = Bistandard (4800), sinon 1200
    const isBistandard = (type === 'u' || type === 'w');
    const maxSpeed = isBistandard ? 4800 : 1200;

    return {
      name: `Minitel ${typeCode}${versionStr}`,
      maxSpeed,
      constructeur,
      type,
      version: versionStr,
      rawResponse: data.toString('hex')
    };
  }

  /**
   * Upgrade la vitesse de communication
   */
  async _upgradeSpeed(newSpeed) {
    // Commande PRO2 PROG_VITESSE avec octet de programmation vitesse
    // Format octet: P 1 E2 E1 E0 R2 R1 R0
    // où E=vitesse émission, R=vitesse réception
    // 001=75, 010=300, 100=1200, 110=4800, 111=9600
    const speedCodes = {
      300: 0x52,   // 0 1 010 010
      1200: 0x64,  // 0 1 100 100
      4800: 0x76,  // 0 1 110 110
      9600: 0x7F   // 0 1 111 111
    };

    const speedCode = speedCodes[newSpeed];
    if (!speedCode) {
      throw new Error(`Vitesse non supportée: ${newSpeed}`);
    }

    // Envoyer la commande de changement de vitesse: ESC PRO2 PROG_VITESSE speedCode
    const command = Buffer.from([
      Minitel.CODES.ESC,
      Minitel.CODES.PRO2,
      Minitel.CODES.PROG_VITESSE,
      speedCode
    ]);
    await this.write(command);

    // Attendre que le Minitel change de vitesse
    await this._sleep(300);

    // Fermer et rouvrir le port à la nouvelle vitesse
    await this._closePort();
    this.currentBaudRate = newSpeed;

    return new Promise((resolve, reject) => {
      const portOptions = {
        path: this.portPath,
        baudRate: newSpeed,
        dataBits: this.options.dataBits,
        parity: this.options.parity,
        stopBits: this.options.stopBits
      };

      this.port = new SerialPort(portOptions, async (err) => {
        if (err) {
          reject(new Error(`Erreur de reconnexion: ${err.message}`));
          return;
        }

        // Réinstaller les handlers
        this.port.on('data', (data) => {
          this.handleInputData(data);
        });

        this.port.on('error', (err) => {
          console.error('Erreur port série:', err.message);
        });

        await this._sleep(200);
        resolve();
      });
    });
  }

  /**
   * Ferme le port proprement
   */
  async _closePort() {
    if (this.port && this.port.isOpen) {
      return new Promise((resolve) => {
        this.port.close(() => resolve());
      });
    }
  }

  /**
   * Helper pour les délais
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
   * Attend une réponse du Minitel qui satisfait un prédicat
   * Gère proprement les timeouts et restaure le handler original
   *
   * @param {Function} predicate - Fonction qui teste si les données reçues correspondent (reçoit Buffer)
   * @param {number} timeout - Timeout en ms
   * @returns {Promise<Buffer>} - Les données reçues qui satisfont le prédicat
   */
  async _waitForResponse(predicate, timeout = 1000) {
    return new Promise((resolve, reject) => {
      let responseData = [];
      let timer;
      const originalOnData = this.onData;

      const cleanup = () => {
        clearTimeout(timer);
        this.onData = originalOnData;
      };

      this.onData = (data) => {
        responseData.push(...data);
        const buffer = Buffer.from(responseData);

        if (predicate(buffer)) {
          cleanup();
          resolve(buffer);
        }
      };

      timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout en attente de réponse du Minitel'));
      }, timeout);
    });
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

        // Vérifier d'abord si c'est une réponse attendue
        for (let i = 0; i < this.expectedReplies.length; i++) {
          const expected = this.expectedReplies[i];
          if (expected.predicate(bufferedData)) {
            // C'est une réponse attendue, la résoudre et ne pas la passer à onData
            clearTimeout(expected.timeout);
            this.expectedReplies.splice(i, 1);
            expected.resolve(bufferedData);
            return;
          }
        }

        // Sinon, passer les données à l'application
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
      // Utiliser REP : caractère + REP + (count-1+64)
      // La commande REP répète le dernier caractère (count-1) fois supplémentaires
      return this.write(Buffer.from([char.charCodeAt(0), Minitel.CODES.REP, count - 1 + 64]));
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

      // Codes de positionnement
      US: 0x1F,     // Unit Separator (pour positionnement curseur)

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

      // Codes PRO (Protocol) - préfixes pour commandes protocole
      PRO1: 0x39,   // Commande protocole à 1 octet (après ESC)
      PRO2: 0x3A,   // Commande protocole à 2 octets (après ESC)
      PRO3: 0x3B,   // Commande protocole à 3 octets (après ESC)

      // Commandes protocole
      PROG_VITESSE: 0x6B,  // Programmation vitesse
      STATUS_VITESSE: 0x75, // Status vitesse (réponse)

      // Commandes d'aiguillage (après ESC PRO3)
      AIGUILLAGE_OFF: 0x60,  // OFF - Rompre une liaison
      AIGUILLAGE_ON: 0x61,   // ON - Établir une liaison
      AIGUILLAGE_FROM: 0x63, // FROM - Accusé de réception (réponse du Minitel)

      // Codes modules - Émetteurs
      ECRAN_EMETTEUR: 0x50,
      CLAVIER_EMETTEUR: 0x51,
      MODEM_EMETTEUR: 0x52,
      PRISE_EMETTEUR: 0x53,
      MODULE_TEL_EMETTEUR: 0x54,

      // Codes modules - Récepteurs
      ECRAN_RECEPTEUR: 0x58,
      CLAVIER_RECEPTEUR: 0x59,
      MODEM_RECEPTEUR: 0x5A,
      PRISE_RECEPTEUR: 0x5B,
      MODULE_TEL_RECEPTEUR: 0x5C,

      // Codes d'encadrement
      SOH: 0x01,    // Start of Heading (début réponse identification)
      EOT: 0x04,    // End of Transmission (fin réponse identification)

      // Commandes spéciales
      REP: 0x12,    // Répétition de caractère
      ACCENT_PREFIX: 0x19,  // Préfixe pour caractères accentués

      // Paramètres PRO1
      ENQROM: 0x7B, // ENQuiry ROM - Requête identification ROM

      // Offsets
      CURSOR_OFFSET: 0x40   // Offset pour encodage position curseur
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
   * Ligne: 0-24 (0 est la ligne de status), Colonne: 1-40
   *
   * IMPORTANT: Cette fonction réinitialise le niveau de gris.
   * Il faut donc rappeler setGray() après chaque appel à moveCursor().
   */
  async moveCursor(row, col) {
    if (row < 0 || row > 24 || col < 1 || col > 40) {
      throw new Error('Position curseur invalide (ligne: 0-24, colonne: 1-40)');
    }

    // Séquence: US + ligne + colonne
    // Les valeurs sont encodées en ajoutant CURSOR_OFFSET
    const buffer = Buffer.from([
      Minitel.CODES.US,
      Minitel.CODES.CURSOR_OFFSET + row,
      Minitel.CODES.CURSOR_OFFSET + col
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
   * Désactive l'écho local du Minitel
   * Empêche le terminal d'afficher automatiquement les caractères tapés
   * Utile pour les jeux et applications interactives
   *
   * Commande d'aiguillage: PRO3, CODE COMMANDE, code réception, code émission
   * Format: ESC PRO3 AIGUILLAGE_OFF ECRAN_RECEPTEUR MODEM_EMETTEUR
   *
   * AIGUILLAGE_OFF = rompre la liaison entre module émetteur et module récepteur
   * ECRAN_RECEPTEUR = code récepteur Écran
   * MODEM_EMETTEUR = code émetteur Modem
   *
   * Attend la réponse d'acquittement: ESC PRO3 AIGUILLAGE_FROM module status
   *
   * Note: Utiliser CLAVIER_EMETTEUR au lieu de MODEM_EMETTEUR ne désactive pas l'écho.
   * Il faut rompre la liaison Modem → Écran, pas Clavier → Écran.
   */
  async disableLocalEcho() {
    // Envoyer la commande
    await this.write(Buffer.from([
      Minitel.CODES.ESC,
      Minitel.CODES.PRO3,
      Minitel.CODES.AIGUILLAGE_OFF,     // OFF - rompre la liaison
      Minitel.CODES.ECRAN_RECEPTEUR,    // Code récepteur Écran
      Minitel.CODES.MODEM_EMETTEUR      // Code émetteur Modem
    ]));

    try {
      // Attendre l'acquittement: ESC PRO3 FROM ...
      await this._waitForResponse(
        data => data.length >= 5 &&
                data[0] === Minitel.CODES.ESC &&
                data[1] === Minitel.CODES.PRO3 &&
                data[2] === Minitel.CODES.AIGUILLAGE_FROM,
        1000
      );
    } catch (err) {
      // Continuer même sans acquittement
    }
  }

}

export default Minitel;
