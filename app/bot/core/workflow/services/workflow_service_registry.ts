/**
 * Registry pour enregistrer et récupérer les services utilisables dans les workflows
 */
export class WorkflowServiceRegistry {
  private static instance: WorkflowServiceRegistry
  private services: Map<string, any> = new Map()

  private constructor() {}

  /**
   * Singleton
   */
  public static getInstance(): WorkflowServiceRegistry {
    if (!WorkflowServiceRegistry.instance) {
      WorkflowServiceRegistry.instance = new WorkflowServiceRegistry()
    }
    return WorkflowServiceRegistry.instance
  }

  /**
   * Enregistre un service
   */
  public register(name: string, service: any): void {
    if (this.services.has(name)) {
      console.warn(`Service ${name} is already registered, overwriting...`)
    }
    this.services.set(name, service)
    console.log(`✅ Service '${name}' registered`)
  }

  /**
   * Récupère un service
   */
  public get(name: string): any {
    const service = this.services.get(name)
    if (!service) {
      throw new Error(`Service ${name} not found in registry`)
    }
    return service
  }

  /**
   * Vérifie si un service existe
   */
  public has(name: string): boolean {
    return this.services.has(name)
  }

  /**
   * Récupère tous les services
   */
  public getAll(): Map<string, any> {
    return new Map(this.services)
  }

  /**
   * Vide le registry
   */
  public clear(): void {
    this.services.clear()
  }

  /**
   * Retourne les stats
   */
  public getStats(): { count: number; names: string[] } {
    return {
      count: this.services.size,
      names: Array.from(this.services.keys()),
    }
  }
}
