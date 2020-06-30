
/* eslint-disable no-underscore-dangle */

import path from 'path';

import fse from 'fs-extra';

/**
 * Resolves the file system path of the specified repository.
 *
 * @param {object} options configuration hash
 * @param {string} owner github org or user
 * @param {string} repo repository name
 */
export const resolveRepositoryPath = (options, owner, repo) => {
  let repPath = path.resolve(options.repoRoot, owner, repo);

  if (options.virtualRepos[owner] && options.virtualRepos[owner][repo]) {
    repPath = path.resolve(options.virtualRepos[owner][repo].path);
  }
  return repPath;
};

let _caseInsensitiveFS = undefined;

/**
 * Returns true if the file system where the current executable was
 * started from is case-insensitive, otherwise returns false.
 */
export const isCaseInsensitiveFS = async () => {
  if (typeof _caseInsensitiveFS === 'undefined') {
    let lcStat;
    let ucStat;
    try {
      lcStat = await fse.stat(process.execPath.toLowerCase());
    } catch (err) {
      lcStat = false;
    }
    try {
      ucStat = await fse.stat(process.execPath.toUpperCase());
    } catch (err) {
      ucStat = false;
    }
    if (lcStat && ucStat) {
      _caseInsensitiveFS = lcStat.dev === ucStat.dev && lcStat.ino === ucStat.ino;
    } else {
      _caseInsensitiveFS = false;
    }
  }
  return _caseInsensitiveFS;
};

/**
 * Test whether or not a file system entry exists at `pathToTest` with the same case as specified.
 *
 * @param {string} parentDir parent directory where `pathToTest` is rooted
 * @param {string} pathToTest relative path with segements separated by `/`
 */
export const pathExists = async (parentDir, pathToTest) => {
  if (!await isCaseInsensitiveFS()) {
    return fse.pathExists(path.join(parentDir, pathToTest));
  }

  let parent = parentDir;

  // pathToTest is using `/` for separating segments
  const names = pathToTest.split('/').filter((el) => el !== '');
  for (let i = 0; i < names.length; i += 1) {
    const nm = names[i];
    try {
      // eslint-disable-next-line no-await-in-loop
      if (!(await fse.readdir(parent)).filter((el) => el === nm).length) {
        return false;
      }
    } catch (err) {
      return false;
    }
    parent = path.join(parent, nm);
  }
  return true;
};
