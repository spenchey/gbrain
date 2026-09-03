const NULL_LIKE_ENTITY_TOKENS: ReadonlySet<string> = new Set([
  'null', 'undefined', 'none', 'n/a', 'nil', '-',
]);

/** True when an entity ref is absent or a null-like placeholder token. */
export function isNullLikeEntity(entity: string | null | undefined): boolean {
  if (entity == null) return true;
  const token = entity.trim().toLowerCase();
  return token === '' || NULL_LIKE_ENTITY_TOKENS.has(token);
}
