/**
 * Base for value objects: immutable, compared by structure rather than identity.
 *
 * Subclasses validate in a static factory returning `Result`, keeping the constructor
 * private so an invalid instance cannot be produced.
 */
export abstract class ValueObject<TProps extends object> {
  protected constructor(protected readonly props: Readonly<TProps>) {
    Object.freeze(this.props);
  }

  equals(other?: ValueObject<TProps>): boolean {
    if (other === undefined || other === null) return false;
    if (other.constructor !== this.constructor) return false;
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
