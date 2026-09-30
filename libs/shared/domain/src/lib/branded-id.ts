declare const brand: unique symbol;

/**
 * A nominal string id. `Branded<'Landmark'>` and `Branded<'Complaint'>` are both strings at
 * runtime but are not interchangeable at compile time, which stops the class of bug where a
 * landmark id is passed where a complaint id was meant.
 */
export type Branded<TBrand extends string> = string & {
  readonly [brand]: TBrand;
};

export const brandId = <TBrand extends string>(value: string): Branded<TBrand> =>
  value as Branded<TBrand>;
