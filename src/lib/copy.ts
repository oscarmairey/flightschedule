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
    adminVirements: "Virements",
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
} as const;

export type Copy = typeof COPY;
