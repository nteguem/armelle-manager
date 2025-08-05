/**
 * Réponse du scraper DGI
 */
export interface ScraperResponse<T> {
  success: boolean
  message: string
  data: T | null
  type?: 'aucune' | 'unique' | 'multiple' | 'erreur'
}

export type TypeContribuable = 'personne_physique' | 'personne_morale'

export enum TaxpayerStatus {
  NOT_YET_CHECKED = 'not_yet_checked', // Pas encore vérifié avec la DGI
  VERIFIED_FOUND = 'verified_found', // Vérifié et trouvé dans la DGI
  VERIFIED_NOT_FOUND = 'verified_not_found', // Vérifié mais non trouvé dans la DGI
}

// Interface pour les données DGI
export interface TaxpayerData {
  niu?: string
  nomRaisonSociale: string
  prenomSigle?: string
  numeroCniRc?: string
  activite?: string
  etat?: string
  phoneNumber?: string
  dateNaissance?: string
  regime?: string
  centre?: string
}

// Interface pour les statistiques de taxpayer
export interface TaxpayerStats {
  nombreUtilisateurs: number
  derniereDGICheck: string | null
  typeAffichage: string
  statut: string
  statusDGI: string
}
