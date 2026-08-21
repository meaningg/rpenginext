/**
 * Story template as shown in the catalog UI.
 */
export interface StoryTemplate {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly synopsis: string;
  readonly tags: readonly string[];
  readonly locale?: string;
}
