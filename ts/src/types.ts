/**
 * Discriminated-union type model for HN items. The `type` field is the literal
 * discriminator. Use `switch(item.type)` or `if (item.type === 'story')` to
 * narrow.
 *
 * @example
 * if (item.type === 'story') {
 *   console.log(item.title, item.score);
 * }
 */

export type ItemType = 'story' | 'comment' | 'job' | 'poll' | 'pollopt';

export interface BaseFields {
  readonly id: number;
  readonly by?: string;
  readonly time?: number;
  readonly dead?: boolean;
}

export interface Story extends BaseFields {
  readonly type: 'story';
  readonly title?: string;
  readonly score?: number;
  readonly descendants?: number;
  readonly url?: string;
  readonly text?: string;
  readonly kids?: readonly number[];
}

export interface Comment extends BaseFields {
  readonly type: 'comment';
  readonly parent?: number;
  readonly text?: string;
  readonly kids?: readonly number[];
}

export interface Job extends BaseFields {
  readonly type: 'job';
  readonly title?: string;
  readonly score?: number;
  readonly url?: string;
  readonly text?: string;
}

export interface Poll extends BaseFields {
  readonly type: 'poll';
  readonly title?: string;
  readonly score?: number;
  readonly descendants?: number;
  readonly parts: readonly number[];
  readonly text?: string;
  readonly kids?: readonly number[];
}

export interface PollOpt extends BaseFields {
  readonly type: 'pollopt';
  readonly poll: number;
  readonly score?: number;
  readonly text?: string;
}

export type Item = Story | Comment | Job | Poll | PollOpt;

export interface User {
  readonly id: string;
  readonly created: number;
  readonly karma: number;
  readonly about?: string;
  readonly submitted?: readonly number[];
}

export interface Updates {
  readonly items: readonly number[];
  readonly profiles: readonly string[];
}

export interface CommentTreeNode extends Comment {
  readonly replies: readonly CommentTreeNode[];
}
