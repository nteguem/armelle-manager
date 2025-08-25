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
  centre: string
}
