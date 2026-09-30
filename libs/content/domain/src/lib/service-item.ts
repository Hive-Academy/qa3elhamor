import type { Branded } from '@qa3elhamor/shared-domain';
import type { LocalizedText } from './localized-text.js';

export type ServiceItemId = Branded<'ServiceItem'>;

/** A service the owner offers, presented in-world as a menu item. */
export interface ServiceItem {
  readonly id: ServiceItemId;
  /** The playful in-world name, e.g. "Kelp Shake". */
  readonly menuName: LocalizedText;
  /** The real service name, e.g. "Performance audit". */
  readonly title: LocalizedText;
  readonly description: LocalizedText;
  /** Optional playful price tag, e.g. "3 sand dollars". Never a real price. */
  readonly price?: LocalizedText;
  readonly tags: readonly string[];
}
