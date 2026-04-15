// FlightSchedule — French copy single source of truth.
//
// V1 is French-only. Rather than pulling in an i18n library, we keep
// every user-facing string in this typed object. Benefits:
//
//   - Compile-time safety (typos in COPY.foo.bar fail the build)
//   - Easy global review for tone consistency
//   - Cheap migration path to next-intl or similar in V2 if needed
//
// Convention: organize by feature area, then by element. Keep keys
// short and descriptive. Sentences end with a period; button labels
// don't.

export const COPY = {
  brand: {
    name: "FlightSchedule",
    tagline: "Le planning de votre avion, simplement.",
  },

  common: {
    appName: "FlightSchedule",
    save: "Enregistrer",
    cancel: "Annuler",
    delete: "Supprimer",
    edit: "Modifier",
    confirm: "Confirmer",
    back: "Retour",
    loading: "Chargement…",
    noData: "Aucune donnée",
    yes: "Oui",
    no: "Non",
    required: "obligatoire",
    optional: "facultatif",
    closeDialog: "Fermer la fenêtre",
  },

  nav: {
    dashboard: "Tableau de bord",
    calendar: "Mes réservations",
    newFlight: "Nouveau vol",
    myFlights: "Mes vols",
    admin: "Administration",
    adminPilots: "Pilotes",
    adminDisponibilites: "Disponibilités",
    adminTarifs: "Tarifs",
    adminVirements: "Encaissements",
    signOut: "Déconnexion",
  },

  auth: {
    loginTitle: "Connexion",
    loginRestricted: "Accès réservé aux pilotes autorisés.",
    emailLabel: "Email",
    passwordLabel: "Mot de passe",
    signIn: "Se connecter",
    invalidCredentials: "Identifiants incorrects.",
    genericError: "Erreur de connexion. Réessayez.",

    setupTitle: "Définir votre mot de passe",
    setupIntro:
      "Bienvenue sur FlightSchedule. Choisissez un mot de passe pour sécuriser votre compte.",
    newPassword: "Nouveau mot de passe",
    confirmPassword: "Confirmer le mot de passe",
    setupSubmit: "Définir le mot de passe",
    pwTooShort: "Le mot de passe doit contenir au moins 10 caractères.",
    pwTooWeak:
      "Le mot de passe doit contenir au moins une lettre majuscule, une minuscule et un chiffre.",
    pwMismatch: "Les deux mots de passe ne correspondent pas.",
    pwUpdated: "Mot de passe mis à jour.",
  },

  dashboard: {
    title: "Tableau de bord",
    welcome: "Bienvenue",
    adminBadge: "Administrateur",
    balanceLabel: "Solde HDV",
    buyHdv: "Acheter des HDV",
    book: "Réserver",
    logFlight: "Saisir un vol",
    packages: "Forfaits HDV",
    pkgVatNote: "Une TVA de 20% sera appliquée",
    buy: "Acheter",
    pkgUnavailable: "Bientôt disponible",
    transactions: "Historique des mouvements",
    transactionsEmpty: "Aucun mouvement pour le moment.",
  },

  checkout: {
    successTitle: "Paiement validé",
    successBody: "Votre solde HDV a été mis à jour.",
    successPending:
      "Mise à jour en cours, rafraîchissez dans quelques secondes si le solde n'apparaît pas encore.",
    backToDashboard: "Retour au tableau de bord",
    cancelTitle: "Paiement annulé",
    cancelBody: "Vous pouvez réessayer à tout moment.",
  },

  payment: {
    // Modal shell
    modalTitle: "Recharger mon solde",
    tabCard: "Carte bancaire",
    tabBank: "Virement bancaire",
    close: "Fermer",

    // Card tab
    cardPay: "Payer",
    cardProcessing: "Paiement en cours…",
    cardSuccessTitle: "Paiement validé",
    cardSuccessBody: "Votre solde HDV vient d'être crédité.",
    cardErrorTitle: "Le paiement a échoué.",
    cardSaveLabel: "Enregistrer cette carte pour mes prochains paiements",
    cardUseAnother: "Utiliser une autre carte",

    // Bank tab
    bankProcessing: "Chargement des coordonnées bancaires…",
    bankDetailsTitle: "Virement à effectuer",
    bankReferenceLabel: "Référence à indiquer dans le virement",
    bankReferenceCopy: "Copier",
    bankReferenceCopied: "Copié",
    bankHolderLabel: "Titulaire",
    bankIbanLabel: "IBAN",
    bankBicLabel: "BIC",
    bankBankNameLabel: "Banque",
    bankAmountLabel: "Montant",
    bankDetailsHint:
      "Effectuez le virement depuis votre banque en indiquant impérativement la référence ci-dessus.",
    bankKeepOpenWarning:
      "Cliquez sur « J'ai effectué le virement » uniquement après avoir validé l'opération depuis votre banque.",
    bankRegister: "J'ai effectué le virement",
    bankRegisterProcessing: "Enregistrement…",
    bankRegisteredTitle: "Virement enregistré",
    bankRegisteredBody:
      "Votre solde sera crédité dès que l'administrateur aura validé la réception du virement.",
    bankRegisteredRefChanged:
      "Votre référence a été mise à jour pour éviter une collision. Utilisez le code suivant dans votre virement :",
    bankNotConfigured:
      "Aucun compte bancaire n'est configuré pour le moment. Contactez l'administrateur.",
  },

  flight: {
    blocOff: "Heure bloc OFF",
    blocOn: "Heure bloc ON",
    durationComputed: "Durée calculée",
  },

  txTypes: {
    PACKAGE_PURCHASE: "Achat HDV",
    FLIGHT_DEBIT: "Vol",
    CANCELLATION_REFUND: "Remboursement",
    ADMIN_ADJUSTMENT: "Ajustement administrateur",
    BANK_TRANSFER: "Virement bancaire",
  },

  errors: {
    generic: "Une erreur est survenue. Réessayez ou contactez l'administrateur.",
    forbidden: "Accès refusé.",
    notFound: "Introuvable.",
    rateLimited: "Trop de requêtes. Patientez un instant.",
    insufficientBalance: "Solde HDV insuffisant pour cette opération.",
    invalidInput: "Données invalides.",
  },

  onboarding: {
    // Welcome screen shell
    welcomeEyebrow: "Bienvenue à bord",
    welcomeTitle: "En 1 minute, prêt à décoller",
    welcomeIntro: "3 cartes · environ 1 minute",
    stepLabel: "Étape {n} / {total}",
    skip: "Passer",
    next: "Suivant",
    understood: "J'ai compris",
    finalCta: "Réserver l'avion",

    // Card 1 — HDV wallet
    card1Title: "Votre solde HDV",
    card1Body:
      "Vos heures de vol sont stockées en minutes dans un solde personnel. Vous le rechargez avec un forfait, et chaque vol enregistré le décompte automatiquement.",
    card1TiersLead: "Repères de couleur sur votre tableau de bord :",
    card1TierGreen: "Vert · plus de 5 h",
    card1TierAmber: "Ambre · entre 2 h et 5 h",
    card1TierRed: "Rouge · moins de 2 h, pensez à recharger",

    // Card 2 — V2 inversion
    card2Title: "Réserver ≠ voler",
    card2Body:
      "Une réservation bloque le créneau, mais ne décompte aucune heure. Le solde HDV est ajusté uniquement à la saisie du vol, à partir des heures bloc OFF et bloc ON. Vous pouvez aussi enregistrer un vol sans avoir réservé : la réservation sera créée pour vous.",

    // Card 3 — first booking
    card3Title: "Votre premier créneau",
    card3Body:
      "L'avion est disponible 24 h/24 dans les plages d'ouverture définies par l'administrateur. Quelques règles à retenir :",
    card3Rule3h: "Bloc minimum de 3 heures par réservation.",
    card3Rule24h:
      "Annulation libre jusqu'à 24 h avant le créneau. Au-delà, contactez l'administrateur.",

    // Contextual hints
    hintDashboardTitle: "Votre solde, en un coup d'œil",
    hintDashboardBody:
      "Vert au-dessus de 5 h, ambre entre 2 h et 5 h, rouge en dessous. Rechargez via un forfait HDV plus bas sur cette page dès que la jauge passe à l'ambre.",
    hintCalendarTitle: "Comment réserver",
    hintCalendarBody:
      "Choisissez la date et l'heure (bloc minimum 3 h) puis confirmez. Vous pourrez annuler vous-même jusqu'à 24 h avant le créneau ; passé ce délai, contactez l'administrateur.",
    hintFlightsEngineTitle: "Heures bloc OFF / bloc ON",
    hintFlightsEngineBody:
      "Ce sont elles qui calculent la durée du vol et débitent votre solde HDV. Pas besoin d'avoir réservé au préalable : la réservation sera rattachée ou créée automatiquement.",
    hintFlightsImmutableTitle: "Vos vols sont définitifs",
    hintFlightsImmutableBody:
      "Une fois enregistré, un vol ne peut plus être modifié ni supprimé depuis votre compte. En cas d'erreur, contactez l'administrateur — il pourra corriger les heures et le solde sera ajusté.",
    hintDismiss: "Compris",

    // Admin replay
    adminReplay: "Rejouer l'onboarding",
    adminReplayHint: "Relance le tutoriel d'accueil pour votre propre compte.",
  },
} as const;

export type Copy = typeof COPY;
