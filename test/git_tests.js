/* eslint-env mocha */

import assert from 'assert';
import path from 'path';
import { promisify } from 'util';
import shell from 'shelljs';
import fse from 'fs-extra';
import tmp from 'tmp';

import { currentBranch, getRawContent, resolveCommit } from '../lib/git.js';



const TEST_DIR_DEFAULT = path.resolve(__dirname, 'integration/default');

if (!shell.which('git')) {
  shell.echo('Sorry, this tests requires git');
  shell.exit(1);
}

const mkTmpDir = promisify(tmp.dir);

const initRepository = async dir => {
  const pwd = shell.pwd();
  shell.cd(dir);
  shell.exec('git init');
  shell.exec('mkdir sub');
  shell.exec(`mkdir ${path.join('sub', 'sub')}`);
  shell.touch(path.join('sub', 'sub', 'some_file.txt'));
  shell.exec('git add -A');
  shell.exec('git commit -m"initial commit."');

  // setup 'new_branch'
  shell.exec('git checkout -b new_branch');
  shell.touch('new_file.txt');
  shell.exec('git add .');
  shell.exec('git commit -m "new_branch commit"');

  // setup 'branch/with_slash'
  shell.exec('git checkout -b branch/with_slash');
  shell.touch('another_new_file.txt');
  shell.exec('git add .');
  shell.exec('git commit -m "new_branch commit"');

  // setup 'config' branch
  shell.exec('git checkout master');
  shell.exec('git checkout -b config');
  shell.touch('config_file.txt');
  shell.exec('git add .');
  shell.exec('git commit -m "new_branch commit"');

  shell.exec('git checkout master');
  shell.cd(pwd);
};

describe('Testing git.js', function suite() {
  this.timeout(10000);

  let testRepoRoot;
  let repoDir;

  before(async () => {
    // copy default repos to tmp dir and setup git repos
    testRepoRoot = await mkTmpDir();
    await fse.copy(TEST_DIR_DEFAULT, testRepoRoot);
    repoDir = path.resolve(testRepoRoot, 'owner1/repo1');
    await initRepository(repoDir);
  });

  after(() => {
    // cleanup: remove tmp repo root
    // Note: the async variant of remove hangs for some reason on windows
    fse.removeSync(testRepoRoot);
  });

  it('currentBranch', async () => {
    const branch = await currentBranch(repoDir);
    assert.strictEqual(branch, 'master');
  });

  it('resolveCommit', async () => {
    const commitSha = await resolveCommit(repoDir, 'master');
    let sha = await resolveCommit(repoDir, commitSha);
    assert.strictEqual(commitSha, sha);
    sha = await resolveCommit(repoDir, commitSha.substr(0, 7));
    assert.strictEqual(commitSha, sha);
  });

  it('getRawContent', async () => {
    const content = await getRawContent(repoDir, 'master', 'README.md', false);
    assert(content.length);
  });
});
