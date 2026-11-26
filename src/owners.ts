import type { EventsOwner } from "@we-the-rebel-alliance/plugin-contract/events"

/**
 * What each alias's last probe or listing learned about the signed-in owner, for status. In memory only: status never
 * calls Atlassian, and a page always reads `atlassianUserInfo` itself, so a stale entry can label status but never an
 * event.
 */
export class OwnerCache {
  private readonly owners = new Map<string, EventsOwner>()

  get(alias: string): EventsOwner | undefined {
    return this.owners.get(alias)
  }

  set(alias: string, owner: EventsOwner): void {
    this.owners.set(alias, owner)
  }

  clear(alias?: string): void {
    if (alias === undefined) this.owners.clear()
    else this.owners.delete(alias)
  }
}
