/* eslint-env mocha */

import path from 'path';
import assert from 'assert';
import { pathExists } from '../lib/utils';

describe('Testing utils.js', () => {
  it('case-sensitive path existence', async () => {
    const { dir, base } = path.parse(__filename);
    assert.ok(await pathExists(dir, base));
    assert.ok(!await pathExists(dir, base.toUpperCase()));
  });
});
