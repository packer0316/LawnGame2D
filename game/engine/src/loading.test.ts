import { describe, expect, it } from 'vitest';
import { LoadingReporter, type LoadingProgress } from './loading';

describe('loading progress', () => {
  it('tracks partial downloads and never regresses when a batch grows or restarts', () => {
    const events: LoadingProgress[] = [];
    const reporter = new LoadingReporter(event => events.push(event));
    reporter.update('images', 20, 40, 1, 4, .375);
    reporter.update('images', 20, 40, 1, 8, .125);
    reporter.update('images', 20, 40, 0, 2);
    expect(events.map(event => event.percent)).toEqual([27, 27, 27]);
    expect(events[2]).toMatchObject({ loaded: 0, total: 2 });
  });

  it('reserves 100% for a playable scene, including empty or cached batches', () => {
    const events: LoadingProgress[] = [];
    const reporter = new LoadingReporter(event => events.push(event));
    reporter.update('cached', 85, 99);
    reporter.update('ready', 99, 100, 1, 1);
    expect(events.map(event => event.percent)).toEqual([85, 99]);
    reporter.complete();
    expect(events.at(-1)?.percent).toBe(100);
  });
});
