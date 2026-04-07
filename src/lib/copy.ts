// CAVOK — French copy single source of truth.
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
    name: "CAVOK",
    tagline: "Glass Cockpit – F-GBQA",
  },

  common: {
    appName: "CAVOK",
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
    calendar: "Calendrier",
    newFlight: "Saisie de vol",
    myFlights: "Mes vols",
    account: "Mon compte",
    admin: "Administration",
    adminFlights: "Validation",
    adminPilots: "Pilotes",
    adminAvailability: "Disponibilités",
    adminCalendar: "Calendrier admin",
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
      "Bienvenue sur CAVOK. Choisissez un mot de passe pour sécuriser votre compte.",
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
    welcome: "Bienvenue,",
    adminBadge: "Administrateur",
    balanceLabel: "Solde HDV",
    buyHdv: "Acheter des HDV",
    book: "Réserver",
    logFlight: "Saisir un vol",
    recentFlights: "Vols récents",
    recentTransactions: "Mouvements récents",
    placeholder:
      "Le tableau de bord pilote sera enrichi prochainement (PRD §3.4).",
  },

  account: {
    title: "Mon compte",
    subtitle: "Solde HDV, achat de forfaits, historique des mouvements",
    packages: "Forfaits HDV",
    pkgVatNote: "TVA 20 % appliquée à la caisse.",
    buy: "Acheter",
    transactions: "Historique des mouvements",
    transactionsEmpty: "Aucun mouvement pour le moment.",
    pkgUnavailable: "Bientôt disponible",
    successTitle: "Paiement validé",
    successBody: "Votre solde HDV a été mis à jour.",
    successPending:
      "Mise à jour en cours, rafraîchissez dans quelques secondes si le solde n'apparaît pas encore.",
    backToDashboard: "Retour au tableau de bord",
    cancelTitle: "Paiement annulé",
    cancelBody: "Vous pouvez réessayer à tout moment.",
    backToAccount: "Retour au compte",
  },

  txTypes: {
    PACKAGE_PURCHASE: "Achat HDV",
    RESERVATION_DEBIT: "Réservation",
    CANCELLATION_REFUND: "Remboursement",
    FLIGHT_RECONCILIATION: "Réconciliation vol",
    ADMIN_ADJUSTMENT: "Ajustement administrateur",
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
