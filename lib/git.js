import fs from 'fs';
import fse from 'fs-extra';
import isogit from 'isomorphic-git';
import { join as joinPaths, resolve as resolvePath } from 'path';
import { PassThrough } from 'stream';
import { pathExists } from './utils';

/**
 * Various helper functions for reading git meta-data and content
 */

/**
 * Returns the name (abbreviated form) of the currently checked out branch.
 *
 * @param {string} dir git repo path
 * @returns {Promise<string>} name of the currently checked out branch
 */
export const currentBranch = async dir => isogit.currentBranch({ fs, dir, fullname: false });

/**
 * Parses Github url path subsegment `<ref>/<filePath>` (e.g. `master/some/file.txt`
 * or `some/branch/some/file.txt`) and returns an `{ ref, fpath }` object.
 *
 * Issue #53: Handle branch names containing '/' (e.g. 'foo/bar')
 *
 * @param {string} dir git repo path
 * @param {string} refPathName path including reference (branch or tag) and file path
 *                             (e.g. `master/some/file.txt` or `some/branch/some/file.txt`)
 * @returns {Promise<object>} an `{ ref, pathName }` object or `undefined` if the ref cannot
 *                            be resolved to an existing branch or tag.
 */
export const determineRefPathName =
  async (dir, refPathName) => {
    const branches = await isogit.listBranches({ fs, dir });
    const tags = await isogit.listTags({ fs, dir });
    const refs = branches.concat(tags);
    // find matching refs
    const matchingRefs = refs.filter((ref) => refPathName.startsWith(`${ref}/`));
    if (!matchingRefs.length) {
      return undefined;
    }
    // find longest matching ref
    const matchingRef = matchingRefs.reduce((a, b) => ((b.length > a.length) ? b : a));
    return {
      ref: matchingRef,
      pathName: refPathName.substr(matchingRef.length)
    };
  };

/**
 * Determines whether the specified reference is currently checked out in the working dir.
 *
 * @param {string} dir git repo path
 * @param {string} ref reference (branch or tag)
 * @returns {Promise<boolean>} `true` if the specified reference is checked out
 */
export const isCheckedOut = async (dir, ref) => {
  let oidCurrent;
  try {
    oidCurrent = await isogit.resolveRef({ fs, dir, ref: 'HEAD' })
    const oid = await isogit.resolveRef({ fs, dir, ref });
    return oidCurrent === oid
  }
  catch (e) {
    return false
  }
};

/**
 * Returns the commit oid of the curent commit referenced by `ref`
 *
 * @param {string} dir git repo path
 * @param {string} ref reference (branch, tag or commit sha)
 * @returns {Promise<string>} commit oid of the curent commit referenced by `ref`
 * @throws {NotFoundError}: invalid reference
 */
export const resolveCommit =
  async (dir, ref) => {
    try {
      return  await isogit.resolveRef({ fs, dir, ref })
    } catch (err) {
      if (err instanceof isogit.Errors.NotFoundError) {
        // fallback: is ref a shortened oid prefix?
        try{
          const oid = await isogit.expandOid({ fs, dir, oid: ref });
          return isogit.resolveRef({ fs, dir, ref: oid });
        } catch {
          throw err;
        }
      }
      // re-throw
      throw err;
    }
  };

/**
 * Returns the blob oid of the file at revision `ref` and `pathName`
 *
 * @param {string} dir git repo path
 * @param {string} ref reference (branch, tag or commit sha)
 * @param {string} filePath relative path to file
 * @param {boolean} includeUncommitted include uncommitted changes in working dir
 * @returns {Promise<string>} blob oid of specified file
 * @throws {NotFoundError}: resource not found or invalid reference
 */
export const resolveBlob =
  async (dir, ref, pathName, includeUncommitted) => {
    const commitSha = await resolveCommit(dir, ref);

    // project-helix/#150: check for uncommitted local changes
    // project-helix/#183: serve newly created uncommitted files
    // project-helix/#187: only serve uncommitted content if currently
    //                     checked-out and requested refs match

    if (!includeUncommitted) {
      return (await isogit.readObject({ fs, dir, oid: commitSha, filepath: pathName, })).oid;
    }
    // check working dir status
    const status = await isogit.status({ fs, dir, filepath: pathName });
    if (status.endsWith('unmodified')) {
      return (await isogit.readObject({ fs, dir, oid: commitSha, filepath: pathName, })).oid;
    }
    if (status.endsWith('absent') || status.endsWith('deleted')) {
      throw new isogit.Errors.NotFoundError(pathName);
    }
    // temporary workaround for https://github.com/isomorphic-git/isomorphic-git/issues/752
    // => remove once isomorphic-git #252 is fixed
    if (status.endsWith('added') && !await pathExists(dir, pathName)) {
      throw new isogit.Errors.NotFoundError(pathName);
    }
    // return blob id representing working dir file
    const content = await fse.readFile(resolvePath(dir, pathName));
    return isogit.writeBlob({ fs, dir, blob: content, });
};

/**
 * Returns the contents of the file at revision `ref` and `pathName`
 *
 * @param {string} dir git repo path
 * @param {string} ref reference (branch, tag or commit sha)
 * @param {string} filePath relative path to file
 * @param {boolean} includeUncommitted include uncommitted changes in working dir
 * @returns {Promise<Buffer>} content of specified file
 * @throws {NotFoundError}: resource not found or invalid reference
 */
export const getRawContent =
  async (dir, ref, pathName, includeUncommitted) =>{
    const oid = await resolveBlob(dir, ref, pathName, includeUncommitted)
    return (await isogit.readObject({ fs, dir, oid, format: 'content', })).object
  }
/**
 * Returns a stream for reading the specified blob.
 *
 * @param {string} dir git repo path
 * @param {string} oid blob sha1
 * @returns {Promise<Stream>} readable Stream instance
 */
export const createBlobReadStream =
  async (dir, oid) => {
    const { object: content } = await isogit.readObject({ fs, dir, oid });
    const stream = new PassThrough();
    stream.end(content);
    return stream;
  };

/**
 * Retrieves the specified object from the loose object store.
 *
 * @param {string} dir git repo path
 * @param {string} oid object id
 * @returns {Promise<Object>} object identified by `oid`
 */
export const getObject =
  async (dir, oid) => isogit.readObject({ fs, dir, oid });

/**
 * Checks if the specified string is a valid SHA-1 value.
 *
 * @param {string} str
 * @returns {boolean} `true` if `str` represents a valid SHA-1, otherwise `false`
 */
export const isValidSha = str => {
  if (typeof str === 'string' && str.length === 40) {
    const res = str.match(/[0-9a-f]/g);
    return res && res.length === 40;
  }
  return false;
};

/**
 * Returns the tree object identified directly by its sha
 * or indirectly via reference (branch, tag or commit sha)
 *
 * @param {string} dir git repo path
 * @param {string} refOrSha either tree sha or reference (branch, tag or commit sha)
 * @returns {Promise<string>} commit oid of the curent commit referenced by `ref`
 * @throws {NotFoundError}: not found or invalid reference
 */
export const resolveTree =
  async (dir, refOrSha) => {
    let oid;
    if (isValidSha(refOrSha)) {
      oid = refOrSha;
    } else {
      // not a full sha: ref or shortened oid prefix?
      try {
        oid = await isogit.resolveRef({ fs, dir, ref: refOrSha });
      } catch (err) {
        if (err instanceof isogit.Errors.NotFoundError) {
          // fallback: is ref a shortened oid prefix?
          oid = await isogit.expandOid({ fs, dir, oid: refOrSha })
            .catch(() => {
              throw err;
            });
        } else {
          // re-throw
          throw err;
        }
      }
    }

    // resolved oid
    const obj = await isogit.readObject({ fs, dir, oid })
    if (obj.type === 'tree') return obj;
    if (obj.type === 'commit') return isogit.readObject({ fs, dir, oid: obj.object.tree });
    throw new isogit.Errors.ObjectTypeError(oid, 'tree|commit', obj.type);
  };

/**
 * Returns a commit log, i.e. an array of commits in reverse chronological order.
 *
 * @param {string} dir isogit repo path
 * @param {string} ref reference (branch, tag or commit sha)
 * @param {string} path only commits containing this file path will be returned
 * @throws {NotFoundError}: not found or invalid reference
 */
export const commitLog =
  async (dir, ref, path) => {
    const commits =
      await isogit.log({ fs, dir, ref, path, })
        .catch(async err => {
          if (err instanceof isogit.Errors.NotFoundError) {
            // fallback: is ref a shortened oid prefix?
            const oid = await isogit.expandOid({ fs, dir, oid: ref })
              .catch(() => {
                throw err
              })
            return isogit.log({ fs, dir, ref: oid, path, })
          }
          // re-throw
          throw err
        })

    if (typeof path === 'string' && path.length) {
      // filter by path
      let lastSHA = null
      let lastCommit = null
      const filteredCommits = []
      for (let i = 0; i < commits.length; i += 1) {
        const c = commits[i]
        /* eslint-disable no-await-in-loop */
        try {
          const o = await isogit.readObject({ fs, dir, oid: c.oid, filepath: path, })
          if (i === commits.length - 1) {
            // file already existed in first commit
            filteredCommits.push(c)
            break
          }
          if (o.oid !== lastSHA) {
            if (lastSHA !== null) {
              filteredCommits.push(lastCommit)
            }
            lastSHA = o.oid
          }
        } catch (err) {
          if (lastCommit) {
            // file no longer there
            filteredCommits.push(lastCommit)
          }
          break
        }
        lastCommit = c
      }
      // filtered commits
      return filteredCommits.map((c) => ({ oid: c.oid, ...c.commit }))
    }
    // unfiltered commits
    return commits.map((c) => ({ oid: c.oid, ...c.commit }))
  };

/**
 * Recursively collects all tree entries (blobs and trees).
 *
 * @param {string} repPath git repository path
 * @param {Array<object>} entries git tree entries to process
 * @param {Array<object>} result array where tree entries will be collected
 * @param {string} treePath path of specified tree (will be prepended to child entries)
 * @param {boolean} deep recurse into subtrees?
 * @returns {Promise<Array<object>>} collected entries
 */
export const collectTreeEntries =
  async (repPath, entries, result, treePath, deep = true) => {
    const items = await Promise.all(
      entries.map(
        async ({oid, type, mode, path, }) => ({ oid, type, mode, path: joinPaths(treePath, path), })
      )
    );
    result.push(...items);
    if (deep) {
      // recurse into subtrees
      const treeItems = items.filter((item) => item.type === 'tree');
      for (const { oid, path } of treeItems) {
        /* eslint-disable no-await-in-loop */
        const { object: subTreeEntries } = await getObject(repPath, oid);
        await collectTreeEntries(repPath, subTreeEntries, result, path, deep);
      }
    }
    return result;
  };

export const NotFoundError= isogit.Errors.NotFoundError
export const ObjectTypeError = isogit.Errors.ObjectTypeError
