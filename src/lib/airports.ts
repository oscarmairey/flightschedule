// FlySchedule — common French airports for the ICAO datalist on /flights/new.
//
// Static list of ~40 airfields a private pilot in France is likely to
// fly between. Used as `<datalist>` suggestions, not as validation —
// pilots may type any valid ICAO code (4 letters).
//
// Sourced manually from a recent VAC chart (2024). Add more on request.

export type Airport = {
  icao: string;
  name: string;
};

export const COMMON_AIRPORTS: Airport[] = [
  { icao: "LFPN", name: "Toussus-le-Noble" },
  { icao: "LFPB", name: "Paris – Le Bourget" },
  { icao: "LFPG", name: "Paris – Charles-de-Gaulle" },
  { icao: "LFPO", name: "Paris – Orly" },
  { icao: "LFPV", name: "Vélizy – Villacoublay" },
  { icao: "LFPT", name: "Pontoise – Cormeilles" },
  { icao: "LFPL", name: "Lognes – Émerainville" },
  { icao: "LFPM", name: "Melun – Villaroche" },
  { icao: "LFPK", name: "Coulommiers – Voisins" },
  { icao: "LFPC", name: "Creil" },
  { icao: "LFAQ", name: "Albert – Picardie" },
  { icao: "LFAT", name: "Le Touquet – Côte d'Opale" },
  { icao: "LFAY", name: "Amiens – Glisy" },
  { icao: "LFOD", name: "Saumur – Saint-Florent" },
  { icao: "LFOE", name: "Évreux – Fauville" },
  { icao: "LFOH", name: "Le Havre – Octeville" },
  { icao: "LFOJ", name: "Orléans – Bricy" },
  { icao: "LFOP", name: "Rouen – Vallée de Seine" },
  { icao: "LFOT", name: "Tours – Val de Loire" },
  { icao: "LFRB", name: "Brest – Bretagne" },
  { icao: "LFRD", name: "Dinard – Pleurtuit – Saint-Malo" },
  { icao: "LFRH", name: "Lorient – Lann-Bihoué" },
  { icao: "LFRK", name: "Caen – Carpiquet" },
  { icao: "LFRN", name: "Rennes – Saint-Jacques" },
  { icao: "LFRS", name: "Nantes – Atlantique" },
  { icao: "LFBA", name: "Agen – La Garenne" },
  { icao: "LFBD", name: "Bordeaux – Mérignac" },
  { icao: "LFBH", name: "La Rochelle – Île de Ré" },
  { icao: "LFBO", name: "Toulouse – Blagnac" },
  { icao: "LFBP", name: "Pau – Pyrénées" },
  { icao: "LFLY", name: "Lyon – Bron" },
  { icao: "LFLL", name: "Lyon – Saint-Exupéry" },
  { icao: "LFMD", name: "Cannes – Mandelieu" },
  { icao: "LFMN", name: "Nice – Côte d'Azur" },
  { icao: "LFMP", name: "Perpignan – Rivesaltes" },
  { icao: "LFMT", name: "Montpellier – Méditerranée" },
  { icao: "LFKJ", name: "Ajaccio – Napoléon-Bonaparte" },
  { icao: "LFKB", name: "Bastia – Poretta" },
  { icao: "LFSB", name: "Bâle – Mulhouse" },
  { icao: "LFST", name: "Strasbourg – Entzheim" },
];
